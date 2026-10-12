import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { MotionDropdown } from '../design/MotionSurfaces'
import type { Locale } from '../i18n'
import { disablePush, enablePush, pushState, type PushState } from './push'
import { valueCopy } from './copy'
import { squadRpc, type Notification } from './service'

type Props = { userId: string | null; locale: Locale; open: boolean; disabled: boolean; triggerRef: RefObject<HTMLButtonElement | null>; onToggle: () => void; onOpenSquad: () => void }

const seenKey = (uid: string) => `xensi.squadBell.${uid}`
const tracked = new Set(['new_request', 'request_accepted', 'request_declined', 'joined', 'request_withdrawn', 'reservation_expired', 'reservation_cancelled', 'room_closed', 'room_cancelled', 'room_expired'])
const hints: Record<string, [string, string]> = {
  new_request: ['Abra Minha Sala para aprovar ou recusar.', 'Open My Room to approve or decline.'],
  request_accepted: ['Abra Minhas Solicitações para ver o Discord do anfitrião.', 'Open My Requests to see the host’s Discord.'],
}
const ui = {
  pt: { label: 'Notificações do Squad', empty: 'Sem notificações do Squad.', push: 'Ativar avisos no navegador', pushOn: 'Avisos no navegador: ligados', denied: 'Avisos bloqueados no navegador.', open: 'Abrir Squad Finder' },
  en: { label: 'Squad notifications', empty: 'No Squad notifications.', push: 'Enable browser alerts', pushOn: 'Browser alerts: on', denied: 'Alerts are blocked in your browser.', open: 'Open Squad Finder' },
}

export function SquadBell({ userId, locale, open, disabled, triggerRef, onToggle, onOpenSquad }: Props) {
  const text = ui[locale === 'pt' ? 'pt' : 'en'], idx = locale === 'pt' ? 0 : 1
  const [items, setItems] = useState<Notification[]>([])
  const [seen, setSeen] = useState('')
  const [push, setPush] = useState<PushState>('unsupported')
  const stopped = useRef(false)
  const load = useCallback(async () => {
    if (!userId || stopped.current || document.hidden) return
    try { setItems((await squadRpc<Notification[]>(userId, 'notifications')).filter(n => tracked.has(n.kind))) }
    catch (e) { if (e instanceof Error && ['lfg_ineligible', 'lfg_auth', 'lfg_unconfigured'].includes(e.message)) stopped.current = true }
  }, [userId])
  useEffect(() => {
    stopped.current = false; setItems([]); setSeen('')
    if (!userId) return
    try { setSeen(localStorage.getItem(seenKey(userId)) ?? '') } catch { /* storage unavailable */ }
    void load(); void pushState().then(setPush).catch(() => setPush('unsupported'))
    const timer = window.setInterval(() => void load(), 30000)
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'squad-push') window.setTimeout(() => void load(), 800) }
    const visible = () => void load()
    navigator.serviceWorker?.addEventListener('message', onMessage); document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(timer); navigator.serviceWorker?.removeEventListener('message', onMessage); document.removeEventListener('visibilitychange', visible) }
  }, [userId, load])
  const latest = items[0]?.created_at ?? ''
  const unread = items.filter(n => n.created_at > seen).length
  useEffect(() => {
    if (!open || !userId || !latest) return
    setSeen(latest)
    try { localStorage.setItem(seenKey(userId), latest) } catch { /* storage unavailable */ }
  }, [open, latest, userId])
  const togglePush = async () => { try { setPush(push === 'on' ? await disablePush() : await enablePush(locale === 'pt' ? 'pt' : 'en')) } catch { /* error shown inside Squad Finder */ } }
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return <div className="xensi-nav-menu-group xensi-nav-bell">
    <button ref={triggerRef} type="button" className="xensi-nav-utility" aria-label={unread ? `${text.label} (${unread})` : text.label} title={text.label} aria-expanded={open} onClick={userId ? onToggle : onOpenSquad} disabled={disabled}>
      <Bell size={22} />{unread > 0 && <i className="xensi-nav-bell-dot" aria-hidden="true">{unread > 9 ? '9+' : unread}</i>}
    </button>
    <MotionDropdown open={open} className="xensi-nav-dropdown xensi-nav-dropdown-right xensi-nav-bell-menu" data-menu="bell" aria-label={text.label}>
      <span className="xensi-nav-dropdown-label">{text.label}</span>
      {!items.length && <p className="xensi-nav-bell-empty">{text.empty}</p>}
      {items.map(n => <button key={n.id} type="button" role="menuitem" onClick={onOpenSquad}><span><b>{valueCopy[n.kind]?.[idx] ?? n.kind}</b>{hints[n.kind] && <small>{hints[n.kind][idx]}</small>}<small>{fmt(n.created_at)}</small></span></button>)}
      <i className="xensi-nav-dropdown-divider" aria-hidden="true" />
      {push === 'denied' ? <p className="xensi-nav-bell-empty"><BellOff size={14} /> {text.denied}</p> : push !== 'unsupported' && <button type="button" role="menuitem" onClick={() => void togglePush()}><span><b>{push === 'on' ? text.pushOn : text.push}</b></span></button>}
      <button type="button" role="menuitem" onClick={onOpenSquad}><span><b>{text.open}</b></span></button>
    </MotionDropdown>
  </div>
}
