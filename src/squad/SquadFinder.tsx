import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Bell, BellOff, Ban, ChevronLeft, ChevronRight, Copy, DoorOpen, Inbox, Info, Plus, RefreshCw, Search, ShieldCheck, UsersRound, X } from 'lucide-react'
import { initializeAuth, readAuthSessionState, type AuthSessionState } from '../authService'
import { useI18n } from '../i18n'
import { AvatarArtwork } from '../AvatarArtwork'
import { isAvatarId, DEFAULT_AVATAR } from '../avatars'
import '../gameIdentity.css'
import { XensiPageHeader } from '../design/Primitives'
import { xensiMotion } from '../design/motion'
import { withBasePath } from '../routes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { platformIds, platforms, regions, registry, validDiscord, validFreeText, type SquadGame, type SquadPlatform } from './registry'
import { errorCopy, squadCopy, statusCopy, valueCopy } from './copy'
import { GameSelect } from './GameSelect'
import { armAlertSound, playAlert } from './sound'
import { disablePush, enablePush, pushState, resyncPush, type PushState } from './push'
import { clearNotifications, getSavedDiscord, saveDiscord, squadRpc, type Access, type Block, type Contact, type Moderation, type Notification, type Request, type Room } from './service'
import './squad.css'

type Area = 'find' | 'mine' | 'requests' | 'blocks' | 'moderation'
type DialogState = { action: string; room?: Room; request?: Request; id?: string; decision?: string; enabled?: boolean }
type Snapshot = { access: Access | null; rooms: Room[]; requests: Request[]; notifications: Notification[]; blocks: Block[]; moderation: Moderation | null }
const emptySnapshot = (): Snapshot => ({ access: null, rooms: [], requests: [], notifications: [], blocks: [], moderation: null })
const pageSize = 20
// Accounts the server already confirmed eligible in this tab session (memory only).
const eligibleUsers = new Set<string>()
const initialArea = (): Area => window.location.pathname.endsWith('/my-room') ? 'mine' : window.location.pathname.endsWith('/requests') ? 'requests' : window.location.pathname.endsWith('/moderation') ? 'moderation' : window.location.pathname.endsWith('/blocks') ? 'blocks' : 'find'
const areaPath: Record<Area, string> = { find: withBasePath('squad'), mine: withBasePath('squad/my-room'), requests: withBasePath('squad/requests'), moderation: withBasePath('squad/moderation'), blocks: withBasePath('squad/blocks') }
// Radix Select/RadioGroup reserve the empty string, so "all" filters use a sentinel and map back to ''.
const ALL = '__all'
const games = Object.keys(registry) as SquadGame[]
const gameOptions = games.map(id => ({ id, name: registry[id].name, keywords: `${id} ${registry[id].code}` }))
// No per-user game history exists yet, so the "most used" chips are a fixed shortlist.
const popularGames: readonly SquadGame[] = ['valorant', 'cs2', 'fortnite', 'lol']
const MotionCard = motion.create(Card)
const optionLabel = (v: string, value: (key: string) => string) => v in registry ? registry[v as SquadGame].name : v in platforms ? platforms[v as SquadPlatform] : value(v)
const GameCode = ({ id, selected = false }: { id: SquadGame; selected?: boolean }) => <span aria-hidden="true" className={`xensi-game-badge badge-sm${selected ? ' is-selected' : ''}`}>{registry[id].code}</span>
const heading = 'm-0 font-heading font-semibold leading-tight tracking-[-0.01em] text-foreground'
const muted = 'm-0 text-sm leading-relaxed text-muted-foreground'

