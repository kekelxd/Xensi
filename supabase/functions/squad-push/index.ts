// Delivers Squad Finder Web Push. Called only by the lfg_private.push_dispatch trigger (pg_net).
// Secrets: PUSH_SHARED_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const copy = {
  new_request: { pt: ['Nova solicitação na sua sala', 'Alguém quer entrar. Abra para aprovar ou recusar.', 'squad/my-room'], en: ['New request for your room', 'Someone wants to join. Open to approve or decline.', 'squad/my-room'] },
  request_accepted: { pt: ['Entrada aprovada!', 'Toque para ver o Discord do anfitrião.', 'squad/requests'], en: ['You were approved!', 'Tap to see the host’s Discord.', 'squad/requests'] },
} as const

// Mirrors lfg_private.push_endpoint_ok (defence in depth against SSRF through stored endpoints).
const allowedHost = (h: string) => ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(h)
  || /^([a-z0-9-]+\.)+(push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/.test(h)
const endpointOk = (endpoint: string) => {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443') && !/^[0-9.]+$/.test(u.hostname) && !u.hostname.includes(':') && allowedHost(u.hostname)
  } catch { return false }
}

// Constant-time secret check: compare fixed-length digests without early exit.
async function secretMatches(given: string | null, expected: string | undefined) {
  if (!given || !expected) return false
  const digest = async (v: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

Deno.serve(async req => {
  if (req.method !== 'POST' || !(await secretMatches(req.headers.get('x-push-secret'), Deno.env.get('PUSH_SHARED_SECRET')))) return new Response('forbidden', { status: 403 })
  const { user_id, kind, event_id } = await req.json().catch(() => ({}))
  const entry = copy[kind as keyof typeof copy]
  if (!user_id || !entry) return new Response('ignored', { status: 202 })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: subs } = await db.rpc('xensi_push_targets', { p_user: user_id })
  await Promise.all(((subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string; lang: string }[]).map(async s => {
    const [title, body, path] = entry[s.lang === 'en' ? 'en' : 'pt']
    if (!endpointOk(s.endpoint)) { console.error('squad-push: invalid endpoint, dropping', s.id); await db.rpc('xensi_push_drop', { p_id: s.id }); return }
    const eventId = typeof event_id === 'string' && /^[0-9a-f-]{36}$/i.test(event_id) ? event_id : undefined
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, path, kind, event_id: eventId, tag: eventId ? `${kind}:${eventId}` : kind }), { TTL: 600, urgency: 'high' })
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      console.error('squad-push: send failed', s.id, code ?? 'no-status')
      if (code === 404 || code === 410 || code === 401 || code === 403) await db.rpc('xensi_push_drop', { p_id: s.id })
    }
  }))
  return new Response('ok')
})
