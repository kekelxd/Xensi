import { motion } from 'motion/react'
import { XensiPageHeader, XensiSection } from './design/Primitives'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'
import { Check, ChevronRight, Crosshair, Download, Edit3, Gauge, Plus, RefreshCw, Search, Star, Trash2, X } from 'lucide-react'
import { AvatarArtwork } from './AvatarArtwork'
import { AvatarPicker } from './AvatarPicker'
import { GAME_SENSITIVITY_PROFILES, GAME_SENSITIVITY_PROFILE_BY_ID, type GameSensitivityProfileId } from './gameSensitivityProfiles'
import { useI18n, type Locale } from './i18n'
import { calculatePresetCm360, readPlayerProfile, writePlayerProfile, type SensitivityPreset } from './playerProfileStore'
import { getPresetRepository } from './presetRepository'
import { getRoutineRepository } from './routineRepository'
import { useRoutineState } from './useRoutineState'
import { getSessionRepository, useSessionState } from './sessionRepository'
import { GameBadge } from './GameBadge'
import { usePlayerProfile, usePresetState } from './useSensitivityPreset'
import { normalizeSensitivityForGame } from './sensitivityConversionEngine'
import { updateAuthenticatedProfile } from './authService'
import { useAccountIdentity } from './useAccountIdentity'

const MotionCard = motion.create(Card)
const optionCls = 'cursor-pointer rounded-none border-0 bg-transparent px-3 py-2.5 text-left font-sans text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 focus-visible:outline-none aria-selected:text-primary'
const iconlessSm = 'max-[480px]:[&_svg]:hidden'

export type ProfilePresetLaunch = Pick<SensitivityPreset, 'id' | 'gameId' | 'sensitivity' | 'dpi'>

type PlayerProfileProps = {
  onConvert: (preset: ProfilePresetLaunch) => void
  onCalibrate: (preset: ProfilePresetLaunch) => void
}

type PresetDraft = {
  id?: string
  gameId: GameSensitivityProfileId
  name: string
  sensitivity: string
  dpi: string
  isPrimary: boolean
  createdAt?: string
}