function SelectField({ label, value, options, onValueChange, format, allLabel, inline = false, className }: { label: string; value: string; options: readonly string[]; onValueChange: (v: string) => void; format: (v: string) => string; allLabel?: string; inline?: boolean; className?: string }) {
  const id = useId()
  const select = <Select value={value || (allLabel ? ALL : undefined)} onValueChange={v => onValueChange(v === ALL ? '' : v)}>
    <SelectTrigger id={id} aria-label={inline ? label : undefined} className={inline ? className : undefined}>
      {/* Narrow screens: the label alone stands for "all"; once filtered, the value alone. */}
      {inline ? <span className="flex min-w-0 items-center gap-2"><span className={cn('flex-none text-muted-foreground', value && 'max-sm:hidden')}>{label}<span className="max-sm:hidden">:</span></span><span className={cn('min-w-0 truncate', !value && 'max-sm:hidden')}>{value ? format(value) : allLabel}</span></span> : <SelectValue />}
    </SelectTrigger>
    <SelectContent>
      {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
      {options.map(v => <SelectItem key={v} value={v}>{format(v)}</SelectItem>)}
    </SelectContent>
  </Select>
  if (inline) return select
  return <div className={cn('grid min-w-0 content-start gap-2', className)}>
    <Label htmlFor={id}>{label}</Label>
    {select}
  </div>
}

function CheckField({ checked, onCheckedChange, children }: { checked: boolean; onCheckedChange: (v: boolean) => void; children: ReactNode }) {
  const id = useId()
  return <div className="flex items-start gap-3">
    <Checkbox id={id} checked={checked} onCheckedChange={v => onCheckedChange(v === true)} className="mt-px" />
    <Label htmlFor={id} className="cursor-pointer text-sm leading-normal font-normal text-foreground">{children}</Label>
  </div>
}

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
  const langRef = useRef<'pt' | 'en'>(lang); langRef.current = lang
  const text = squadCopy[lang], statuses = statusCopy[lang], reduced = useReducedMotion()
  const value = (key: string) => valueCopy[key]?.[lang === 'pt' ? 0 : 1] ?? key
  const format = (v: string) => optionLabel(v, value)
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
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [knownDiscord, setKnownDiscord] = useState('')
  const [contact, setContact] = useState<{ roomId: string; data: Contact } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const generation = useRef(0), mounted = useRef(true), writeLock = useRef(false)
  const operation = useRef<AbortController | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const uid = auth.userId
  useEffect(() => {
    setKnownDiscord('')
    if (!uid) return
    let active = true
    void getSavedDiscord().then(v => { if (active) setKnownDiscord(v) }).catch(() => undefined)
    return () => { active = false }
  }, [uid])
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
        // Data calls only start before `access` resolves for an account already seen as eligible (later
        // refreshes: one round trip). A first load or ineligible account still checks `access` first.
        const fetchData = (): [Promise<Notification[]>, Promise<Partial<Snapshot>>] => {
          const notifications = rpc<Notification[]>('notifications')
          const data = (async (): Promise<Partial<Snapshot>> => {
            if (area === 'find') return { rooms: await rpc<Room[]>('list', { ...filters, offset: page * pageSize }) }
            if (area === 'mine') {
              const rooms = await rpc<Room[]>('mine', { offset: page * pageSize })
              const managed = rooms.find(r => r.status === 'open' || r.status === 'reserved') ?? rooms[0]
              return { rooms, requests: managed ? await rpc<Request[]>('requests', { room_id: managed.id, offset: hostPage * pageSize }) : [] }
            }
            if (area === 'requests') return { requests: await rpc<Request[]>('requests', { offset: page * pageSize }) }
            if (area === 'blocks') return { blocks: await rpc<Block[]>('blocks', { offset: page * pageSize }) }
            return {}
          })()
          notifications.catch(() => undefined); data.catch(() => undefined)
          return [notifications, data]
        }
        const early = eligibleUsers.has(uid) ? fetchData() : null
        const access = await rpc<Access>('access')
        if (access.eligible) eligibleUsers.add(uid); else eligibleUsers.delete(uid)
        let next: Snapshot = { ...emptySnapshot(), access }
        if (access.eligible) {
          const [notifications, data] = await Promise.all(early ?? fetchData())
          next = { ...next, ...data, notifications }
        }
        if (area === 'moderation' && access.moderator) next.moderation = await rpc<Moderation>('mod_list', { status: reportStatus, offset: page * pageSize })
        if (!active || version !== generation.current || readAuthSessionState().userId !== uid) return
        const known = seen.current
        const fresh = next.notifications.filter(n => (n.kind === 'new_request' || n.kind === 'request_accepted') && !known.has(n.id))
        if (known.size && fresh.length) playAlert(fresh.some(n => n.kind === 'request_accepted') ? 'approved' : 'request')
        next.notifications.forEach(n => known.add(n.id))
        setSnapshot(next); setError('')
        if (!access.eligible) { setContact(null); if (area !== 'moderation') setDialog(null) }
        if (contactRef.current && !next.requests.some(q => q.room_id === contactRef.current?.roomId && q.status === 'accepted')) setContact(null)
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
  const seen = useRef(new Set<string>())
  const [push, setPush] = useState<PushState>('unsupported')
  useEffect(() => {
    const disarm = armAlertSound()
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'squad-push') playAlert(e.data.kind === 'request_accepted' ? 'approved' : 'request') }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => { disarm(); navigator.serviceWorker?.removeEventListener('message', onMessage) }
  }, [])
  useEffect(() => { seen.current = new Set() }, [uid])
  useEffect(() => { if (uid) void pushState().then(state => { setPush(state); if (state === 'on') void resyncPush(langRef.current).catch(() => undefined) }).catch(() => setPush('unsupported')) }, [uid])
  const togglePush = async () => {
    try { setPush(push === 'on' ? await disablePush() : await enablePush(lang)) } catch (e) { setError(errorMessage(e)) }
  }
  const navigate = (next: Area) => {
    setArea(next); setPage(0); setHostPage(0); setMessage(''); setError(''); setSnapshot(emptySnapshot()); setContact(null)
    window.history.pushState({}, '', areaPath[next])
  }
  const act = async (action: string, payload: Record<string, unknown>) => {
    if (!uid || writeLock.current) return
    writeLock.current = true; setBusy(true); setError(''); setMessage('')
    const abort = new AbortController(); operation.current = abort
    try {
      if (action === 'discord') {
        const name = String(payload.discord_username)
        await saveDiscord(name)
        if (!mounted.current || readAuthSessionState().userId !== uid) return
        setKnownDiscord(name); setDialog(null); setMessage(text.discordSaved)
        return
      }
      const { remember, ...rpcPayload } = payload
      const data = await squadRpc<Contact>(uid, action, rpcPayload, abort.signal)
      if (!mounted.current || readAuthSessionState().userId !== uid) return
      if (action === 'host_contact') setContact({ roomId: String(payload.room_id), data })
      else { if (action === 'create' || action === 'request') { const name = String(payload.discord_username); if (remember !== false && name !== knownDiscord) void saveDiscord(name).catch(() => undefined); setKnownDiscord(name) } setDialog(null); setContact(null); setMessage(action === 'report' ? text.reportSent : text.success); setRefresh(n => n + 1) }
    } catch (e) { if (mounted.current && !abort.signal.aborted) setError(errorMessage(e)) }
    finally { writeLock.current = false; if (mounted.current) setBusy(false) }
  }
  const copy = async (discord: string) => {
    try { await navigator.clipboard.writeText(discord); if (mounted.current) setMessage(text.copied) }
    catch { if (mounted.current) setError(text.copyError) }
  }
  const open = (action: string, room?: Room, request?: Request) => { setError(''); setDialog({ action, room, request }) }
  const setFilter = (patch: Partial<typeof filters>) => { setFilters(f => ({ ...f, ...patch })); setPage(0) }
  const identity = (avatarId: string | null, nickname: string, note: ReactNode) => <div className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-foreground">
    <AvatarArtwork avatarId={isAvatarId(avatarId) ? avatarId : DEFAULT_AVATAR} className="size-[34px] flex-none rounded-full" />
    <span className="min-w-0 [overflow-wrap:anywhere]">{nickname}</span>
    <span className="ml-auto text-xs font-normal text-muted-foreground">{note}</span>
  </div>
  const privateContact = (discord: string, label?: string) => <div className="flex flex-wrap items-center gap-3 rounded-lg border border-solid border-border bg-black/25 px-3 py-2 text-sm text-foreground">
    {label && <span className="font-medium">{label}</span>}
    <code className="select-text font-mono [overflow-wrap:anywhere]">{discord}</code>
    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void copy(discord)}><Copy />{text.copy}</Button>
  </div>
  const roomInfo = (room: Room) => <>
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <GameCode id={room.game_id} />
        <h2 className={cn(heading, 'text-[19px]')}>{registry[room.game_id]?.name}</h2>
      </div>
      <Badge variant={room.status === 'open' ? 'success' : room.status === 'reserved' ? 'default' : 'outline'}>{statuses[room.status]}</Badge>
    </div>
    <div className="flex flex-wrap gap-1.5"><Badge variant="secondary">{platforms[room.platform]}</Badge><Badge variant="secondary">{value(room.region)}</Badge>{room.game_mode && <Badge variant="secondary">{value(room.game_mode)}</Badge>}</div>
    <dl className="m-0 grid border-0 border-y border-solid border-border [&>div+div]:border-0 [&>div+div]:border-t [&>div+div]:border-solid [&>div+div]:border-border">
      {[[text.rank, room.rank_info ? value(room.rank_info) : '—'], [text.mic, room.microphone_required ? text.mandatory : text.optional], [text.expires, date(room.expires_at)]].map(([term, detail]) => <div key={term} className="flex items-baseline justify-between gap-3 py-2.5">
        <dt className="text-xs font-medium text-muted-foreground">{term}</dt><dd className="m-0 text-right text-[13px] font-medium text-foreground [overflow-wrap:anywhere]">{detail}</dd>
      </div>)}
    </dl>
    {identity(room.avatar_id, room.nickname, room.status === 'open' || room.status === 'reserved' ? `${room.filled}/${room.capacity} ${text.slotsWord}${room.status === 'reserved' ? ` · ${text.full}` : ''}` : statuses[room.status])}
  </>
  const pagerControls = (current: number, hasMore: boolean, onPage: (delta: number) => void, disabled: boolean) => <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-[13px] font-medium text-muted-foreground">
    <Button variant="outline" size="sm" disabled={current === 0 || disabled} onClick={() => onPage(-1)}><ChevronLeft />{text.previous}</Button>
    <span className="tabular-nums">{text.page} {current + 1}</span>
    <Button variant="outline" size="sm" disabled={!hasMore || disabled} onClick={() => onPage(1)}>{text.next}<ChevronRight /></Button>
  </div>
  const pager = (hasMore: boolean) => pagerControls(page, hasMore, d => setPage(n => n + d), loading)
  const enter = { initial: reduced ? false as const : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: reduced ? 0 : xensiMotion.durations.interaction } }
  const a = snapshot.access
  const allowed = a?.eligible || (area === 'moderation' && a?.moderator)
  const gate = auth.status === 'loading' ? text.loading : !uid ? text.anonymous : !a ? '' : a.suspended ? text.suspended : !a.email_confirmed ? text.emailGate : !a.enabled ? text.disabled : text.accessDenied
  const tabIcons = { find: Search, mine: DoorOpen, requests: Inbox, blocks: Ban, moderation: ShieldCheck }
  const tabs: Area[] = a?.moderator ? ['find', 'mine', 'requests', 'blocks', 'moderation'] : ['find', 'mine', 'requests', 'blocks']
  const createButton = <Button disabled={busy || !a?.creation_enabled || a.publication_restricted || snapshot.rooms.some(r => r.status === 'open' || r.status === 'reserved') && area === 'mine'} onClick={() => open('create')}><Plus />{text.create}</Button>
  const pushButton = push === 'unsupported' ? null : push === 'denied' ? <span title={text.pushDenied} className="grid size-9 place-items-center text-muted-foreground"><BellOff className="size-4" aria-hidden="true" /><span className="sr-only">{text.pushDenied}</span></span> : <Button variant="outline" size="sm" title={text.pushHint} disabled={busy} aria-pressed={push === 'on'} onClick={() => void togglePush()}>{push === 'on' ? <Bell /> : <BellOff />}{push === 'on' ? text.pushOn : text.pushOff}</Button>
  const refreshButton = <Button variant="outline" size="sm" onClick={() => setRefresh(n => n + 1)} disabled={loading || busy}><RefreshCw />{text.retry}</Button>
  const pickerCopy = { search: text.searchGame, empty: text.noGames, popular: text.popularGames }
  const activeFilters = ([['game', filters.game && registry[filters.game as SquadGame]?.name], ['platform', filters.platform && format(filters.platform)], ['region', filters.region && format(filters.region)], ['mode', filters.mode && format(filters.mode)]] as const)
    .filter((f): f is readonly ['game' | 'platform' | 'region' | 'mode', string] => Boolean(f[1]))
  const roomGrid = (wide = false) => cn('grid gap-5', wide ? 'grid-cols-[repeat(auto-fill,minmax(min(420px,100%),1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]')
  const cardBody = 'gap-3.5 p-5 sm:p-6'
  const section = 'mt-1.5 grid gap-2.5 border-0 border-t border-solid border-border pt-4'
  return <div className="lfg-workspace" ref={root} aria-busy={loading || busy}>
    <XensiPageHeader title={text.title} />
    <div className="lfg-layout">
      <Card className="sticky top-28 p-3.5 max-[1100px]:static max-[1100px]:p-2">
        <p className="m-0 mx-2 mt-0.5 mb-3 text-xs font-medium text-muted-foreground max-[1100px]:hidden">XENSI Squad Finder</p>
        <nav className="flex flex-col gap-1 max-[1100px]:flex-row max-[1100px]:overflow-x-auto max-[1100px]:[scrollbar-width:none]" aria-label="Squad Finder">{tabs.map(tab => { const Icon = tabIcons[tab]; return <Button variant="ghost" key={tab} aria-current={area === tab ? 'page' : undefined} onClick={() => navigate(tab)} className="w-full justify-start font-medium max-[1100px]:w-auto max-[1100px]:flex-none aria-[current=page]:bg-primary/12 aria-[current=page]:text-foreground aria-[current=page]:shadow-[inset_0_0_0_1px_rgba(255,64,85,.45)] aria-[current=page]:[&_svg]:text-primary"><Icon className="size-[18px]!" aria-hidden="true" /><span>{text[tab]}</span></Button> })}</nav>
        {uid && a?.eligible && <div className="mx-2 mt-3 grid gap-1.5 border-0 border-t border-solid border-border pt-3"><span className="text-xs font-medium text-muted-foreground">{text.myDiscord}</span>{knownDiscord ? <code className="select-text font-mono text-sm text-foreground [overflow-wrap:anywhere]">{knownDiscord}</code> : null}<Button variant="outline" size="sm" className="justify-self-start" disabled={busy} onClick={() => open('discord')}>{knownDiscord ? text.editDiscord : text.addDiscord}</Button></div>}
      </Card>
      <div className="grid min-w-0 gap-5">
        <div className="grid gap-2 empty:hidden" aria-live="polite">{message && <p role="status" className={muted}>{message}</p>}{error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}</div>
        {!allowed ? <Card className="grid max-w-[640px] justify-items-start gap-3 p-6"><UsersRound size={28} className="text-primary" /><h2 className={cn(heading, 'text-2xl')}>{text.accessTitle}</h2>{gate && <p className={muted}>{gate}</p>}{uid ? <Button variant="outline" onClick={() => setRefresh(n => n + 1)} disabled={loading}>{text.retry}</Button> : auth.status !== 'loading' && <Button onClick={onLogin}>{text.login}</Button>}</Card> : <>
          {area === 'find' && <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={cn(heading, 'flex items-baseline gap-2.5 text-xl')}>{text.roomsTitle}{!loading && <span className="font-mono text-base font-medium tabular-nums text-muted-foreground">{snapshot.rooms.length}</span>}</h2>
            <div className="flex flex-wrap items-center gap-2">{pushButton}<Button variant="outline" onClick={() => navigate('mine')}>{text.manageRoom}</Button>{createButton}</div>
          </div>}
          {area !== 'moderation' && snapshot.notifications.length > 0 && <details className="group px-1"><summary className="cursor-pointer py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">{text.notifications} ({snapshot.notifications.length})</summary><ul className="m-0 grid gap-1.5 py-2 pl-5 text-sm text-foreground">{snapshot.notifications.map(n => <li key={n.id}>{value(n.kind)} <time dateTime={n.created_at} className="ml-2.5 text-xs text-muted-foreground">{date(n.created_at)}</time></li>)}</ul><Button variant="ghost" size="sm" onClick={() => void clearNotifications().then(() => setRefresh(n => n + 1)).catch(() => setError(text.network))}>{text.clearAll}</Button></details>}
          {area !== 'find' && <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-wrap items-center gap-2">{refreshButton}{pushButton}</div>{area === 'mine' && createButton}</div>}
          {(area === 'find' || area === 'mine') && (!a?.creation_enabled || a.publication_restricted) && <p className={muted}>{text.creationOff}</p>}
          {area === 'find' && <div role="search" aria-label={text.filtersTitle} className="grid gap-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <GameSelect className="col-span-2 sm:col-span-1" label={text.game} value={filters.game} allowAll allLabel={text.allGames} options={gameOptions} popular={popularGames} copy={pickerCopy} onValueChange={game => setFilter({ game, platform: '' })} />
              <Button variant="outline" title={text.retry} onClick={() => setRefresh(n => n + 1)} disabled={loading || busy} className="max-sm:w-11 max-sm:px-0 sm:order-last"><RefreshCw /><span className="max-sm:sr-only">{text.retry}</span></Button>
              <SelectField inline label={text.platform} value={filters.platform} allLabel={text.all} format={format} options={platformIds} onValueChange={platform => setFilter({ platform })} />
              <SelectField inline className="max-sm:col-span-2" label={text.region} value={filters.region} allLabel={text.all} format={format} options={regions} onValueChange={region => setFilter({ region })} />
            </div>
            {activeFilters.length > 0 && <div role="group" aria-label={text.activeFilters} className="flex flex-wrap items-center gap-1.5">
              {activeFilters.map(([key, label]) => <button key={key} type="button" aria-label={`${text.removeFilter}: ${label}`} onClick={() => setFilter({ [key]: '' })}
                className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-solid border-primary/40 bg-primary/12 py-1 pr-2 pl-3 font-sans text-[13px] font-medium leading-none text-foreground outline-none transition-colors hover:border-primary/70 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="truncate">{label}</span><X aria-hidden="true" className="size-3.5 flex-none text-muted-foreground" />
              </button>)}
              <Button variant="ghost" size="sm" onClick={() => setFilter({ game: '', platform: '', region: '', mode: '' })}>{text.clearFilters}</Button>
            </div>}
          </div>}
          {loading && <p role="status" className={muted}>{text.loading}</p>}
          {!loading && (area === 'find' || area === 'mine') && <>
            {!snapshot.rooms.length && <p className={cn(muted, 'py-7')}>{text.empty}</p>}
            <div className={roomGrid(area === 'mine')}>{snapshot.rooms.slice(0, pageSize).map(room => <MotionCard {...enter} key={room.id} spotlight className={cardBody}>
              {roomInfo(room)}
              {area === 'find' ? <div className="mt-auto grid grid-cols-2 gap-2">
                <Button className="col-span-2" disabled={busy || room.status !== 'open'} onClick={() => open('request', room)}>{text.request}</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => open('report', room)}>{text.report}</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => open('block', room)}>{text.block}</Button>
              </div> : <>
                {['open', 'reserved'].includes(room.status) && <Button variant="outline" className="justify-self-start" disabled={busy} onClick={() => open('cancel', room)}>{text.end}</Button>}
                <div className="grid">
                  {snapshot.requests.filter(q => q.room_id === room.id).slice(0, pageSize).map(q => <motion.div {...enter} key={q.id} className={section}>
                    {identity(q.avatar_id, q.nickname, <Badge variant={q.status === 'pending' ? 'outline' : q.status === 'accepted' ? 'default' : 'secondary'}>{statuses[q.status]}</Badge>)}
                    <p className={muted}>{platforms[q.platform]} · {date(q.requested_at)}</p>
                    {q.status === 'accepted' && q.reserved_until && <p className={muted}>{text.confirmBy}: {date(q.reserved_until)}</p>}
                    {q.discord_username && privateContact(q.discord_username)}
                    <div className="flex flex-wrap gap-2">
                      {q.status === 'pending' && <><Button size="sm" disabled={busy || room.status !== 'open'} onClick={() => open('accept', room, q)}>{text.accept}</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void act('decline', { room_id: room.id, request_id: q.id })}>{text.decline}</Button></>}
                      {q.status === 'accepted' && <><Button size="sm" disabled={busy} onClick={() => open('confirm', room, q)}>{text.confirm}</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => open('release', room, q)}>{text.release}</Button></>}
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => open('report', room, q)}>{text.report}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => open('block', room, q)}>{text.block}</Button>
                    </div>
                  </motion.div>)}
                  {snapshot.requests.length === 0 && ['open', 'reserved'].includes(room.status) && <p className={cn(muted, 'pt-2')}>{text.noRequests}</p>}
                  {pagerControls(hostPage, snapshot.requests.length > pageSize, d => setHostPage(n => n + d), busy)}
                </div>
              </>}
            </MotionCard>)}</div>{pager(snapshot.rooms.length > pageSize)}
          </>}
          {!loading && area === 'requests' && <>{!snapshot.requests.length && <p className={cn(muted, 'py-7')}>{text.noRequests}</p>}<div className={roomGrid()}>{snapshot.requests.slice(0, pageSize).map(q => <MotionCard {...enter} key={q.id} spotlight className={cardBody}>
            {roomInfo(q.room)}
            <div className="flex items-center justify-between gap-3"><h3 className={cn(heading, 'font-sans text-sm')}>{statuses[q.status]}</h3><p className={cn(muted, 'text-xs')}>{date(q.requested_at)}</p></div>
            {q.status === 'accepted' && <div className={section}><h3 className={cn(heading, 'font-sans text-sm')}>{text.accepted}</h3><p className={muted}>{text.acceptedHint}</p><Button className="justify-self-start" disabled={busy} onClick={() => void act('host_contact', { room_id: q.room_id })}>{text.contact}</Button>{contact?.roomId === q.room_id && privateContact(contact.data.discord_username, contact.data.nickname)}</div>}
            <div className="mt-auto flex flex-wrap gap-2">{q.status === 'pending' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void act('withdraw', { room_id: q.room_id, request_id: q.id })}>{text.withdraw}</Button>}<Button variant="ghost" size="sm" disabled={busy} onClick={() => open('report', q.room)}>{text.report}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => open('block', q.room)}>{text.block}</Button></div>
          </MotionCard>)}</div>{pager(snapshot.requests.length > pageSize)}</>}
          {!loading && area === 'blocks' && <Card className="gap-3 p-5 sm:p-6">{!snapshot.blocks.length && <p className={muted}>{text.noBlocks}</p>}{snapshot.blocks.slice(0, pageSize).map(b => <div key={b.id} className="flex items-center justify-between gap-3 border-0 border-b border-solid border-border pb-3 text-sm font-medium text-foreground last-of-type:border-0"><span className="[overflow-wrap:anywhere]">{b.nickname}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => void act('unblock', { id: b.id })}>{text.unblock}</Button></div>)}{pager(snapshot.blocks.length > pageSize)}</Card>}
          {!loading && area === 'moderation' && snapshot.moderation && <Card className="gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><h2 className={cn(heading, 'text-lg')}>{text.capacity}</h2><Button variant="outline" disabled={busy} onClick={() => setDialog({ action: 'mod_capacity', enabled: !snapshot.moderation!.creation_enabled })}>{snapshot.moderation.creation_enabled ? text.disable : text.enable}</Button></div>
            <SelectField className="max-w-xs" label={text.moderation} value={reportStatus} format={format} options={['pending', 'all']} onValueChange={v => { setReportStatus(v); setPage(0) }} />
            <h2 className={cn(heading, 'text-lg')}>{reportStatus === 'pending' ? text.pendingReports : text.history}</h2>
            {snapshot.moderation.reports.length === 0 && <p className={muted}>{text.noRequests}</p>}
            {snapshot.moderation.reports.slice(0, pageSize).map(report => <div key={report.id} className="grid gap-2.5 rounded-lg border border-solid border-border bg-black/20 p-4"><h3 className={cn(heading, 'font-sans text-[15px]')}>{report.nickname}</h3><p className={muted}>{value(report.category)} · {value(report.status)} · {date(report.created_at)}</p><div className="flex flex-wrap gap-2">{(['dismiss', 'resolve', 'restrict', 'suspend', 'restore', 'cancel_room'] as const).map(decision => <Button variant="outline" size="sm" key={decision} disabled={busy} onClick={() => setDialog({ action: 'mod_decide', id: report.id, decision })}>{text[decision === 'cancel_room' ? 'cancelRoom' : decision]}</Button>)}</div></div>)}
            <h2 className={cn(heading, 'text-lg')}>{text.restrictions}</h2>{snapshot.moderation.restrictions.slice(0, pageSize).map(r => <p key={r.user_id} className={muted}>{r.nickname} · {r.suspended ? text.suspend : r.publication_restricted ? text.restrict : text.restore}</p>)}
            <details><summary className="cursor-pointer py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">{text.decisions}</summary>{snapshot.moderation.actions.slice(0, pageSize).map(d => <p key={d.id} className={muted}>{value(d.action_type)} · {value(d.reason)} · {date(d.created_at)}</p>)}</details>
            <details><summary className="cursor-pointer py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">{text.blocks} ({snapshot.moderation.blocks.length})</summary>{snapshot.moderation.blocks.slice(0, pageSize).map((b, i) => <p key={i} className={muted}>{b.blocker_user_id} → {b.blocked_user_id} · {date(b.created_at)}</p>)}</details>
            {pager(Math.max(snapshot.moderation.reports.length, snapshot.moderation.actions.length, snapshot.moderation.blocks.length, snapshot.moderation.restrictions.length) > pageSize)}
          </Card>}
        </>}
      </div>
    </div>
    {dialog && <SquadDialog key={`${dialog.action}:${dialog.room?.id}:${dialog.request?.id}`} dialog={dialog} lang={lang} knownDiscord={knownDiscord} busy={busy} error={error} onClose={() => { if (!busy) setDialog(null) }} onSubmit={payload => void act(dialog.action, payload)} />}
  </div>
}

