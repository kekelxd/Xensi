import { useEffect, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Ban, DoorOpen, Inbox, Plus, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react'
import { initializeAuth, readAuthSessionState, type AuthSessionState } from '../authService'
import { useI18n } from '../i18n'
import { AvatarArtwork } from '../AvatarArtwork'
import { isAvatarId, DEFAULT_AVATAR } from '../avatars'
import { XensiPageHeader } from '../design/Primitives'
import { MotionDialog, MotionDialogPanel } from '../design/MotionSurfaces'
import { xensiMotion } from '../design/motion'
import { useDialogFocus } from '../useDialogFocus'
import { withBasePath } from '../routes'
import { compatible, platforms, ranksFor, regions, registry, validDiscord, type SquadGame, type SquadPlatform } from './registry'
import { errorCopy, squadCopy, statusCopy, valueCopy } from './copy'
import { squadRpc, type Access, type Block, type Contact, type Moderation, type Notification, type Request, type Room } from './service'
import './squad.css'

type Area = 'find' | 'mine' | 'requests' | 'blocks' | 'moderation'
type Dialog = { action: string; room?: Room; request?: Request; id?: string; decision?: string; enabled?: boolean }
type Snapshot = { access: Access | null; rooms: Room[]; requests: Request[]; notifications: Notification[]; blocks: Block[]; moderation: Moderation | null }
const emptySnapshot = (): Snapshot => ({ access: null, rooms: [], requests: [], notifications: [], blocks: [], moderation: null })
const pageSize = 20
const initialArea = (): Area => window.location.pathname.endsWith('/my-room') ? 'mine' : window.location.pathname.endsWith('/requests') ? 'requests' : window.location.pathname.endsWith('/moderation') ? 'moderation' : window.location.pathname.endsWith('/blocks') ? 'blocks' : 'find'
const areaPath: Record<Area, string> = { find: withBasePath('squad'), mine: withBasePath('squad/my-room'), requests: withBasePath('squad/requests'), moderation: withBasePath('squad/moderation'), blocks: withBasePath('squad/blocks') }

export function SquadFinder({ onLogin }: { onLogin: () => void }) {
  const [auth, setAuth] = useState<AuthSessionState>(readAuthSessionState)
  useEffect(() => {
    const update = () => setAuth(readAuthSessionState())
    let alive = true
    void initializeAuth().then(() => { if (alive) update() })
    window.addEventListener('xensi-auth-updated', update)
    return () => { alive = false; window.removeEventListener('xensi-auth-updated', update) }
  }, [])
  // Remount all private state on logout/account changes, including open dialogs.
  return <SquadWorkspace key={auth.userId ?? auth.status} auth={auth} onLogin={onLogin} />
}

function SquadWorkspace({ auth, onLogin }: { auth: AuthSessionState; onLogin: () => void }) {
  const { locale, localeTag } = useI18n()
  const lang = locale === 'pt' ? 'pt' : 'en'
  const text = squadCopy[lang], statuses = statusCopy[lang], reduced = useReducedMotion()
  const value = (key: string) => valueCopy[key]?.[lang === 'pt' ? 0 : 1] ?? key
  const date = (time: string) => new Date(time).toLocaleString(localeTag, { dateStyle: 'short', timeStyle: 'short' })
  const [area, setArea] = useState<Area>(initialArea)
  const [filters, setFilters] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return { game: p.get('game') ?? '', platform: p.get('platform') ?? '', region: p.get('region') ?? '', mode: p.get('mode') ?? '' }
  })
  const [page, setPage] = useState(0)
  const [hostPage, setHostPage] = useState(0)
  const [reportStatus, setReportStatus] = useState('pending')
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [knownDiscord, setKnownDiscord] = useState('')
  const [contact, setContact] = useState<{ roomId: string; data: Contact } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const generation = useRef(0), mounted = useRef(true), writeLock = useRef(false)
  const operation = useRef<AbortController | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const uid = auth.userId
  const errorMessage = (e: unknown) => errorCopy[e instanceof Error ? e.message : '']?.[lang === 'pt' ? 0 : 1] ?? text.network
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort() } }, [])
  useEffect(() => {
    const sync = () => { setArea(initialArea()); setPage(0) }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  useEffect(() => {
    const params = new URLSearchParams()
    if (area === 'find') Object.entries(filters).forEach(([key, val]) => { if (val) params.set(key, val) })
    const query = params.toString()
    window.history.replaceState({}, '', areaPath[area] + (query ? `?${query}` : ''))
  }, [area, filters])
  useEffect(() => {
    if (!uid) { setLoading(false); return }
    const abort = new AbortController(), version = ++generation.current
    let active = true, running = false
    const load = async (first = false) => {
      if (running || (!first && document.hidden)) return
      running = true
      if (first) { setLoading(true); setContact(null) }
      const rpc = <T,>(action: string, payload = {}) => squadRpc<T>(uid, action, payload, abort.signal)
      try {
        const access = await rpc<Access>('access')
        let next = { ...emptySnapshot(), access }
        if (access.eligible) {
          const notifications = await rpc<Notification[]>('notifications')
          next = { ...next, notifications }
          if (area === 'find') next.rooms = await rpc<Room[]>('list', { ...filters, offset: page * pageSize })
          if (area === 'mine') {
            next.rooms = await rpc<Room[]>('mine', { offset: page * pageSize })
            const managed = next.rooms.find(r => r.status === 'open' || r.status === 'reserved') ?? next.rooms[0]
            if (managed) next.requests = await rpc<Request[]>('requests', { room_id: managed.id, offset: hostPage * pageSize })
          }
          if (area === 'requests') next.requests = await rpc<Request[]>('requests', { offset: page * pageSize })
          if (area === 'blocks') next.blocks = await rpc<Block[]>('blocks', { offset: page * pageSize })
        }
        if (area === 'moderation' && access.moderator) next.moderation = await rpc<Moderation>('mod_list', { status: reportStatus, offset: page * pageSize })
        if (!active || version !== generation.current || readAuthSessionState().userId !== uid) return
        setSnapshot(next); setError('')
        if (!access.eligible) { setContact(null); if (area !== 'moderation') setDialog(null) }
        if (contactRef.current && !next.requests.some(q => q.room_id === contactRef.current?.roomId && q.status === 'accepted' && q.room.status === 'reserved')) setContact(null)
      } catch (e) {
        if (active && !abort.signal.aborted && version === generation.current) { setError(errorCopy[e instanceof Error ? e.message : '']?.[lang === 'pt' ? 0 : 1] ?? squadCopy[lang].network); setSnapshot(emptySnapshot()); setContact(null); setDialog(null) }
      } finally { running = false; if (active && version === generation.current) setLoading(false) }
    }
    void load(true)
    const timer = window.setInterval(() => void load(), 20000)
    const visible = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; abort.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [uid, area, filters, page, hostPage, reportStatus, refresh, lang])
  const contactRef = useRef(contact)
  useEffect(() => { contactRef.current = contact }, [contact])
  // Clear already fetched host contact at the exact reservation deadline or on tab hiding.
  useEffect(() => {
    if (!contact) return
    const clear = () => setContact(null)
    const timer = window.setTimeout(clear, Math.max(0, new Date(contact.data.reserved_until).getTime() - Date.now()))
    document.addEventListener('visibilitychange', clear)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', clear) }
  }, [contact])
  const navigate = (next: Area) => {
    setArea(next); setPage(0); setHostPage(0); setMessage(''); setError(''); setSnapshot(emptySnapshot()); setContact(null)
    window.history.pushState({}, '', areaPath[next])
  }
  const act = async (action: string, payload: Record<string, unknown>) => {
    if (!uid || writeLock.current) return
    writeLock.current = true; setBusy(true); setError(''); setMessage('')
    const abort = new AbortController(); operation.current = abort
    try {
      const data = await squadRpc<Contact>(uid, action, payload, abort.signal)
      if (!mounted.current || readAuthSessionState().userId !== uid) return
      if (action === 'host_contact') setContact({ roomId: String(payload.room_id), data })
      else { if (action === 'create' || action === 'request') setKnownDiscord(String(payload.discord_username)); setDialog(null); setContact(null); setMessage(action === 'report' ? text.reportSent : text.success); setRefresh(n => n + 1) }
    } catch (e) { if (mounted.current && !abort.signal.aborted) setError(errorMessage(e)) }
    finally { writeLock.current = false; if (mounted.current) setBusy(false) }
  }
  const copy = async (discord: string) => {
    try { await navigator.clipboard.writeText(discord); if (mounted.current) setMessage(text.copied) }
    catch { if (mounted.current) setError(text.copyError) }
  }
  const open = (action: string, room?: Room, request?: Request) => { setError(''); setDialog({ action, room, request }) }
  const select = (label: string, current: string, options: readonly string[], change: (v: string) => void, all = false) => <label className="lfg-field">{label}<select value={current} onChange={e => change(e.target.value)}>{all && <option value="">{text.all}</option>}{options.map(v => <option key={v} value={v}>{v in registry ? registry[v as SquadGame].name : v in platforms ? platforms[v as SquadPlatform] : value(v)}</option>)}</select></label>
  const roomInfo = (room: Room) => <>
    <div className="lfg-room-heading"><h2>{registry[room.game_id]?.name}</h2><span className={`lfg-status lfg-status-${room.status}`}>{statuses[room.status]}</span></div>
    <p className="lfg-summary"><span>{platforms[room.platform]}</span><span>{value(room.region)}</span><span>{value(room.game_mode)}</span></p>
    <dl className="lfg-facts"><div><dt>{text.rank}</dt><dd>{value(room.rank_info)}</dd></div><div><dt>{text.mic}</dt><dd>{room.microphone_required ? text.mandatory : text.optional}</dd></div><div><dt>{text.expires}</dt><dd>{date(room.expires_at)}</dd></div></dl>
    <p className="lfg-identity"><AvatarArtwork avatarId={isAvatarId(room.avatar_id) ? room.avatar_id : DEFAULT_AVATAR} />{room.nickname}<span>{room.status === 'open' ? text.slot : room.status === 'reserved' ? text.reservedSlot : statuses[room.status]}</span></p>
  </>
  const pager = (hasMore: boolean) => <div className="lfg-pager"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(n => n - 1)}>{text.previous}</button><span>{text.page} {page + 1}</span><button type="button" disabled={!hasMore || loading} onClick={() => setPage(n => n + 1)}>{text.next}</button></div>
  const enter = { initial: reduced ? false as const : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: reduced ? 0 : xensiMotion.durations.interaction } }
  const a = snapshot.access
  const allowed = a?.eligible || (area === 'moderation' && a?.moderator)
  const gate = auth.status === 'loading' ? text.loading : !uid ? text.anonymous : !a ? '' : a.suspended ? text.suspended : !a.email_confirmed ? text.emailGate : !a.enabled ? text.disabled : text.accessDenied
  const tabIcons = { find: Search, mine: DoorOpen, requests: Inbox, blocks: Ban, moderation: ShieldCheck }
  const tabs: Area[] = a?.moderator ? ['find', 'mine', 'requests', 'blocks', 'moderation'] : ['find', 'mine', 'requests', 'blocks']
  const createButton = <button type="button" className="lfg-primary" disabled={busy || !a?.creation_enabled || a.publication_restricted || snapshot.rooms.some(r => r.status === 'open' || r.status === 'reserved') && area === 'mine'} onClick={() => open('create')}><Plus size={16} aria-hidden="true" />{text.create}</button>
  const refreshButton = <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading || busy}><RefreshCw size={15} aria-hidden="true" />{text.retry}</button>
  return <div className="lfg-workspace" ref={root} aria-busy={loading || busy}>
    <XensiPageHeader title={text.title} description={text.description} />
    <div className="lfg-layout">
      <aside className="lfg-sidebar">
        <p className="lfg-product">XENSI Squad Finder</p>
        <nav className="lfg-tabs" aria-label="Squad Finder">{tabs.map(tab => { const Icon = tabIcons[tab]; return <button type="button" key={tab} aria-current={area === tab ? 'page' : undefined} onClick={() => navigate(tab)}><Icon size={18} aria-hidden="true" /><span>{text[tab]}</span></button> })}</nav>
      </aside>
      <div className="lfg-main">
    <div className="lfg-feedback" aria-live="polite">{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</div>
    {!allowed ? <section className="lfg-panel lfg-gate"><UsersRound size={28} /><h2>{text.accessTitle}</h2>{gate && <p>{gate}</p>}{uid ? <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading}>{text.retry}</button> : auth.status !== 'loading' && <button type="button" className="lfg-primary" onClick={onLogin}>{text.login}</button>}</section> : <>
      {area === 'find' && <div className="lfg-hero-row">
        <section className="lfg-panel lfg-hero"><h2>{text.heroTitle}</h2><p>{text.heroText}</p>{!loading && <dl className="lfg-stats"><div><dt>{text.inList}</dt><dd>{snapshot.rooms.length}</dd></div><div><dt>{text.notifications}</dt><dd>{snapshot.notifications.length}</dd></div></dl>}</section>
        <section className="lfg-panel lfg-side"><h2>{text.yourRoom}</h2><p>{text.yourRoomHint}</p><div className="lfg-actions">{createButton}<button type="button" onClick={() => navigate('mine')}>{text.manageRoom}</button></div></section>
      </div>}
      {area !== 'moderation' && <details className="lfg-notifications"><summary>{text.notifications} ({snapshot.notifications.length})</summary>{snapshot.notifications.length ? <ul>{snapshot.notifications.map(n => <li key={n.id}>{value(n.kind)} <time dateTime={n.created_at}>{date(n.created_at)}</time></li>)}</ul> : <p>{text.noNotifications}</p>}</details>}
      {area !== 'find' && <div className="lfg-toolbar">{refreshButton}{area === 'mine' && createButton}</div>}
      {(area === 'find' || area === 'mine') && (!a?.creation_enabled || a.publication_restricted) && <p>{text.creationOff}</p>}
      {area === 'find' && <section className="lfg-panel lfg-filter-panel" aria-label={text.filtersTitle}><header><h2>{text.filtersTitle}</h2>{refreshButton}</header><div className="lfg-filters">{select(text.game, filters.game, Object.keys(registry), game => { setFilters(f => ({ ...f, game, platform: '', mode: '' })); setPage(0) }, true)}{select(text.platform, filters.platform, filters.game in registry ? registry[filters.game as SquadGame].platforms : Object.keys(platforms), platform => { setFilters(f => ({ ...f, platform })); setPage(0) }, true)}{select(text.region, filters.region, regions, region => { setFilters(f => ({ ...f, region })); setPage(0) }, true)}{select(text.mode, filters.mode, filters.game in registry ? registry[filters.game as SquadGame].modes : [...new Set(Object.values(registry).flatMap(g => g.modes))], mode => { setFilters(f => ({ ...f, mode })); setPage(0) }, true)}</div></section>}
      {area === 'find' && <h2 className="lfg-section-title">{text.roomsTitle}</h2>}
      {loading && <p role="status">{text.loading}</p>}
      {!loading && (area === 'find' || area === 'mine') && <>
        {!snapshot.rooms.length && <p className="lfg-empty">{text.empty}</p>}
        <div className="lfg-rooms" data-area={area}>{snapshot.rooms.slice(0, pageSize).map(room => <motion.article {...enter} key={room.id} className="lfg-panel">
          {roomInfo(room)}
          {area === 'find' ? <div className="lfg-actions"><button type="button" className="lfg-primary" disabled={busy || room.status !== 'open'} onClick={() => open('request', room)}>{text.request}</button><button type="button" disabled={busy} onClick={() => open('report', room)}>{text.report}</button><button type="button" disabled={busy} onClick={() => open('block', room)}>{text.block}</button></div> : <>
            {room.status === 'reserved' && <div className="lfg-reservation"><h3>{text.waiting}</h3><p>{text.reservation}: {room.reserved_until && date(room.reserved_until)}</p><div className="lfg-actions"><button type="button" className="lfg-primary" disabled={busy} onClick={() => open('confirm', room)}>{text.confirm}</button><button type="button" disabled={busy} onClick={() => open('release', room)}>{text.release}</button></div></div>}
            {['open', 'reserved'].includes(room.status) && <button type="button" disabled={busy} onClick={() => open('cancel', room)}>{text.end}</button>}
            <div className="lfg-host-requests">{snapshot.requests.filter(q => q.room_id === room.id).slice(0, pageSize).map(q => <motion.div {...enter} key={q.id} className="lfg-request"><p className="lfg-identity"><AvatarArtwork avatarId={isAvatarId(q.avatar_id) ? q.avatar_id : DEFAULT_AVATAR} />{q.nickname}<span>{statuses[q.status]}</span></p><p>{platforms[q.platform]} · {date(q.requested_at)}</p>{q.discord_username && <p className="lfg-private"><code>{q.discord_username}</code><button type="button" onClick={() => void copy(q.discord_username!)}>{text.copy}</button></p>}<div className="lfg-actions">{q.status === 'pending' && <><button type="button" className="lfg-primary" disabled={busy || room.status !== 'open'} onClick={() => open('accept', room, q)}>{text.accept}</button><button type="button" disabled={busy} onClick={() => void act('decline', { room_id: room.id, request_id: q.id })}>{text.decline}</button></>}<button type="button" disabled={busy} onClick={() => open('report', room, q)}>{text.report}</button><button type="button" disabled={busy} onClick={() => open('block', room, q)}>{text.block}</button></div></motion.div>)}{snapshot.requests.length === 0 && ['open', 'reserved'].includes(room.status) && <p>{text.noRequests}</p>}<div className="lfg-pager"><button type="button" disabled={hostPage === 0 || busy} onClick={() => setHostPage(n => n - 1)}>{text.previous}</button><span>{text.page} {hostPage + 1}</span><button type="button" disabled={snapshot.requests.length <= pageSize || busy} onClick={() => setHostPage(n => n + 1)}>{text.next}</button></div></div>
          </>}
        </motion.article>)}</div>{pager(snapshot.rooms.length > pageSize)}
      </>}
      {!loading && area === 'requests' && <>{!snapshot.requests.length && <p className="lfg-empty">{text.noRequests}</p>}<div className="lfg-rooms">{snapshot.requests.slice(0, pageSize).map(q => <motion.article {...enter} key={q.id} className="lfg-panel">{roomInfo(q.room)}<h3>{statuses[q.status]}</h3><p>{date(q.requested_at)}</p>{q.status === 'accepted' && q.room.status === 'reserved' && <div className="lfg-reservation"><h3>{text.accepted}</h3><p>{text.acceptedHint}</p><button type="button" className="lfg-primary" disabled={busy} onClick={() => void act('host_contact', { room_id: q.room_id })}>{text.contact}</button>{contact?.roomId === q.room_id && <div className="lfg-private"><span>{contact.data.nickname}</span><code>{contact.data.discord_username}</code><button type="button" onClick={() => void copy(contact.data.discord_username)}>{text.copy}</button></div>}</div>}<div className="lfg-actions">{q.status === 'pending' && <button type="button" disabled={busy} onClick={() => void act('withdraw', { room_id: q.room_id, request_id: q.id })}>{text.withdraw}</button>}<button type="button" disabled={busy} onClick={() => open('report', q.room)}>{text.report}</button><button type="button" disabled={busy} onClick={() => open('block', q.room)}>{text.block}</button></div></motion.article>)}</div>{pager(snapshot.requests.length > pageSize)}</>}
      {!loading && area === 'blocks' && <section className="lfg-panel">{!snapshot.blocks.length && <p>{text.noBlocks}</p>}{snapshot.blocks.slice(0, pageSize).map(b => <p className="lfg-private" key={b.id}>{b.nickname}<button type="button" disabled={busy} onClick={() => void act('unblock', { id: b.id })}>{text.unblock}</button></p>)}{pager(snapshot.blocks.length > pageSize)}</section>}
      {!loading && area === 'moderation' && snapshot.moderation && <section className="lfg-panel">
        <div className="lfg-toolbar"><h2>{text.capacity}</h2><button type="button" disabled={busy} onClick={() => setDialog({ action: 'mod_capacity', enabled: !snapshot.moderation!.creation_enabled })}>{snapshot.moderation.creation_enabled ? text.disable : text.enable}</button></div>
        {select(text.moderation, reportStatus, ['pending', 'all'], v => { setReportStatus(v); setPage(0) })}
        <h2>{reportStatus === 'pending' ? text.pendingReports : text.history}</h2>{snapshot.moderation.reports.length === 0 && <p>{text.noRequests}</p>}{snapshot.moderation.reports.slice(0, pageSize).map(report => <div className="lfg-request" key={report.id}><h3>{report.nickname}</h3><p>{value(report.category)} · {value(report.status)} · {date(report.created_at)}</p><div className="lfg-actions">{(['dismiss', 'resolve', 'restrict', 'suspend', 'restore', 'cancel_room'] as const).map(decision => <button type="button" key={decision} disabled={busy} onClick={() => setDialog({ action: 'mod_decide', id: report.id, decision })}>{text[decision === 'cancel_room' ? 'cancelRoom' : decision]}</button>)}</div></div>)}
        <h2>{text.restrictions}</h2>{snapshot.moderation.restrictions.slice(0, pageSize).map(r => <p key={r.user_id}>{r.nickname} · {r.suspended ? text.suspend : r.publication_restricted ? text.restrict : text.restore}</p>)}
        <details><summary>{text.decisions}</summary>{snapshot.moderation.actions.slice(0, pageSize).map(d => <p key={d.id}>{value(d.action_type)} · {value(d.reason)} · {date(d.created_at)}</p>)}</details>
        <details><summary>{text.blocks} ({snapshot.moderation.blocks.length})</summary>{snapshot.moderation.blocks.slice(0, pageSize).map((b, i) => <p key={i}>{b.blocker_user_id} → {b.blocked_user_id} · {date(b.created_at)}</p>)}</details>
        {pager(Math.max(snapshot.moderation.reports.length, snapshot.moderation.actions.length, snapshot.moderation.blocks.length, snapshot.moderation.restrictions.length) > pageSize)}
      </section>}
    </>}
      </div>
    </div>
    {dialog && <SquadDialog key={`${dialog.action}:${dialog.room?.id}:${dialog.request?.id}`} dialog={dialog} lang={lang} knownDiscord={knownDiscord} busy={busy} error={error} onClose={() => { if (!busy) setDialog(null) }} onSubmit={payload => void act(dialog.action, payload)} />}
  </div>
}