const copy = {
  pt: {
    title: 'Perfil',
    kicker: 'Jogador · seu loadout',
    subtitle: 'Sua identidade e sensibilidades salvas.',
    memberSince: 'Membro desde',
    savedCount: (n: number) => `${n} ${n === 1 ? 'configuração salva' : 'configurações salvas'}`,
    listHint: 'Gerencie suas configurações por jogo.',
    identity: 'Identidade',
    editProfile: 'Editar perfil',
    nickname: 'Nickname',
    avatar: 'Avatar XENSI',
    changeAvatar: 'Trocar',
    doneAvatar: 'Concluir',
    saved: 'Alterações salvas',
    sensitivities: 'Sensibilidades salvas',
    add: 'Adicionar',
    emptyTitle: 'Nenhuma sensibilidade salva.',
    emptyText: 'Salve a configuração dos jogos que você usa para acessar rapidamente o conversor e a calibração.',
    addSensitivity: 'Adicionar sensibilidade',
    activeConfig: 'Configuração ativa',
    inUseNow: 'Em uso agora',
    allGames: 'Todos os jogos',
    filterGame: 'Filtro de presets',
    searchPlaceholder: 'Buscar configurações...',
    clearSearch: 'Limpar busca',
    noResults: 'Nenhuma sensibilidade encontrada.',
    addTileTitle: 'Adicionar nova sensibilidade',
    addTileText: 'Salve suas configurações para seus jogos favoritos.',
    primary: 'Principal',
    setPrimary: 'Definir como principal',
    sensitivity: 'Sensibilidade',
    dpi: 'DPI',
    unavailable: 'cm/360 indisponível',
    unavailableHint: 'Este perfil de jogo ainda não possui cálculo físico compatível.',
    edit: 'Editar',
    calibrate: 'Calibrar',
    convert: 'Converter',
    remove: 'Remover',
    editIdentity: 'Editar identidade',
    editPreset: 'Editar sensibilidade',
    addPreset: 'Adicionar sensibilidade',
    game: 'Jogo',
    presetName: 'Nome do preset (opcional)',
    save: 'Salvar',
    cancel: 'Cancelar',
    confirmRemoveTitle: 'Remover sensibilidade?',
    confirmRemoveText: 'Esta configuração será removida do seu perfil.',
    calibratorUnavailable: 'Calibração indisponível para este jogo',
    invalid: 'Informe sensibilidade e DPI válidos.',
  },
  en: {
    title: 'Profile',
    kicker: 'Player · your loadout',
    subtitle: 'Your identity and saved sensitivities.',
    memberSince: 'Member since',
    savedCount: (n: number) => `${n} saved ${n === 1 ? 'setting' : 'settings'}`,
    listHint: 'Manage your settings per game.',
    identity: 'Identity',
    editProfile: 'Edit profile',
    nickname: 'Nickname',
    avatar: 'XENSI avatar',
    changeAvatar: 'Change',
    doneAvatar: 'Done',
    saved: 'Changes saved',
    sensitivities: 'Saved sensitivities',
    add: 'Add',
    emptyTitle: 'No saved sensitivities.',
    emptyText: 'Save the settings for the games you use to quickly access conversion and calibration.',
    addSensitivity: 'Add sensitivity',
    activeConfig: 'Active configuration',
    inUseNow: 'In use now',
    allGames: 'All games',
    filterGame: 'Preset filter',
    searchPlaceholder: 'Search configurations...',
    clearSearch: 'Clear search',
    noResults: 'No sensitivities found.',
    addTileTitle: 'Add new sensitivity',
    addTileText: 'Save settings for your favorite games.',
    primary: 'Primary',
    setPrimary: 'Set as primary',
    sensitivity: 'Sensitivity',
    dpi: 'DPI',
    unavailable: 'cm/360 unavailable',
    unavailableHint: 'This game profile does not support a compatible physical calculation yet.',
    edit: 'Edit',
    calibrate: 'Calibrate',
    convert: 'Convert',
    remove: 'Remove',
    editIdentity: 'Edit identity',
    editPreset: 'Edit sensitivity',
    addPreset: 'Add sensitivity',
    game: 'Game',
    presetName: 'Preset name (optional)',
    save: 'Save',
    cancel: 'Cancel',
    confirmRemoveTitle: 'Remove sensitivity?',
    confirmRemoveText: 'This configuration will be removed from your profile.',
    calibratorUnavailable: 'Calibration is unavailable for this game',
    invalid: 'Enter a valid sensitivity and DPI.',
  },
  es: {
    title: 'Perfil',
    kicker: 'Jugador · tu loadout',
    subtitle: 'Tu identidad y sensibilidades guardadas.',
    memberSince: 'Miembro desde',
    savedCount: (n: number) => `${n} ${n === 1 ? 'configuración guardada' : 'configuraciones guardadas'}`,
    listHint: 'Gestiona tus configuraciones por juego.',
    identity: 'Identidad',
    editProfile: 'Editar perfil',
    nickname: 'Nickname',
    avatar: 'Avatar XENSI',
    changeAvatar: 'Cambiar',
    doneAvatar: 'Listo',
    saved: 'Cambios guardados',
    sensitivities: 'Sensibilidades guardadas',
    add: 'Añadir',
    emptyTitle: 'No hay sensibilidades guardadas.',
    emptyText: 'Guarda la configuración de tus juegos para acceder rápidamente al conversor y a la calibración.',
    addSensitivity: 'Añadir sensibilidad',
    activeConfig: 'Configuración activa',
    inUseNow: 'En uso ahora',
    allGames: 'Todos los juegos',
    filterGame: 'Filtro de presets',
    searchPlaceholder: 'Buscar configuraciones...',
    clearSearch: 'Limpiar búsqueda',
    noResults: 'No se encontraron sensibilidades.',
    addTileTitle: 'Añadir nueva sensibilidad',
    addTileText: 'Guarda configuraciones para tus juegos favoritos.',
    primary: 'Principal',
    setPrimary: 'Marcar como principal',
    sensitivity: 'Sensibilidad',
    dpi: 'DPI',
    unavailable: 'cm/360 no disponible',
    unavailableHint: 'Este perfil de juego aún no admite un cálculo físico compatible.',
    edit: 'Editar',
    calibrate: 'Calibrar',
    convert: 'Convertir',
    remove: 'Eliminar',
    editIdentity: 'Editar identidad',
    editPreset: 'Editar sensibilidad',
    addPreset: 'Añadir sensibilidad',
    game: 'Juego',
    presetName: 'Nombre del preset (opcional)',
    save: 'Guardar',
    cancel: 'Cancelar',
    confirmRemoveTitle: '¿Eliminar sensibilidad?',
    confirmRemoveText: 'Esta configuración será eliminada de tu perfil.',
    calibratorUnavailable: 'La calibración no está disponible para este juego',
    invalid: 'Introduce una sensibilidad y un DPI válidos.',
  },
} satisfies Record<Locale, Record<string, string | ((n: number) => string)>>