function SquadDialog({ dialog, lang, knownDiscord, busy, error, onClose, onSubmit }: { dialog: DialogState; lang: 'pt' | 'en'; knownDiscord: string; busy: boolean; error: string; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => void }) {
  const text = squadCopy[lang]
  const value = (v: string) => valueCopy[v]?.[lang === 'pt' ? 0 : 1] ?? v
  const format = (v: string) => optionLabel(v, value)
  const discordId = useId()
  const discordInput = useRef<HTMLInputElement>(null)
  // No DialogTrigger here: return focus to whatever opened the dialog.
  const trigger = useRef(document.activeElement as HTMLElement | null)
  const [game, setGame] = useState<SquadGame>(dialog.room?.game_id ?? 'valorant')
  const [platform, setPlatform] = useState<SquadPlatform>(dialog.room?.platform ?? 'pc')
  const [region, setRegion] = useState('sa'), [mode, setMode] = useState(''), [rank, setRank] = useState(''), [slots, setSlots] = useState('1')
  const [remember, setRemember] = useState(true)
  const [discord, setDiscord] = useState(knownDiscord), [mic, setMic] = useState(true), [consent, setConsent] = useState(false), [category, setCategory] = useState('harassment')
  const [invalid, setInvalid] = useState(false), [invalidText, setInvalidText] = useState(false)
  // Create keeps the essentials visible; optional fields (and an already saved Discord) live under "More options".
  const [more, setMore] = useState(false)
  const creating = dialog.action === 'create', requesting = dialog.action === 'request', editingDiscord = dialog.action === 'discord'
  const titles: Record<string, string> = { discord: text.discordTitle, create: text.create, request: text.request, accept: text.accept, confirm: text.confirm, release: text.release, cancel: text.end, report: text.report, block: text.block, mod_decide: text.moderation, mod_capacity: text.capacity }
  const hints: Record<string, string> = { discord: text.discordSaveHint, create: text.hostDisclosure, request: text.disclosure, accept: text.hostDisclosure, confirm: text.confirmHint, release: text.releaseHint, cancel: text.endHint, report: text.reportHint, block: text.blockHint, mod_decide: text.modHint, mod_capacity: text.modHint }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if ((creating || requesting || editingDiscord) && !validDiscord(discord)) { setInvalid(true); if (discordInMore) flushSync(() => setMore(true)); discordInput.current?.focus(); return }
    if (creating && !(validFreeText(mode.trim()) && validFreeText(rank.trim()))) { setInvalidText(true); setMore(true); return }
    const payload: Record<string, unknown> = { room_id: dialog.room?.id, request_id: dialog.request?.id }
    if (creating) Object.assign(payload, { game_id: game, platform, region, game_mode: mode.trim(), rank_info: rank.trim(), slots: Number(slots), microphone_required: mic, crossplay: true, discord_username: discord })
    if (requesting) Object.assign(payload, { platform, discord_username: discord, consent })
    if (creating || requesting) payload.remember = remember
    if (editingDiscord) { onSubmit({ discord_username: discord }); return }
    if (dialog.action === 'report') payload.category = category
    if (dialog.action === 'mod_decide') Object.assign(payload, { report_id: dialog.id, decision: dialog.decision, reason: category })
    if (dialog.action === 'mod_capacity') payload.enabled = dialog.enabled
    onSubmit(payload)
  }
  const pickGame = (v: string) => setGame(v as SquadGame)
  const discordInMore = creating && Boolean(knownDiscord)
  const discordField = <div className="grid gap-2">
    <Label htmlFor={discordId}>{text.discord}</Label>
    <Input ref={discordInput} id={discordId} name="discord" autoComplete="off" maxLength={32} value={discord} aria-invalid={invalid} aria-describedby={`${discordId}-hint ${discordId}-error`} onChange={e => { setDiscord(e.target.value); setInvalid(false) }} />
    <small id={`${discordId}-hint`} className="text-xs leading-relaxed text-muted-foreground">{text.discordHint}</small>
    <span id={`${discordId}-error`} className="text-xs text-destructive empty:hidden">{invalid ? text.invalidDiscord : ''}</span>
  </div>
  const title = dialog.action === 'mod_decide' ? value(dialog.decision ?? '') : titles[dialog.action] ?? text.confirm
  return <Dialog open onOpenChange={next => { if (!next) onClose() }}>
    <DialogContent showCloseButton={false} className="max-w-[560px]"
      onEscapeKeyDown={e => { if (busy) e.preventDefault() }} onInteractOutside={e => { if (busy) e.preventDefault() }}
      onCloseAutoFocus={e => { e.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus() }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle>{!creating && <DialogDescription>{hints[dialog.action]}</DialogDescription>}</DialogHeader>
      <form noValidate onSubmit={submit} className="grid gap-5">
        {creating && <>
          <GameSelect label={text.game} value={game} onValueChange={pickGame} options={gameOptions} popular={popularGames} copy={{ search: text.searchGame, empty: text.noGames, popular: text.popularGames }} />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SelectField label={text.platform} value={platform} format={format} options={platformIds} onValueChange={v => setPlatform(v as SquadPlatform)} />
            <SelectField label={text.region} value={region} format={format} options={regions} onValueChange={setRegion} />
          </div>
          {!discordInMore && discordField}
          <details open={more} onToggle={e => setMore(e.currentTarget.open)} className="group">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden="true" className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" />{text.moreOptions}
            </summary>
            <div className="grid gap-4 pt-4">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <SelectField label={text.slots} value={slots} format={v => v} options={['1', '2', '3', '4']} onValueChange={setSlots} />
                <span aria-hidden="true" className="max-sm:hidden" />
                <div className="grid gap-2"><Label htmlFor={`${discordId}-mode`}>{text.mode} <span className="font-normal text-muted-foreground">({text.optional.toLowerCase()})</span></Label><Input id={`${discordId}-mode`} maxLength={24} autoComplete="off" value={mode} aria-invalid={invalidText} onChange={e => { setMode(e.target.value); setInvalidText(false) }} /></div>
                <div className="grid gap-2"><Label htmlFor={`${discordId}-rank`}>{text.rank} <span className="font-normal text-muted-foreground">({text.optional.toLowerCase()})</span></Label><Input id={`${discordId}-rank`} maxLength={24} autoComplete="off" value={rank} aria-invalid={invalidText} onChange={e => { setRank(e.target.value); setInvalidText(false) }} /></div>
              </div>
              {invalidText && <p role="alert" className="m-0 text-xs text-destructive">{text.invalidText}</p>}
              <CheckField checked={mic} onCheckedChange={setMic}>{text.mic}</CheckField>
              {discordInMore && discordField}
              <CheckField checked={remember} onCheckedChange={setRemember}>{text.rememberDiscord}</CheckField>
            </div>
          </details>
        </>}
        {requesting && dialog.room && <SelectField label={text.platform} value={platform} format={format} options={platformIds} onValueChange={v => setPlatform(v as SquadPlatform)} />}
        {(requesting || editingDiscord) && discordField}
        {requesting && <CheckField checked={remember} onCheckedChange={setRemember}>{text.rememberDiscord}</CheckField>}
        {requesting && <CheckField checked={consent} onCheckedChange={setConsent}>{text.consent}</CheckField>}
        {(dialog.action === 'report' || dialog.action === 'mod_decide') && <SelectField label={text.category} value={category} format={format} options={['harassment', 'abuse', 'spam', 'suspicious', 'privacy', 'other']} onValueChange={setCategory} />}
        {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
        {creating && <DialogDescription className="flex items-start gap-2 text-xs"><Info aria-hidden="true" className="mt-px size-3.5 flex-none" />{text.hostDisclosure}</DialogDescription>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{text.cancel}</Button>
          <Button type="submit" disabled={busy || (requesting && !consent)} aria-busy={busy}>{creating ? text.publish : editingDiscord ? text.save : dialog.action === 'mod_capacity' ? dialog.enabled ? text.enable : text.disable : title}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
