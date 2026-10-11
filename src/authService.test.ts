import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
const mock = vi.hoisted(() => ({
 getSession: vi.fn(), profile: vi.fn(), update: vi.fn(), signOut: vi.fn(), write: vi.fn(),
 callback: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
}))
vi.mock('./supabaseClient', () => ({
 hasSupabaseClient: () => true,
 getSupabaseClient: () => ({
  auth: { getSession: mock.getSession, signOut: mock.signOut, onAuthStateChange: (fn: typeof mock.callback) => { mock.callback = fn } },
  from: () => ({
   select: () => ({ eq: () => ({ maybeSingle: mock.profile }) }),
   update: () => ({ eq: mock.update }),
  }),
 }),
}))
vi.mock('./playerProfileStore', () => ({ readPlayerProfile: () => ({}), writePlayerProfile: mock.write }))
import { clearAuthProfileCacheForTests, initializeAuth, readAuthSessionState, signOut, updateAuthenticatedProfile } from './authService'
const session = (id: string, expires_at = Math.floor(Date.now()/1000)+3600) => ({ user: { id, email: 'fixture@example.invalid' }, expires_at }) as Session
const row = (nickname: string) => ({ data: { nickname, avatar_id: 'cat-happy' }, error: null })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return {promise,resolve} }
const settle = async () => { for(let i=0;i<8;i++) await Promise.resolve() }
describe('Auth generation protects Squad private workspace', () => {
 beforeEach(async () => {
  vi.clearAllMocks(); clearAuthProfileCacheForTests()
  const events = new EventTarget(), storage = new Map<string,string>()
  vi.stubGlobal('window', { dispatchEvent: events.dispatchEvent.bind(events), localStorage: { getItem: (k:string) => storage.get(k), setItem: (k:string,v:string) => storage.set(k,v), removeItem: (k:string) => storage.delete(k) } })
  mock.getSession.mockResolvedValue({data:{session:null}})
  mock.signOut.mockResolvedValue({error:null})
  mock.profile.mockResolvedValue(row('Current'))
  mock.update.mockResolvedValue({error:null})
  await initializeAuth()
 })
 it('delayed old profile cannot resurrect a signed-out user or write guest storage', async () => {
  const old = deferred<ReturnType<typeof row>>(); mock.profile.mockReturnValueOnce(old.promise)
  mock.callback!('SIGNED_IN',session('A'))
  expect(readAuthSessionState().status).toBe('loading')
  mock.callback!('SIGNED_OUT',null)
  old.resolve(row('Previous account')); await settle()
  expect(readAuthSessionState().status).toBe('anonymous');expect(mock.write).not.toHaveBeenCalled()
 })
 it('account switch clears private identity before profile await and rejects prior completion', async () => {
  mock.callback!('SIGNED_IN',session('A'));await settle()
  expect(readAuthSessionState().userId).toBe('A')
  const next = deferred<ReturnType<typeof row>>();mock.profile.mockReturnValueOnce(next.promise)
  mock.callback!('SIGNED_IN',session('B'))
  expect(readAuthSessionState()).toEqual({status:'loading',userId:null,profile:null})
  mock.callback!('SIGNED_OUT',null);next.resolve(row('B'));await settle()
  expect(readAuthSessionState().userId).toBeNull()
 })
 it('later account wins when profiles finish in reverse order', async () => {
  const a=deferred<ReturnType<typeof row>>(),b=deferred<ReturnType<typeof row>>()
  mock.profile.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  mock.callback!('SIGNED_IN',session('A'));mock.callback!('SIGNED_IN',session('B'))
  b.resolve(row('B'));await settle();a.resolve(row('A'));await settle()
  expect(readAuthSessionState().userId).toBe('B');expect(mock.write).toHaveBeenCalledTimes(1)
 })
 it('profile update response cannot restore an account after logout', async () => {
  mock.callback!('SIGNED_IN',session('A'));await settle();mock.write.mockClear()
  const update=deferred<{error:null}>();mock.update.mockReturnValueOnce(update.promise)
  const pending=updateAuthenticatedProfile({nickname:'Old account edit',avatarId:'cat-happy'})
  await signOut();update.resolve({error:null});await pending
  expect(readAuthSessionState().status).toBe('anonymous');expect(mock.write).not.toHaveBeenCalled()
 })
 it('token refresh keeps account only after fresh profile completion; expired session fails closed', async () => {
  mock.callback!('TOKEN_REFRESHED',session('A'));await settle()
  expect(readAuthSessionState().userId).toBe('A')
  mock.callback!('TOKEN_REFRESHED',session('A',0));await settle()
  expect(readAuthSessionState().status).toBe('anonymous')
 })
 it('logout clears private identity while network signout is still pending', async () => {
  mock.callback!('SIGNED_IN',session('A'));await settle()
  const request=deferred<{error:null}>();mock.signOut.mockReturnValueOnce(request.promise)
  const pending=signOut();expect(readAuthSessionState().status).toBe('anonymous')
  request.resolve({error:null});await pending
 })
})
