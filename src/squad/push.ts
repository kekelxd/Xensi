import { getSupabaseClient } from '../supabaseClient'
import { withBasePath } from '../routes'

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

const vapidKey = () => (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
export type PushBlocker = 'no-key' | 'no-service-worker' | 'no-push' | 'no-notification' | 'insecure'
export const pushBlocker = (): PushBlocker | null =>
  !vapidKey() ? 'no-key' : !window.isSecureContext ? 'insecure' : !('serviceWorker' in navigator) ? 'no-service-worker' : !('PushManager' in window) ? 'no-push' : !('Notification' in window) ? 'no-notification' : null
export const pushSupported = () => typeof window !== 'undefined' && pushBlocker() === null

const keyBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
const b64 = (buf: ArrayBuffer | null) => buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''
const register = () => navigator.serviceWorker.register(withBasePath('sw.js'), { scope: withBasePath('') })

/** True when a local subscription was made with a different VAPID key than the one the app now uses. */
export function vapidKeyMismatch(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) return true
  const a = new Uint8Array(current)
  return a.length !== expected.length || a.some((byte, i) => byte !== expected[i])
}

const saveSubscription = async (sub: PushSubscription, lang: 'pt' | 'en') => {
  const { error } = await getSupabaseClient()!.rpc('xensi_push_subscribe', { p_endpoint: sub.endpoint, p_p256dh: b64(sub.getKey('p256dh')), p_auth: b64(sub.getKey('auth')), p_lang: lang })
  return error ? (error.message.match(/lfg_[a-z_]+/)?.[0] ?? 'lfg_network') : null
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration(withBasePath(''))
  return (await reg?.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enablePush(lang: 'pt' | 'en'): Promise<PushState> {
  const client = getSupabaseClient()
  if (!client || !pushSupported()) return 'unsupported'
  if (await Notification.requestPermission() !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off'
  await register()
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  try { sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey()!) }) }
  catch (e) { throw new Error(e instanceof DOMException && e.name === 'AbortError' ? 'push_service' : 'push_failed') }
  const failure = await saveSubscription(sub, lang)
  if (failure) { await sub.unsubscribe(); throw new Error(failure) }
  return 'on'
}

let resyncing: Promise<void> | null = null
/**
 * Re-registers this browser's existing subscription on the server (idempotent upsert), because the delivery
 * function deletes rows on 401/403/404/410. Never asks for permission or creates a subscription, except to
 * replace one made with a stale VAPID key. Concurrent calls share one run.
 */
export function resyncPush(lang: 'pt' | 'en'): Promise<void> {
  return resyncing ??= (async () => {
    if (!getSupabaseClient() || !pushSupported() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration(withBasePath(''))
    let sub = await reg?.pushManager.getSubscription()
    if (!reg || !sub) return
    const expected = keyBytes(vapidKey()!)
    if (vapidKeyMismatch(sub.options.applicationServerKey, expected)) {
      const stale = sub.endpoint
      await getSupabaseClient()!.rpc('xensi_push_unsubscribe', { p_endpoint: stale })
      await sub.unsubscribe()
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected })
    }
    const failure = await saveSubscription(sub, lang)
    if (failure && failure !== 'lfg_ineligible' && failure !== 'lfg_auth') throw new Error(failure)
  })().finally(() => { resyncing = null })
}

export async function disablePush(): Promise<PushState> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'off'
  const reg = await navigator.serviceWorker.getRegistration(withBasePath(''))
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await getSupabaseClient()?.rpc('xensi_push_unsubscribe', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  }
  return 'off'
}
