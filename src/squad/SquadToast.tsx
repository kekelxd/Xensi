import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { withBasePath } from '../routes'
import { errorCopy } from './copy'
import { platforms, registry } from './registry'
import { playAlert } from './sound'
import { squadRpc, type Notification, type Request, type Room } from './service'

type Props = { userId: string | null; locale: 'pt' | 'en'; items: Notification[] }
type Toast = { kind: 'host' | 'player'; request: Request }

const copy = {
  pt: { host: 'Nova solicitação', player: 'Entrada aprovada!', wants: 'quer entrar na sua sala', accept: 'Aceitar', decline: 'Recusar', see: 'Ver Discord', close: 'Fechar', approved: 'sua vaga foi aprovada', network: 'Não foi possível concluir. Tente de novo.' },
  en: { host: 'New request', player: 'You were approved!', wants: 'wants to join your room', accept: 'Accept', decline: 'Decline', see: 'See Discord', close: 'Close', approved: 'your spot was approved', network: 'Could not complete. Try again.' },
}

// Navigates through history so App and SquadFinder both follow (same technique as the bell shortcuts).
const go = (path: string) => { window.history.pushState({}, '', withBasePath(path)); window.dispatchEvent(new PopStateEvent('popstate')) }

export function SquadToast({ userId, locale, items }: Props) {
  const text = copy[locale], idx = locale === 'pt' ? 0 : 1
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const known = useRef<Set<string> | null>(null)
  const account = useRef(userId)

  // Account switch: forget everything so another user's events never surface.
  useEffect(() => { account.current = userId; known.current = null; setToast(null); setError('') }, [userId])

  useEffect(() => {
    if (!userId) return
    // The first list only primes the set: old notifications must not pop up on page load.
    if (known.current === null) { known.current = new Set(items.map(n => n.id)); return }
    const fresh = items.filter(n => !known.current!.has(n.id) && (n.kind === 'new_request' || n.kind === 'request_accepted'))
    items.forEach(n => known.current!.add(n.id))
    if (!fresh.length) return
    const kind = fresh.some(n => n.kind === 'request_accepted') ? 'player' : 'host'
    void (async () => {
      try {
        let request: Request | undefined
        if (kind === 'host') {
          const rooms = await squadRpc<Room[]>(userId, 'mine')
          const room = rooms.find(r => r.status === 'open' || r.status === 'reserved')
          const pending = room ? (await squadRpc<Request[]>(userId, 'requests', { room_id: room.id })).filter(q => q.status === 'pending') : []
          request = pending[0]
        } else {
          request = (await squadRpc<Request[]>(userId, 'requests')).find(q => q.status === 'accepted' && q.room.status === 'reserved')
        }
        if (!request || account.current !== userId) return
        setError(''); setToast({ kind, request }); playAlert(kind === 'player' ? 'approved' : 'request')
      } catch { /* the bell history still lists the event */ }
    })()
  }, [items, userId])

  if (!toast || !userId) return null
  const { request: q } = toast
  const game = registry[q.room.game_id]?.name ?? q.room.game_id
  const decide = async (action: 'accept' | 'decline') => {
    setBusy(true); setError('')
    try {
      await squadRpc(userId, action, { room_id: q.room_id, request_id: q.id })
      setToast(null)
      if (action === 'accept') go('squad/my-room')
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      if (code === 'lfg_transition' || code === 'lfg_reserved' || code === 'lfg_unavailable') setToast(null)
      else setError(errorCopy[code]?.[idx] ?? text.network)
    } finally { setBusy(false) }
  }
  // Portal: navbar ancestors may create a containing block that would break position: fixed.
  return createPortal(<div className="xensi-squad-toast" role="alert" aria-live="assertive">
    <button type="button" className="xensi-squad-toast-close" aria-label={text.close} onClick={() => setToast(null)}><X size={16} /></button>
    <span className="xensi-squad-toast-title">{toast.kind === 'host' ? text.host : text.player}</span>
    <p className="xensi-squad-toast-body">{toast.kind === 'host' ? <><b>{q.nickname}</b> {text.wants}</> : <><b>{q.room.nickname}</b>: {text.approved}</>}</p>
    <small className="xensi-squad-toast-meta">{game} · {platforms[q.platform] ?? q.platform}</small>
    {error && <small className="xensi-squad-toast-error">{error}</small>}
    <div className="xensi-squad-toast-actions">
      {toast.kind === 'host'
        ? <>
          <button type="button" className="is-primary" disabled={busy || q.room.status !== 'open'} onClick={() => void decide('accept')}><Check size={14} />{text.accept}</button>
          <button type="button" disabled={busy} onClick={() => void decide('decline')}>{text.decline}</button>
        </>
        : <button type="button" className="is-primary" onClick={() => { setToast(null); go('squad/requests') }}>{text.see}</button>}
    </div>
  </div>, document.body)
}