function SquadDialog({ dialog, lang, knownDiscord, busy, error, onClose, onSubmit }: { dialog: Dialog; lang: 'pt' | 'en'; knownDiscord: string; busy: boolean; error: string; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const text = squadCopy[lang]
  const value = (v: string) => valueCopy[v]?.[lang === 'pt' ? 0 : 1] ?? v
  const ref = useRef<HTMLElement>(null), form = useRef<HTMLFormElement>(null)
  const trigger = useRef(document.activeElement as HTMLElement | null)
  useDialogFocus(ref, true)
  const [game, setGame] = useState<SquadGame>(dialog.room?.game_id ?? 'valorant')
  const [platform, setPlatform] = useState<SquadPlatform>(dialog.room?.platform ?? 'pc')
  const [region, setRegion] = useState('br'), [mode, setMode] = useState(registry[game].modes[0] as string), [rank, setRank] = useState('unranked')
  const [discord, setDiscord] = useState(knownDiscord), [mic, setMic] = useState(true), [crossplay, setCrossplay] = useState(false), [consent, setConsent] = useState(false), [category, setCategory] = useState('harassment')
  const [invalid, setInvalid] = useState(false)
  const creating = dialog.action === 'create', requesting = dialog.action === 'request'
  const titles: Record<string, string> = { create: text.create, request: text.request, accept: text.accept, confirm: text.confirm, release: text.release, cancel: text.end, report: text.report, block: text.block, mod_decide: text.moderation, mod_capacity: text.capacity }
  const hints: Record<string, string> = { create: text.hostDisclosure, request: text.disclosure, accept: text.hostDisclosure, confirm: text.confirmHint, release: text.releaseHint, cancel: text.endHint, report: text.reportHint, block: text.blockHint, mod_decide: text.modHint, mod_capacity: text.modHint }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if ((creating || requesting) && !validDiscord(discord)) { setInvalid(true); form.current?.querySelector<HTMLInputElement>('input[name="discord"]')?.focus(); return }
    const payload: Record<string, unknown> = { room_id: dialog.room?.id, request_id: dialog.request?.id }
    if (creating) Object.assign(payload, { game_id: game, platform, region, game_mode: mode, rank_info: rank, microphone_required: mic, crossplay, discord_username: discord })
    if (requesting) Object.assign(payload, { platform, discord_username: discord, consent })
    if (dialog.action === 'report') payload.category = category
    if (dialog.action === 'mod_decide') Object.assign(payload, { report_id: dialog.id, decision: dialog.decision, reason: category })
    if (dialog.action === 'mod_capacity') payload.enabled = dialog.enabled
    onSubmit(payload)
  }
  const field = (label: string, current: string, options: readonly string[], change: (v: string) => void) => <label className="lfg-field">{label}<select value={current} onChange={e => change(e.target.value)}>{options.map(v => <option key={v} value={v}>{v in registry ? registry[v as SquadGame].name : v in platforms ? platforms[v as SquadPlatform] : value(v)}</option>)}</select></label>
  // Make the persistent app chrome inert while the app-owned modal is open.
  useEffect(() => {
    const backdrop = ref.current?.closest('.xensi-motion-backdrop')
    const returnFocus = trigger.current
    const hidden: { element: HTMLElement; previous: boolean }[] = []
    let child = backdrop
    while (child?.parentElement) {
      for (const sibling of Array.from(child.parentElement.children)) if (sibling !== child && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) { hidden.push({ element: sibling, previous: sibling.inert }); sibling.inert = true }
      child = child.parentElement
      if (child.tagName === 'BODY') break
    }
    return () => {
      hidden.forEach(({ element, previous }) => { element.inert = previous })
      window.requestAnimationFrame(() => { if (returnFocus?.isConnected) returnFocus.focus() })
    }
  }, [])
  const title = dialog.action === 'mod_decide' ? value(dialog.decision ?? '') : titles[dialog.action] ?? text.confirm
  return <MotionDialog open onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose() } }}>
    <MotionDialogPanel ref={ref} className="lfg-dialog" role="dialog" aria-modal="true" aria-labelledby="lfg-dialog-title" aria-describedby="lfg-dialog-hint">
      <button type="button" className="lfg-dialog-close" onClick={onClose} disabled={busy}>{text.cancel}</button>
      <h2 id="lfg-dialog-title">{title}</h2><p id="lfg-dialog-hint">{hints[dialog.action]}</p>
      <form ref={form} noValidate onSubmit={submit}>
        {creating && <div className="lfg-form-grid">{field(text.game, game, Object.keys(registry), v => { const next = v as SquadGame; setGame(next); setPlatform('pc'); setMode(registry[next].modes[0]); setRank('unranked'); setCrossplay(false) })}{field(text.platform, platform, registry[game].platforms, v => setPlatform(v as SquadPlatform))}{field(text.region, region, regions, setRegion)}{field(text.mode, mode, registry[game].modes, v => { setMode(v); setRank('unranked') })}{field(text.rank, rank, ranksFor(game, mode), setRank)}</div>}
        {requesting && dialog.room && field(text.platform, platform, registry[game].platforms.filter(p => compatible(game, dialog.room!.platform, p, dialog.room!.crossplay)), v => setPlatform(v as SquadPlatform))}
        {creating && <><label className="lfg-check"><input type="checkbox" checked={mic} onChange={e => setMic(e.target.checked)} />{text.mic}</label>{game !== 'cs2' && (game !== 'valorant' || platform !== 'pc') && <label className="lfg-check"><input type="checkbox" checked={crossplay} onChange={e => setCrossplay(e.target.checked)} />{text.crossplay}</label>}<p>{text.crossplayHint}</p></>}
        {(creating || requesting) && <label className="lfg-field">{text.discord}<input name="discord" autoComplete="off" maxLength={32} value={discord} aria-invalid={invalid} aria-describedby="lfg-discord-hint lfg-discord-error" onChange={e => { setDiscord(e.target.value); setInvalid(false) }} /><small id="lfg-discord-hint">{text.discordHint}</small><span id="lfg-discord-error">{invalid ? text.invalidDiscord : ''}</span></label>}
        {requesting && <label className="lfg-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />{text.consent}</label>}
        {(dialog.action === 'report' || dialog.action === 'mod_decide') && field(text.category, category, ['harassment', 'abuse', 'spam', 'suspicious', 'privacy', 'other'], setCategory)}
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="lfg-primary" disabled={busy || (requesting && !consent)} aria-busy={busy}>{creating ? text.publish : dialog.action === 'mod_capacity' ? dialog.enabled ? text.enable : text.disable : title}</button>
      </form>
    </MotionDialogPanel>
  </MotionDialog>
}
