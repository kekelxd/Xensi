import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { DEFAULT_AVATAR, isAvatarId, type AvatarId } from './avatars'
import { readPlayerProfile, writePlayerProfile } from './playerProfileStore'
import { getSupabaseClient, hasSupabaseClient } from './supabaseClient'
import { authRoutePath } from './routes'

export type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'auth-callback'
export type AuthStatus = 'idle' | 'loading' | 'error' | 'success'
export type AuthProfile = {
  nickname: string
  avatarId: AvatarId
}
export type AuthSessionState =
  | { status: 'loading'; userId: null; profile: null }
  | { status: 'anonymous'; userId: null; profile: null }
  | { status: 'authenticated'; userId: string; profile: AuthProfile }

export type AuthLocale = 'pt-BR' | 'en-US'
export type AuthErrorCode =
  | 'auth_unconfigured'
  | 'missing_login_fields'
  | 'missing_email'
  | 'missing_signup_fields'
  | 'missing_password'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_already_registered'
  | 'nickname_unavailable'
  | 'nickname_check_failed'
  | 'generic'

export type AuthResult = {
  ok: true
} | {
  ok: false
  code: AuthErrorCode
  message?: string
}

const profileFallback: AuthProfile = { nickname: 'xensi_dev', avatarId: DEFAULT_AVATAR }
const authStorageKeys = ['xensi-auth-user-id', 'xensi-user-id', 'xensi-auth-user', 'xensi-current-user']

let cachedState: AuthSessionState = { status: 'loading', userId: null, profile: null }
let initialized = false
let initPromise: Promise<AuthSessionState> | null = null
let authGeneration = 0

declare global {
  interface Window {
    __XENSI_CURRENT_USER_ID__?: string | null
  }
}

export function hasConfiguredAuthProvider() {
  return hasSupabaseClient()
}

function emitAuthUpdate() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('xensi-auth-updated'))
}

function clearRuntimeUser() {
  if (typeof window === 'undefined') return
  window.__XENSI_CURRENT_USER_ID__ = null
  for (const key of authStorageKeys) window.localStorage.removeItem(key)
}

function setRuntimeUser(user: User) {
  if (typeof window === 'undefined') return
  window.__XENSI_CURRENT_USER_ID__ = user.id
  window.localStorage.setItem('xensi-auth-user-id', user.id)
  window.localStorage.setItem('xensi-auth-user', JSON.stringify({ id: user.id, email: user.email ?? null }))
}

function toProfile(row: { nickname?: unknown; avatar_id?: unknown } | null): AuthProfile {
  const nickname = typeof row?.nickname === 'string' && row.nickname.trim() ? row.nickname.trim() : profileFallback.nickname
  const avatarId = isAvatarId(row?.avatar_id) ? row.avatar_id : profileFallback.avatarId
  return { nickname, avatarId }
}

function syncProfileToGuestStore(profile: AuthProfile) {
  if (typeof window === 'undefined') return
  const current = readPlayerProfile(window.localStorage)
  writePlayerProfile(window.localStorage, { ...current, nickname: profile.nickname, avatarId: profile.avatarId })
}

async function loadProfile(userId: string): Promise<AuthProfile> {
  const supabase = getSupabaseClient()
  if (!supabase) return profileFallback
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, avatar_id')
    .eq('id', userId)
    .maybeSingle()
  if (error) return profileFallback
  const profile = toProfile(data)
  return profile
}

async function refreshAuthState(session?: Session | null) {
  const generation = ++authGeneration
  // Invalidate private consumers synchronously, before any profile/network await.
  cachedState = { status: session === null ? 'anonymous' : 'loading', userId: null, profile: null }
  clearRuntimeUser()
  emitAuthUpdate()
  const supabase = getSupabaseClient()
  if (!supabase) {
    cachedState = { status: 'anonymous', userId: null, profile: null }
    clearRuntimeUser()
    emitAuthUpdate()
    return cachedState
  }

  const targetSession = session === undefined ? (await supabase.auth.getSession()).data.session : session
  if (generation !== authGeneration) return cachedState
  if (!targetSession?.user || (targetSession.expires_at !== undefined && targetSession.expires_at <= Date.now() / 1000)) {
    cachedState = { status: 'anonymous', userId: null, profile: null }
    emitAuthUpdate()
    return cachedState
  }
  const profile = await loadProfile(targetSession.user.id)
  if (generation !== authGeneration) return cachedState
  setRuntimeUser(targetSession.user)
  syncProfileToGuestStore(profile)
  cachedState = { status: 'authenticated', userId: targetSession.user.id, profile }
  emitAuthUpdate()
  return cachedState
}