const CALIBRATOR_GAMES = new Set<GameSensitivityProfileId>(['cs2', 'valorant', 'overwatch2', 'warzone'])

export function PlayerProfile({ onConvert, onCalibrate }: PlayerProfileProps) {
  const { locale, t, localeTag } = useI18n()
  const text = copy[locale]
  const profile = usePlayerProfile()
  const account = useAccountIdentity()
  const sync = usePresetState()
  const routineSync = useRoutineState(), sessionSync = useSessionState()
  const presetDisabled = sync.status !== 'ready' || sync.busy
  const importPending = sync.pendingImport + routineSync.pendingImport + sessionSync.pendingImport
  const importLabel = t(routineSync.pendingImport > 0 || sessionSync.pendingImport > 0 ? 'accountData.importTitle' : 'presets.import')
  const importDisabled = presetDisabled || routineSync.status !== 'ready' || sessionSync.status !== 'ready'
    || routineSync.busy || sessionSync.busy || sync.userId !== routineSync.userId || sync.userId !== sessionSync.userId
  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityDraft, setIdentityDraft] = useState({ nickname: profile.nickname, avatarId: profile.avatarId })
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null)
  const [pendingRemove, setPendingRemove] = useState<SensitivityPreset | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [gameFilter, setGameFilter] = useState<'all' | GameSensitivityProfileId>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [presetGameOpen, setPresetGameOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const activePreset = profile.presets.find((preset) => preset.isPrimary) ?? profile.presets[0] ?? null
  const activeGame = activePreset ? GAME_SENSITIVITY_PROFILE_BY_ID[activePreset.gameId] : null
  const activeCm360 = activePreset ? calculatePresetCm360(activePreset) : null
  const selectedFilterLabel = gameFilter === 'all' ? text.allGames : GAME_SENSITIVITY_PROFILE_BY_ID[gameFilter].name
  const filteredPresets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return profile.presets.filter((preset) => {
      const game = GAME_SENSITIVITY_PROFILE_BY_ID[preset.gameId]
      const matchesGame = gameFilter === 'all' || preset.gameId === gameFilter
      const haystack = `${preset.name ?? ''} ${game.name} ${game.shortName} ${preset.sensitivity} ${preset.dpi}`.toLowerCase()
      return matchesGame && (!query || haystack.includes(query))
    })
  }, [gameFilter, profile.presets, searchQuery])

  const savedStatus = () => {
    setStatus(text.saved)
    window.setTimeout(() => setStatus(''), 1600)
  }

  const openIdentity = () => {
    setIdentityDraft({ nickname: profile.nickname, avatarId: profile.avatarId })
    setIdentityOpen(true)
  }

  const saveIdentity = async () => {
    const nextIdentity = { nickname: identityDraft.nickname.trim() || 'xensi_dev', avatarId: identityDraft.avatarId }
    const result = await updateAuthenticatedProfile(nextIdentity)
    if (!result.ok) {
      setError(result.message ?? text.invalid)
      return
    }
    writePlayerProfile(window.localStorage, { ...readPlayerProfile(window.localStorage), ...nextIdentity })
    savedStatus()
    setIdentityOpen(false)
  }

  const openNewPreset = () => {
    setError('')
    setPresetGameOpen(false)
    setPresetDraft({ gameId: 'cs2', name: '', sensitivity: '1', dpi: '800', isPrimary: profile.presets.length === 0 })
  }

  const openPreset = (preset: SensitivityPreset) => {
    setError('')
    setPresetGameOpen(false)
    setPresetDraft({ id: preset.id, gameId: preset.gameId, name: preset.name ?? '', sensitivity: String(preset.sensitivity), dpi: String(preset.dpi), isPrimary: preset.isPrimary, createdAt: preset.createdAt })
  }

  const savePreset = async () => {
    if (!presetDraft) return
    const sensitivity = Number(presetDraft.sensitivity.replace(',', '.'))
    const dpi = Number(presetDraft.dpi.replace(',', '.'))
    const gameProfile = GAME_SENSITIVITY_PROFILE_BY_ID[presetDraft.gameId]
    const normalized = normalizeSensitivityForGame(sensitivity, gameProfile)
    const storedSensitivity = gameProfile.inputModel.type === 'unavailable' ? sensitivity : normalized
    if (storedSensitivity === null || !Number.isFinite(sensitivity) || sensitivity <= 0 || !Number.isFinite(dpi) || dpi <= 0) {
      setError(text.invalid)
      return
    }
    const values = { gameId: presetDraft.gameId, name: presetDraft.name, sensitivity: storedSensitivity,
      dpi: Math.round(dpi), isPrimary: presetDraft.isPrimary }
    const repository = getPresetRepository()
    const ok = presetDraft.id ? await repository.update(presetDraft.id, values) : await repository.create(values)
    if (ok) { savedStatus(); setPresetDraft(null) } else setError(t('presets.syncFailure'))
  }

  const setPrimary = async (id: string) => {
    if (await getPresetRepository().setPrimary(id)) savedStatus()
  }

  const removePreset = async (id: string) => {
    if (await getPresetRepository().remove(id)) { savedStatus(); setPendingRemove(null) }
  }

  const eyebrow = 'text-xs font-medium leading-none text-subtle'
  const pill = 'inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold leading-none tracking-[var(--tracking-eyebrow)] text-primary [text-transform:var(--case-eyebrow)]'
  const metric = 'grid min-w-0 gap-1.5 border-0 bg-transparent px-4 py-1 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-solid [&:not(:first-child)]:border-border'
  const joinedLabel = (() => {
    if (!account.joined) return ''
    const date = new Date(account.joined)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(localeTag, { month: 'long', year: 'numeric' })
  })()

  return <section className="xb-page pt-[var(--xensi-page-space)] pb-18">
    <div data-page-motion className="mx-auto w-[min(var(--xensi-max-width),calc(100%_-_var(--xensi-gutter)_*_2))] max-w-full">
      <XensiPageHeader title={text.title} description={text.subtitle} actions={status ? <small className="inline-flex items-center gap-2 text-sm font-medium text-success"><Check size={14} /> {status}</small> : undefined} />

      <div data-reveal className="mb-8 grid grid-cols-1 gap-5 min-[1001px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card spotlight className="profile-v1-identity overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-6 pt-5">
            <span className={eyebrow}>{text.identity}</span>
            <Button variant="outline" size="sm" onClick={openIdentity}><Edit3 /> {text.editProfile}</Button>
          </header>
          <div className="profile-v1-person flex flex-1 items-center gap-6 px-6 py-6 max-[640px]:flex-col max-[640px]:items-start">
            <div className="size-[132px] flex-none rounded-full bg-primary p-1 shadow-[0_18px_40px_-20px_rgba(255,64,85,.7)]"><AvatarArtwork avatarId={profile.avatarId} size="lg" className="size-full rounded-full border-0 bg-muted shadow-none" /></div>
            <div className="profile-v1-identity-copy grid min-w-0 gap-2">
              <h2 className="m-0 font-heading text-[clamp(28px,2.8vw,38px)] font-semibold leading-[1.1] tracking-[-0.02em] [overflow-wrap:anywhere]">{profile.nickname}</h2>
              <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {joinedLabel && <span>{text.memberSince} {joinedLabel}</span>}
                <span>{text.savedCount(profile.presets.length)}</span>
              </p>
            </div>
          </div>
        </Card>

        <Card spotlight className="overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-6 pt-5"><span className={eyebrow}>{text.activeConfig}</span>{activePreset && <small className="inline-flex items-center gap-2 text-xs font-medium leading-none text-success"><i className="size-2 rounded-full bg-success shadow-[0_0_10px_var(--success)]" /> {text.inUseNow}</small>}</header>
          {activePreset && activeGame ? <>
            <div className="flex items-center gap-4 px-6 pt-5">
              <GameBadge gameId={activePreset.gameId} selected />
              <div className="grid min-w-0 gap-2"><h2 className="m-0 font-heading text-[clamp(22px,2.2vw,30px)] font-semibold leading-[1.1] tracking-[-0.01em]">{activeGame.name}</h2>{activePreset.isPrimary && <span className={cn(pill, 'w-fit')}><Star size={11} /> {text.primary}</span>}</div>
            </div>
            <dl className="m-0 grid grid-cols-3 px-6 pt-6">
              <div className={metric}><dt className={eyebrow}>{text.sensitivity}</dt><dd className="m-0 truncate font-mono text-[clamp(20px,2.2vw,30px)] font-medium leading-none tabular-nums">{activePreset.sensitivity}</dd></div>
              <div className={metric}><dt className={eyebrow}>{text.dpi}</dt><dd className="m-0 truncate font-mono text-[clamp(20px,2.2vw,30px)] font-medium leading-none tabular-nums">{activePreset.dpi}</dd></div>
              <div className={metric}><dt className={eyebrow}>cm/360</dt><dd className={cn('m-0 font-mono font-medium leading-none tabular-nums', activeCm360 === null ? 'text-sm leading-tight' : 'whitespace-nowrap text-[clamp(20px,2.2vw,30px)]')}>{activeCm360 === null ? text.unavailable : `${activeCm360.toFixed(2)} cm`}</dd></div>
            </dl>
            <footer className="mt-auto flex flex-wrap gap-2.5 px-6 pt-6 pb-6">
              <Button onClick={() => onCalibrate(activePreset)} disabled={!CALIBRATOR_GAMES.has(activePreset.gameId)} title={!CALIBRATOR_GAMES.has(activePreset.gameId) ? text.calibratorUnavailable : undefined}><Gauge /> {text.calibrate}</Button>
              <Button variant="outline" onClick={() => onConvert(activePreset)}><RefreshCw /> {text.convert}</Button>
            </footer>
          </> : sync.status !== 'ready' ? <p role="status" className="m-0 p-6 text-sm text-muted-foreground">{t('presets.loading')}</p> : <div className="grid justify-items-start gap-3 p-6"><Crosshair size={24} className="text-primary" /><h2 className="m-0 font-heading text-2xl font-semibold leading-[1.15]">{text.activeConfig}</h2><p className="m-0 text-muted-foreground">{text.emptyText}</p><Button disabled={presetDisabled} onClick={openNewPreset}><Plus /> {text.add}</Button></div>}
        </Card>
      </div>

      <XensiSection className="m-0 border-0 bg-transparent p-0 shadow-none">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-0 bg-transparent bg-none p-0">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="grid size-11 flex-none place-items-center rounded-lg border border-solid border-border bg-card text-primary" aria-hidden="true"><Crosshair size={20} /></span>
            <div className="grid min-w-0 gap-1">
              <h2 className="m-0 font-heading text-xl font-semibold leading-tight tracking-[-0.01em]">{text.sensitivities}</h2>
              <p className="m-0 text-sm text-muted-foreground">{text.listHint}</p>
            </div>
            {sync.userId && <Button variant="outline" size="icon" disabled={presetDisabled} title={t('presets.refresh')} aria-label={t('presets.refresh')} onClick={() => void getPresetRepository().refresh()}><RefreshCw /></Button>}
            {importPending > 0 && <Button variant="outline" size="icon" disabled={importDisabled} title={importLabel} aria-label={importLabel} onClick={() => { getPresetRepository().offerImport(); getRoutineRepository().offerImport(); getSessionRepository().offerImport() }}><Download /></Button>}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 basis-full sm:w-64 sm:flex-none sm:basis-auto">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
              <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={text.searchPlaceholder} aria-label={text.searchPlaceholder} className="px-9 text-sm" />
              {searchQuery && <Button variant="ghost" size="icon" onClick={() => setSearchQuery('')} aria-label={text.clearSearch} className="absolute top-1/2 right-1 size-8 -translate-y-1/2 active:-translate-y-1/2"><X /></Button>}
            </div>
            <div className="relative">
              <Button variant="outline" aria-label={text.filterGame} aria-haspopup="listbox" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)} className="font-medium text-sm">{selectedFilterLabel}<ChevronRight className={cn('transition-transform', filterOpen && 'rotate-90')} /></Button>
              {filterOpen && <div role="listbox" aria-label={text.filterGame} className="absolute top-[calc(100%+6px)] right-0 z-30 grid min-w-56 rounded-xl border border-solid border-border bg-popover p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,.7)]">
                <button type="button" role="option" aria-selected={gameFilter === 'all'} className={optionCls} onClick={() => { setGameFilter('all'); setFilterOpen(false) }}>{text.allGames}</button>
                {GAME_SENSITIVITY_PROFILES.map((game) => <button type="button" role="option" aria-selected={gameFilter === game.id} key={game.id} className={optionCls} onClick={() => { setGameFilter(game.id); setFilterOpen(false) }}>{game.name}</button>)}
              </div>}
            </div>
            <Button disabled={presetDisabled} onClick={openNewPreset}><Plus /> {text.add}</Button>
          </div>
        </header>
        {sync.status !== 'ready' && <p role="status" className="m-0 mb-4 text-sm text-muted-foreground">{t('presets.loading')}</p>}
        {sync.status !== 'ready' && profile.presets.length === 0 ? null : profile.presets.length === 0 ? <Card className="grid justify-items-start gap-3 p-8 max-[640px]:p-6"><Crosshair size={24} className="text-primary" /><h2 className="m-0 font-heading text-2xl font-semibold leading-[1.15]">{text.emptyTitle}</h2><p className="m-0 text-muted-foreground">{text.emptyText}</p><Button disabled={presetDisabled} onClick={openNewPreset}><Plus /> {text.addSensitivity}</Button></Card>
          : <div className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-5">{filteredPresets.map((preset) => {
            const game = GAME_SENSITIVITY_PROFILE_BY_ID[preset.gameId]
            const cm360 = calculatePresetCm360(preset)
            const canCalibrate = CALIBRATOR_GAMES.has(preset.gameId)
            return <MotionCard layout="position" spotlight accent={preset.isPrimary} key={preset.id} className={cn('profile-preset-card overflow-hidden', preset.isPrimary && 'primary')}>
              <header className="flex items-center gap-3 px-5 pt-5 pb-4">
                <GameBadge gameId={preset.gameId} selected={preset.isPrimary} />
                <div className="min-w-0 flex-1"><strong className="block truncate font-heading text-base font-semibold leading-tight">{game.name}</strong><small className="block truncate text-xs font-medium leading-tight text-subtle">{preset.name || game.shortName}</small></div>
                {preset.isPrimary ? <b className={pill}><Star size={11} /> {text.primary}</b>
                  : <Button variant="link" size="sm" disabled={presetDisabled} onClick={() => setPrimary(preset.id)} className="h-auto flex-none px-0 py-1 text-xs font-medium text-subtle no-underline hover:text-primary hover:no-underline"><Star /> {text.setPrimary}</Button>}
              </header>
              <dl className="m-0 grid grid-cols-3 px-5 pb-5">
                <div className={metric}><dt className={cn(eyebrow, 'truncate')}>{text.sensitivity}</dt><dd className="m-0 whitespace-nowrap font-mono text-xl font-medium leading-[1.1] tabular-nums">{preset.sensitivity}</dd></div>
                <div className={metric}><dt className={cn(eyebrow, 'truncate')}>{text.dpi}</dt><dd className="m-0 whitespace-nowrap font-mono text-xl font-medium leading-[1.1] tabular-nums">{preset.dpi}</dd></div>
                <div className={metric}><dt className={cn(eyebrow, 'truncate')}>cm/360</dt><dd title={cm360 === null ? text.unavailableHint : undefined} className={cn('m-0 font-medium leading-tight', cm360 === null ? 'font-sans text-xs text-muted-foreground' : 'whitespace-nowrap font-mono text-xl tabular-nums')}>{cm360 === null ? text.unavailable : `${cm360.toFixed(2)} cm`}</dd></div>
              </dl>
              <footer className="mt-auto grid grid-cols-[repeat(3,minmax(0,1fr))_40px] gap-2 border-0 border-t border-solid border-border bg-transparent p-3">
                <Button variant="outline" size="sm" className={iconlessSm} disabled={presetDisabled} onClick={() => openPreset(preset)}><Edit3 /> {text.edit}</Button>
                <Button variant="outline" size="sm" className={iconlessSm} onClick={() => onCalibrate(preset)} disabled={!canCalibrate} title={!canCalibrate ? text.calibratorUnavailable : undefined}><Gauge /> {text.calibrate}</Button>
                <Button variant="outline" size="sm" className={iconlessSm} onClick={() => onConvert(preset)}><RefreshCw /> {text.convert}</Button>
                <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-destructive-foreground" disabled={presetDisabled} onClick={() => { setError(''); setPendingRemove(preset) }} aria-label={text.remove}><Trash2 /></Button>
              </footer>
            </MotionCard>
          })}{filteredPresets.length === 0 && <p className="col-span-full m-0 text-sm text-muted-foreground">{text.noResults}</p>}</div>}
      </XensiSection>
    </div>

    <Dialog open={identityOpen} onOpenChange={setIdentityOpen}>
      <DialogContent closeLabel={text.cancel} aria-describedby={undefined} className="max-w-[640px]">
        <DialogHeader><span className={eyebrow}>{text.identity}</span><DialogTitle>{text.editIdentity}</DialogTitle></DialogHeader>
        <Label className="grid content-start items-stretch gap-2">{text.nickname}<Input value={identityDraft.nickname} maxLength={24} onChange={(event) => setIdentityDraft({ ...identityDraft, nickname: event.target.value })} /></Label>
        <AvatarPicker locale={locale} value={identityDraft.avatarId} label={text.avatar} changeLabel={text.changeAvatar} doneLabel={text.doneAvatar} onChange={(avatarId) => setIdentityDraft({ ...identityDraft, avatarId })} />
        <DialogFooter><Button variant="outline" onClick={() => setIdentityOpen(false)}>{text.cancel}</Button><Button onClick={saveIdentity}><Check /> {text.save}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(presetDraft)} onOpenChange={(open) => { if (!open) setPresetDraft(null) }}>
      <DialogContent closeLabel={text.cancel} aria-describedby={undefined} className="max-w-[560px]">{presetDraft && <>
        <DialogHeader><span className={eyebrow}>{text.sensitivities}</span><DialogTitle>{presetDraft.id ? text.editPreset : text.addPreset}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 max-[520px]:grid-cols-1">
          <div className="grid content-start gap-2"><span className="text-[13px] font-medium leading-none text-muted-foreground">{text.game}</span>
            <Button variant="outline" aria-haspopup="listbox" aria-expanded={presetGameOpen} onClick={() => setPresetGameOpen((open) => !open)} className="w-full justify-between px-3 text-[15px] font-medium">{GAME_SENSITIVITY_PROFILE_BY_ID[presetDraft.gameId].name}<ChevronRight className={cn('transition-transform', presetGameOpen && 'rotate-90')} /></Button>
            {presetGameOpen && <div role="listbox" aria-label={text.game} className="grid max-h-56 overflow-y-auto border-0 border-t-[3px] border-solid border-t-primary bg-card p-1">{GAME_SENSITIVITY_PROFILES.map((game) => <button type="button" role="option" aria-selected={presetDraft.gameId === game.id} key={game.id} className={optionCls} onClick={() => { setPresetDraft({ ...presetDraft, gameId: game.id }); setPresetGameOpen(false) }}>{game.name}</button>)}</div>}
          </div>
          <Label className="grid content-start items-stretch gap-2">{text.presetName}<Input value={presetDraft.name} maxLength={32} onChange={(event) => setPresetDraft({ ...presetDraft, name: event.target.value })} /></Label>
          <Label className="grid content-start items-stretch gap-2">{text.sensitivity}<Input inputMode="decimal" className="font-mono tabular-nums" value={presetDraft.sensitivity} onChange={(event) => setPresetDraft({ ...presetDraft, sensitivity: event.target.value })} /></Label>
          <Label className="grid content-start items-stretch gap-2">{text.dpi}<Input inputMode="numeric" className="font-mono tabular-nums" value={presetDraft.dpi} onChange={(event) => setPresetDraft({ ...presetDraft, dpi: event.target.value })} /></Label>
        </div>
        <Label className="cursor-pointer gap-2.5 text-sm text-foreground"><input type="checkbox" className="m-0 size-4 accent-primary" checked={presetDraft.isPrimary} onChange={(event) => setPresetDraft({ ...presetDraft, isPrimary: event.target.checked })} /><Star size={15} className="text-primary" /> {text.setPrimary}</Label>
        {error && <p className="profile-v1-error m-0">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={() => setPresetDraft(null)}>{text.cancel}</Button><Button disabled={presetDisabled} onClick={savePreset}><Check /> {text.save}</Button></DialogFooter>
      </>}</DialogContent>
    </Dialog>

    <Dialog open={Boolean(pendingRemove)} onOpenChange={(open) => { if (!open) setPendingRemove(null) }}>
      <DialogContent role="alertdialog" closeLabel={text.cancel} className="max-w-[460px]">{pendingRemove && <>
        <DialogHeader><span className={eyebrow}>{text.remove}</span><DialogTitle>{text.confirmRemoveTitle}</DialogTitle><DialogDescription>{text.confirmRemoveText}</DialogDescription></DialogHeader>
        {sync.error && <p role="alert" className="profile-v1-error m-0">{t('presets.syncFailure')}</p>}
        <DialogFooter><Button variant="outline" onClick={() => setPendingRemove(null)}>{text.cancel}</Button><Button variant="destructive" disabled={presetDisabled} onClick={() => removePreset(pendingRemove.id)}><Trash2 /> {text.remove}</Button></DialogFooter>
      </>}</DialogContent>
    </Dialog>
  </section>
}
