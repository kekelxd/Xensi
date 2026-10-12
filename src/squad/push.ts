import { getSupabaseClient } from '../supabaseClient'
import { withBasePath } from '../routes'

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

const vapidKey = () => (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!vapidKey()

const keyBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
const b64 = (buf: ArrayBuffer | null) => buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''
const register = () => navigator.serviceWorker.register(withBasePath('sw.js'), { scope: withBasePath('') })

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
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey()!) })
  const { error } = await client.rpc('xensi_push_subscribe', { p_endpoint: sub.endpoint, p_p256dh: b64(sub.getKey('p256dh')), p_auth: b64(sub.getKey('auth')), p_lang: lang })
  if (error) { await sub.unsubscribe(); throw new Error(error.message.match(/lfg_[a-z_]+/)?.[0] ?? 'lfg_network') }
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration(withBasePath(''))
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await getSupabaseClient()?.rpc('xensi_push_unsubscribe', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  }
  return 'off'
}
