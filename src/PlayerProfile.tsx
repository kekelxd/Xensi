import { useMemo, useState } from 'react'
import { Check, ChevronRight, Crosshair, Download, Edit3, Gauge, MoreVertical, Plus, RefreshCw, Search, Star, Trash2, X } from 'lucide-react'
import { AvatarArtwork } from './AvatarArtwork'
import { XENSI_AVATARS, type AvatarId } from './avatars'
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
    subtitle: 'Sua identidade e sensibilidades salvas.',
    identity: 'Identidade',
    editProfile: 'Editar perfil',
    nickname: 'Nickname',
    avatar: 'Avatar XENSI',
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
    subtitle: 'Your identity and saved sensitivities.',
    identity: 'Identity',
    editProfile: 'Edit profile',
    nickname: 'Nickname',
    avatar: 'XENSI avatar',
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
    subtitle: 'Tu identidad y sensibilidades guardadas.',
    identity: 'Identidad',
    editProfile: 'Editar perfil',
    nickname: 'Nickname',
    avatar: 'Avatar XENSI',
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
} satisfies Record<Locale, Record<string, string>>

const CALIBRATOR_GAMES = new Set<GameSensitivityProfileId>(['cs2', 'valorant', 'overwatch2', 'warzone'])

export function PlayerProfile({ onConvert, onCalibrate }: PlayerProfileProps) {
  const { locale, t } = useI18n()
  const text = copy[locale]
  const profile = usePlayerProfile()
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

  return <section className="profile-v1-workspace">
    <div className="profile-v1-shell">
      <header className="profile-v1-heading">
        <div>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
        </div>
        {status && <small className="profile-v1-status"><Check size={14} /> {status}</small>}
      </header>

      <div className="profile-v1-hero-grid">
        <article className="profile-v1-identity">
          <span className="profile-v1-label">{text.identity}</span>
          <div className="profile-v1-person">
            <div className="profile-v1-avatar-frame"><AvatarArtwork avatarId={profile.avatarId} size="lg" /></div>
            <div className="profile-v1-identity-copy"><h2>{profile.nickname}</h2><button type="button" onClick={openIdentity}><Edit3 size={15} /> {text.editProfile}</button></div>
          </div>
        </article>

        <article className="profile-v1-active-card">
          <header><span className="profile-v1-label">{text.activeConfig}</span><small><i /> {text.inUseNow}</small></header>
          {activePreset && activeGame ? <>
            <div className="profile-v1-active-game"><GameBadge gameId={activePreset.gameId} selected /><h2>{activeGame.name}</h2><ChevronRight size={19} /></div>
            <dl>
              <div><dt>{text.sensitivity}</dt><dd>{activePreset.sensitivity}</dd></div>
              <div><dt>{text.dpi}</dt><dd>{activePreset.dpi}</dd></div>
              <div><dt>CM / 360</dt><dd>{activeCm360 === null ? text.unavailable : `${activeCm360.toFixed(2)} cm`}</dd></div>
            </dl>
            <footer>
              <button type="button" className="primary-button profile-v1-active-primary" onClick={() => onCalibrate(activePreset)} disabled={!CALIBRATOR_GAMES.has(activePreset.gameId)} title={!CALIBRATOR_GAMES.has(activePreset.gameId) ? text.calibratorUnavailable : undefined}><Gauge size={17} /> {text.calibrate}</button>
              <button type="button" className="secondary-button" onClick={() => onConvert(activePreset)}><RefreshCw size={17} /> {text.convert}</button>
            </footer>
          </> : sync.status !== 'ready' ? <p role="status">{t('presets.loading')}</p> : <div className="profile-v1-active-empty"><Crosshair size={24} /><h2>{text.activeConfig}</h2><p>{text.emptyText}</p><button className="primary-button" type="button" disabled={presetDisabled} onClick={openNewPreset}><Plus size={16} /> {text.add}</button></div>}
        </article>
      </div>

      <section className="profile-v1-presets">
        {sync.status !== 'ready' && <p role="status">{t('presets.loading')}</p>}
        <header>
          <div><span className="profile-v1-label">{text.sensitivities}</span><small>{profile.presets.length}</small>
            {sync.userId && <button className="icon-button" type="button" disabled={presetDisabled} title={t('presets.refresh')} aria-label={t('presets.refresh')} onClick={() => void getPresetRepository().refresh()}><RefreshCw size={16} /></button>}
            {importPending > 0 && <button className="icon-button" type="button" disabled={importDisabled} title={importLabel} aria-label={importLabel} onClick={() => { getPresetRepository().offerImport(); getRoutineRepository().offerImport(); getSessionRepository().offerImport() }}><Download size={16} /></button>}
          </div>
          <div className="profile-v1-tools">
            <label><Search size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={text.searchPlaceholder} aria-label={text.searchPlaceholder} />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label={text.clearSearch}><X size={14} /></button>}</label>
            <div className="profile-v1-filter">
              <button type="button" aria-label={text.filterGame} aria-haspopup="listbox" aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>{selectedFilterLabel}<ChevronRight size={14} /></button>
              {filterOpen && <div role="listbox" aria-label={text.filterGame}>
                <button type="button" role="option" aria-selected={gameFilter === 'all'} onClick={() => { setGameFilter('all'); setFilterOpen(false) }}>{text.allGames}</button>
                {GAME_SENSITIVITY_PROFILES.map((game) => <button type="button" role="option" aria-selected={gameFilter === game.id} key={game.id} onClick={() => { setGameFilter(game.id); setFilterOpen(false) }}>{game.name}</button>)}
              </div>}
            </div>
            <button className="profile-v1-add" type="button" disabled={presetDisabled} onClick={openNewPreset}><Plus size={16} /> {text.add}</button>
          </div>
        </header>
        {sync.status !== 'ready' && profile.presets.length === 0 ? null : profile.presets.length === 0 ? <div className="profile-v1-empty"><Crosshair size={24} /><h2>{text.emptyTitle}</h2><p>{text.emptyText}</p><button className="primary-button" type="button" disabled={presetDisabled} onClick={openNewPreset}><Plus size={16} /> {text.addSensitivity}</button></div>
          : <div className="profile-v1-grid">{filteredPresets.map((preset) => {
            const game = GAME_SENSITIVITY_PROFILE_BY_ID[preset.gameId]
            const cm360 = calculatePresetCm360(preset)
            const canCalibrate = CALIBRATOR_GAMES.has(preset.gameId)
            return <article className={`profile-preset-card${preset.isPrimary ? ' primary' : ''}`} key={preset.id}>
              <header><div className="profile-preset-game"><GameBadge gameId={preset.gameId} selected={preset.isPrimary} /><div><small>{preset.name || game.name}</small><strong>{game.shortName}</strong></div></div>{preset.isPrimary ? <b><Star size={12} /> {text.primary}</b> : <button type="button" disabled={presetDisabled} onClick={() => setPrimary(preset.id)}><Star size={13} /> {text.setPrimary}</button>}<MoreVertical size={17} aria-hidden="true" /></header>
              <dl><div><dt>{text.sensitivity}</dt><dd>{preset.sensitivity}</dd></div><div><dt>{text.dpi}</dt><dd>{preset.dpi}</dd></div><div className="profile-preset-distance"><dt>CM / 360</dt><dd title={cm360 === null ? text.unavailableHint : undefined}>{cm360 === null ? text.unavailable : `${cm360.toFixed(2)} cm/360`}</dd></div></dl>
              <footer><button className="profile-preset-action" type="button" disabled={presetDisabled} onClick={() => openPreset(preset)}><Edit3 size={14} /> {text.edit}</button><button className="profile-preset-action" type="button" onClick={() => onCalibrate(preset)} disabled={!canCalibrate} title={!canCalibrate ? text.calibratorUnavailable : undefined}><Gauge size={14} /> {text.calibrate}</button><button className="profile-preset-action profile-preset-convert" type="button" onClick={() => onConvert(preset)}><RefreshCw size={14} /> {text.convert}</button><button className="profile-preset-action profile-preset-remove" type="button" disabled={presetDisabled} onClick={() => { setError(''); setPendingRemove(preset) }} aria-label={text.remove}><Trash2 size={14} /></button></footer>
            </article>
          })}<button className="profile-v1-add-tile" type="button" disabled={presetDisabled} onClick={openNewPreset}><Plus size={24} /><strong>{text.addTileTitle}</strong><span>{text.addTileText}</span></button>{filteredPresets.length === 0 && <p className="profile-v1-no-results">{text.noResults}</p>}</div>}
      </section>
    </div>

    {identityOpen && <div className="modal-backdrop"><section className="profile-v1-modal" role="dialog" aria-modal="true" aria-labelledby="identity-modal-title"><button className="modal-close" type="button" onClick={() => setIdentityOpen(false)} aria-label={text.cancel}><X size={18} /></button><span className="profile-v1-label">{text.identity}</span><h2 id="identity-modal-title">{text.editIdentity}</h2><label>{text.nickname}<input value={identityDraft.nickname} maxLength={24} onChange={(event) => setIdentityDraft({ ...identityDraft, nickname: event.target.value })} /></label><div className="profile-v1-avatar-field"><span>{text.avatar}</span><div className="profile-avatar-picker">{XENSI_AVATARS.map((avatar) => <button key={avatar.id} type="button" className={identityDraft.avatarId === avatar.id ? 'selected' : ''} onClick={() => setIdentityDraft({ ...identityDraft, avatarId: avatar.id as AvatarId })} aria-label={avatar.label} aria-pressed={identityDraft.avatarId === avatar.id}><AvatarArtwork avatarId={avatar.id} size="picker" selected={identityDraft.avatarId === avatar.id} /></button>)}</div></div><footer><button className="secondary-button" type="button" onClick={() => setIdentityOpen(false)}>{text.cancel}</button><button className="primary-button" type="button" onClick={saveIdentity}><Check size={15} /> {text.save}</button></footer></section></div>}

    {presetDraft && <div className="modal-backdrop"><section className="profile-v1-modal profile-v1-preset-modal" role="dialog" aria-modal="true" aria-labelledby="preset-modal-title"><button className="modal-close" type="button" onClick={() => setPresetDraft(null)} aria-label={text.cancel}><X size={18} /></button><span className="profile-v1-label">{text.sensitivities}</span><h2 id="preset-modal-title">{presetDraft.id ? text.editPreset : text.addPreset}</h2><div className="profile-v1-form-grid"><div className="profile-v1-modal-game"><span>{text.game}</span><button type="button" aria-haspopup="listbox" aria-expanded={presetGameOpen} onClick={() => setPresetGameOpen((open) => !open)}>{GAME_SENSITIVITY_PROFILE_BY_ID[presetDraft.gameId].name}<ChevronRight size={14} /></button>{presetGameOpen && <div role="listbox" aria-label={text.game}>{GAME_SENSITIVITY_PROFILES.map((game) => <button type="button" role="option" aria-selected={presetDraft.gameId === game.id} key={game.id} onClick={() => { setPresetDraft({ ...presetDraft, gameId: game.id }); setPresetGameOpen(false) }}>{game.name}</button>)}</div>}</div><label>{text.presetName}<input value={presetDraft.name} maxLength={32} onChange={(event) => setPresetDraft({ ...presetDraft, name: event.target.value })} /></label><label>{text.sensitivity}<input inputMode="decimal" value={presetDraft.sensitivity} onChange={(event) => setPresetDraft({ ...presetDraft, sensitivity: event.target.value })} /></label><label>{text.dpi}<input inputMode="numeric" value={presetDraft.dpi} onChange={(event) => setPresetDraft({ ...presetDraft, dpi: event.target.value })} /></label></div><label className="profile-v1-primary-toggle"><input type="checkbox" checked={presetDraft.isPrimary} onChange={(event) => setPresetDraft({ ...presetDraft, isPrimary: event.target.checked })} /><Star size={15} /> {text.setPrimary}</label>{error && <p className="profile-v1-error">{error}</p>}<footer><button className="secondary-button" type="button" onClick={() => setPresetDraft(null)}>{text.cancel}</button><button className="primary-button" type="button" disabled={presetDisabled} onClick={savePreset}><Check size={15} /> {text.save}</button></footer></section></div>}

    {pendingRemove && <div className="modal-backdrop"><section className="profile-v1-modal profile-v1-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="remove-preset-title" aria-describedby="remove-preset-description"><button className="modal-close" type="button" onClick={() => setPendingRemove(null)} aria-label={text.cancel}><X size={18} /></button><span className="profile-v1-label">{text.remove}</span><h2 id="remove-preset-title">{text.confirmRemoveTitle}</h2><p id="remove-preset-description">{text.confirmRemoveText}</p>{sync.error && <p role="alert" className="profile-v1-error">{t('presets.syncFailure')}</p>}<footer><button className="secondary-button" type="button" onClick={() => setPendingRemove(null)}>{text.cancel}</button><button className="primary-button" type="button" disabled={presetDisabled} onClick={() => removePreset(pendingRemove.id)}><Trash2 size={15} /> {text.remove}</button></footer></section></div>}
  </section>
}