function handleAuthEvent(event: AuthChangeEvent, session: Session | null) {
  void refreshAuthState(session)
  if (event === 'PASSWORD_RECOVERY' && typeof window !== 'undefined') {
    window.history.replaceState({}, '', '/reset-password')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

export function initializeAuth() {
  if (initialized) return initPromise ?? Promise.resolve(cachedState)
  initialized = true
  const supabase = getSupabaseClient()
  if (!supabase) {
    cachedState = { status: 'anonymous', userId: null, profile: null }
    clearRuntimeUser()
    emitAuthUpdate()
    initPromise = Promise.resolve(cachedState)
    return initPromise
  }

  supabase.auth.onAuthStateChange(handleAuthEvent)
  initPromise = refreshAuthState()
  return initPromise
}

export function readAuthSessionState(): AuthSessionState {
  if (!initialized) void initializeAuth()
  return cachedState
}

function authUnavailable(): AuthResult {
  return { ok: false, code: 'auth_unconfigured' }
}

function authErrorCode(error: { message?: string } | null): AuthErrorCode {
  if (!error?.message) return 'generic'
  if (/invalid login credentials/i.test(error.message)) return 'invalid_credentials'
  if (/email not confirmed/i.test(error.message)) return 'email_not_confirmed'
  if (/user already registered/i.test(error.message)) return 'email_already_registered'
  if (/database error saving new user|duplicate key|profiles_nickname_unique_ci_idx|nickname/i.test(error.message)) return 'nickname_unavailable'
  return 'generic'
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.trim()
  if (!cleanEmail || !password) return { ok: false, code: 'missing_login_fields' }
  const supabase = getSupabaseClient()
  if (!supabase) return authUnavailable()

  const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
  if (error) return { ok: false, code: authErrorCode(error), message: error.message }
  await refreshAuthState(data.session)
  return { ok: true }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const cleanEmail = email.trim()
  if (!cleanEmail) return { ok: false, code: 'missing_email' }
  const supabase = getSupabaseClient()
  if (!supabase) return authUnavailable()

  const redirectTo = `${window.location.origin}${authRoutePath('reset-password')}`
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo })
  return error ? { ok: false, code: authErrorCode(error), message: error.message } : { ok: true }
}

export async function checkNicknameAvailability(nickname: string): Promise<{ ok: true; available: boolean } | { ok: false; code: AuthErrorCode; message?: string }> {
  const cleanNickname = nickname.trim()
  if (cleanNickname.length < 3 || cleanNickname.length > 24) return { ok: true, available: false }
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, code: 'auth_unconfigured' }

  const { data, error } = await supabase.rpc('is_nickname_available', { candidate: cleanNickname })
  if (error) return { ok: false, code: 'nickname_check_failed', message: error.message }
  return { ok: true, available: data === true }
}

export async function resendSignupConfirmation(email: string): Promise<AuthResult> {
  const cleanEmail = email.trim()
  if (!cleanEmail) return { ok: false, code: 'missing_email' }
  const supabase = getSupabaseClient()
  if (!supabase) return authUnavailable()

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: cleanEmail,
    options: { emailRedirectTo: `${window.location.origin}${authRoutePath('auth-callback')}` },
  })
  return error ? { ok: false, code: authErrorCode(error), message: error.message } : { ok: true }
}

export async function registerWithEmail(email: string, password: string, nickname: string, locale: AuthLocale): Promise<AuthResult> {
  const cleanEmail = email.trim()
  const cleanNickname = nickname.trim()
  if (!cleanEmail || !password || !cleanNickname) return { ok: false, code: 'missing_signup_fields' }
  const supabase = getSupabaseClient()
  if (!supabase) return authUnavailable()

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: { nickname: cleanNickname, locale },
      emailRedirectTo: `${window.location.origin}${authRoutePath('auth-callback')}`,
    },
  })
  if (error) return { ok: false, code: authErrorCode(error), message: error.message }
  if (data.session) await refreshAuthState(data.session)
  return { ok: true }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (!password) return { ok: false, code: 'missing_password' }
  const supabase = getSupabaseClient()
  if (!supabase) return authUnavailable()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, code: authErrorCode(error), message: error.message }
  await refreshAuthState()
  return { ok: true }
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient()
  if (!supabase) return authUnavailable()
  const generation = ++authGeneration
  cachedState = { status: 'anonymous', userId: null, profile: null }
  clearRuntimeUser()
  emitAuthUpdate()
  const { error } = await supabase.auth.signOut()
  if (error) return { ok: false, code: authErrorCode(error), message: error.message }
  if (generation !== authGeneration) return { ok: true }
  cachedState = { status: 'anonymous', userId: null, profile: null }
  clearRuntimeUser()
  emitAuthUpdate()
  return { ok: true }
}

export async function updateAuthenticatedProfile(profile: AuthProfile): Promise<AuthResult> {
  const state = readAuthSessionState()
  const generation = authGeneration
  const supabase = getSupabaseClient()
  if (!supabase || state.status !== 'authenticated') return { ok: true }
  const { error } = await supabase
    .from('profiles')
    .update({ nickname: profile.nickname, avatar_id: profile.avatarId })
    .eq('id', state.userId)
  if (error) return { ok: false, code: authErrorCode(error), message: error.message }
  if (generation !== authGeneration || cachedState.userId !== state.userId) return { ok: true }
  cachedState = { ...state, profile }
  syncProfileToGuestStore(profile)
  emitAuthUpdate()
  return { ok: true }
}

export function clearAuthProfileCacheForTests() {
  authGeneration++
  cachedState = { status: 'loading', userId: null, profile: null }
  initialized = false
  initPromise = null
}
