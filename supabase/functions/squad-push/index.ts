// Delivers Squad Finder Web Push. Called only by the lfg_private.push_dispatch trigger (pg_net).
// Secrets: PUSH_SHARED_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const copy = {
  new_request: { pt: ['Nova solicitação na sua sala', 'Alguém quer entrar. Abra para aprovar ou recusar.', 'squad/my-room'], en: ['New request for your room', 'Someone wants to join. Open to approve or decline.', 'squad/my-room'] },
  request_accepted: { pt: ['Entrada aprovada!', 'Toque para ver o Discord do anfitrião.', 'squad/requests'], en: ['You were approved!', 'Tap to see the host’s Discord.', 'squad/requests'] },
} as const

Deno.serve(async req => {
  if (req.method !== 'POST' || req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SHARED_SECRET')) return new Response('forbidden', { status: 403 })
  const { user_id, kind } = await req.json().catch(() => ({}))
  const entry = copy[kind as keyof typeof copy]
  if (!user_id || !entry) return new Response('ignored', { status: 202 })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: subs } = await db.rpc('xensi_push_targets', { p_user: user_id })
  await Promise.all(((subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string; lang: string }[]).map(async s => {
    const [title, body, path] = entry[s.lang === 'en' ? 'en' : 'pt']
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, path, tag: kind }), { TTL: 600, urgency: 'high' })
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.rpc('xensi_push_drop', { p_id: s.id })
    }
  }))
  return new Response('ok')
})
