import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Circle, Copy, Crosshair, Dot, GripVertical, Layers3, LogOut, MoreHorizontal, Pencil, Play, Plus, RotateCcw, Save, Sparkles, Trash2, X, type LucideIcon } from 'lucide-react'
import { GAME_BY_ID, GAMES, type GameId } from './games'
import { GamePicker } from './GamePicker'
import { SensitivityConfigFields } from './SensitivityConfigFields'
import { WizardStepPanel, WizardStepper } from './SetupWizard'
import { usePresetState, useSensitivityPreset } from './useSensitivityPreset'
import { createSessionContext, selectGamePreset, type SessionContext } from './playerProfileStore'
import { useDialogFocus } from './useDialogFocus'
import { normalizeSensitivity, parsePositiveNumberInput } from './sensitivity'
import type { CrosshairStyle } from './TrackingArena'
import { WarmupArena, type ArenaHandle, type WarmupMetrics, type WarmupPhase } from './Warmup'
import { getWarmupPointerGain, type FixedWarmupDifficulty, type WarmupDifficulty, type WarmupExercise } from './warmupConfig'
import { EXERCISES } from './warmupExercises'
import { createEmptyWarmupMetrics } from './warmupTelemetry'
import { sessionSummary } from './trainingSession'
import { getSessionRepository } from './sessionRepository'
import { useSessionRecorder } from './useSessionRecorder'
import { formatPersonalBestValue, type PersonalBestResult } from './personalBests'
import { getPersonalBestService } from './personalBestService'
import { PERSONAL_BEST_COPY } from './personalBestCopy'
import { createDefaultRoutine, createRoutineItem, formatRoutineDuration, getRoutineTotalSeconds, isRoutineModeAvailable, ROUTINE_ITEM_DURATIONS, supportsRoutineDifficulty, validateRoutine, type CustomRoutine, type CustomRoutineItem, type RoutineItemDuration } from './routineConfig'
import { getRoutineRepository } from './routineRepository'
import { useRoutineState } from './useRoutineState'
import { useI18n, type TranslationKey } from './i18n'

type SetupStep = 1 | 2 | 3
type RoutinePhase = 'builder' | 'countdown' | 'playing' | 'transition' | 'result'
type RoutineScreen = 'library' | 'builder'
type RoutineLaunchContext = { gameId: GameId; sensitivity: number; dpi: number; presetId?: string }

const CROSSHAIRS: Array<{ id: CrosshairStyle, label: TranslationKey, icon: LucideIcon }> = [
  { id: 'classic', label: 'crosshair.classic', icon: Crosshair },
  { id: 'dot', label: 'crosshair.dot', icon: Dot },
  { id: 'circle', label: 'crosshair.circle', icon: Circle },
  { id: 'plus', label: 'crosshair.plus', icon: Plus },
]

const format = (value: number, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '0'
const difficultyKeys: WarmupDifficulty[] = ['easy', 'medium', 'hard', 'adaptive']
const exerciseById = (id: WarmupExercise) => EXERCISES.find((item) => item.id === id) ?? EXERCISES[0]

type StageResult = {
  item: CustomRoutineItem
  metrics: WarmupMetrics
  personalBest: PersonalBestResult | null
  sessionId: string | null
  pbUnavailable: boolean
}

function ExerciseMicroPreview({ modeId }: { modeId: WarmupExercise }) {
  return <div className={`routine-builder-preview preview-${modeId}`} aria-hidden="true">
    <span /><span /><span /><i />
  </div>
}

function RoutineItemCard({
  item,
  index,
  total,
  expanded,
  difficultyLabel,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  children,
}: {
  item: CustomRoutineItem
  index: number
  total: number
  expanded: boolean
  difficultyLabel: (difficulty: WarmupDifficulty) => string
  onToggle: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onRemove: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const exercise = exerciseById(item.modeId)
  const Icon = exercise.icon
  return <article className={`routine-builder-item${expanded ? ' expanded' : ''}`}>
    <div className="routine-item-compact">
      <div className="routine-builder-order" aria-label={t('routines.itemOrder', { current: index + 1, total })}>
        <GripVertical size={15} />
        <span>{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="routine-builder-title">
        <Icon size={18} />
        <span>
          <strong>{isRoutineModeAvailable(item.modeId) ? exercise.name : t('routines.unavailable')}</strong>
          <small>{formatRoutineDuration(item.durationSeconds)} · {difficultyLabel(item.difficulty)}</small>
        </span>
      </div>
      <div className="routine-row-actions">
        <button type="button" onClick={onMoveUp} disabled={index === 0} aria-label={t('routine.moveUp')}><ArrowUp size={14} /></button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1} aria-label={t('routine.moveDown')}><ArrowDown size={14} /></button>
        <button type="button" onClick={onDuplicate} aria-label={t('routine.duplicate')}><Copy size={14} /></button>
        <button className="routine-edit-action" type="button" onClick={onToggle} aria-expanded={expanded}><Pencil size={13} /> {t('routines.edit')}</button>
        <button type="button" onClick={onRemove} aria-label={t('routine.remove')}><X size={15} /></button>
      </div>
    </div>
    {expanded && <div className="routine-item-expanded">{children}</div>}
  </article>
}

function RoutineSummaryMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function RoutineLibraryCard({
  routine,
  presetLabel,
  sequence,
  actionOpen,
  disabled,
  onStart,
  onEdit,
  onDuplicate,
  onRename,
  onDelete,
  onToggleActions,
}: {
  routine: CustomRoutine
  presetLabel: string
  sequence: string
  actionOpen: boolean
  disabled: boolean
  onStart: () => void
  onEdit: () => void
  onDuplicate: () => void
  onRename: () => void
  onDelete: () => void
  onToggleActions: () => void
}) {
  const { t } = useI18n()
  const total = getRoutineTotalSeconds(routine.items)
  return <article className="routine-library-card">
    <header>
      <div>
        <span>{t('routines.savedPlaylist')}</span>
        <h2>{routine.name}</h2>
      </div>
      <div className="routine-card-actions">
        <button type="button" className="routine-menu-trigger" aria-label={t('routines.actions', { name: routine.name })} aria-expanded={actionOpen} onClick={onToggleActions}><MoreHorizontal size={18} /></button>
        {actionOpen && <div className="routine-card-menu" role="menu">
          <button type="button" role="menuitem" onClick={onEdit}><Pencil size={14} /> {t('routines.edit')}</button>
          <button type="button" role="menuitem" onClick={onDuplicate}><Copy size={14} /> {t('routines.duplicate')}</button>
          <button type="button" role="menuitem" onClick={onRename}><Pencil size={14} /> {t('routines.rename')}</button>
          <button type="button" role="menuitem" onClick={onDelete}><Trash2 size={14} /> {t('routines.delete')}</button>
        </div>}
      </div>
    </header>
    <p className="routine-card-context">{presetLabel}</p>
    <div className="routine-card-meta">
      <span>{formatRoutineDuration(total)}</span>
      <span>{routine.items.length} {t('routine.exercises')}</span>
    </div>
    <p className="routine-card-sequence">{sequence}</p>
    <footer>
      <button type="button" className="primary-button routine-start-button" disabled={disabled || validateRoutine(routine).length > 0 || !GAME_BY_ID[routine.gameId as GameId]} onClick={onStart}><Play size={14} /> {t('routines.start')}</button>
    </footer>
  </article>
}

export function Routine() {
  const { t, locale } = useI18n()
  const arenaRef = useRef<ArenaHandle>(null)
  const recorder = useSessionRecorder()
  const sessions = getSessionRepository()
  const setupRef = useRef<HTMLElement>(null)
  const [phase, setPhase] = useState<RoutinePhase>('builder')
  const [screen, setScreen] = useState<RoutineScreen>('library')
  useDialogFocus(setupRef, phase === 'builder' && screen === 'builder')
  const [setupStep, setSetupStep] = useState<SetupStep>(1)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1)
  const config = useSensitivityPreset('cs2', null, true)
  const presetState = usePresetState()
  const selectedGame = config.draft.gameId as GameId
  const { sensitivity, dpi } = config.draft
  const { setSensitivity, setDpi } = config
  const sync = useRoutineState()
  const repository = getRoutineRepository()
  const library = sync.items
  const [routine, setRoutine] = useState<CustomRoutine>(() => createDefaultRoutine(selectedGame))
  const [launchContext, setLaunchContext] = useState<RoutineLaunchContext | null>(null)
  const [crosshair, setCrosshair] = useState<CrosshairStyle>('dot')
  const [addOpen, setAddOpen] = useState(false)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<CustomRoutine | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CustomRoutine | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [selectedAddMode, setSelectedAddMode] = useState<WarmupExercise>('flick')
  const [selectedAddDuration, setSelectedAddDuration] = useState<RoutineItemDuration>(60)
  const [selectedAddDifficulty, setSelectedAddDifficulty] = useState<WarmupDifficulty>('medium')
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const [stageIndex, setStageIndex] = useState(0)
  const [stageResults, setStageResults] = useState<StageResult[]>([])
  const [inputReady, setInputReady] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const [transitionCountdown, setTransitionCountdown] = useState(3)
  const [sessionId, setSessionId] = useState(0)
  const [metrics, setMetrics] = useState<WarmupMetrics>(() => createEmptyWarmupMetrics(60))
  const sessionContext = useRef<SessionContext | undefined>(undefined)

  const builderGame = GAME_BY_ID[selectedGame]
  const game = launchContext ? GAME_BY_ID[launchContext.gameId] : builderGame
  const parsedSensitivity = parsePositiveNumberInput(sensitivity)
  const parsedDpi = parsePositiveNumberInput(dpi)
  const validSetup = parsedSensitivity !== null && parsedDpi !== null
  const normalizedSensitivity = parsedSensitivity === null ? null : normalizeSensitivity(parsedSensitivity, builderGame)
  const runtimeSensitivity = launchContext?.sensitivity ?? normalizedSensitivity
  const pointerGain = getWarmupPointerGain(game, runtimeSensitivity ?? game.sensitivityMin)
  const orderedItems = useMemo(() => routine.items.slice().sort((left, right) => left.order - right.order), [routine.items])
  const activeItem = orderedItems[stageIndex] ?? orderedItems[0]
  const exercise = activeItem ? exerciseById(activeItem.modeId) : EXERCISES[0]
  const nextItem = orderedItems[stageIndex + 1]
  const totalSeconds = getRoutineTotalSeconds(orderedItems)
  const issues = validateRoutine({ ...routine, items: orderedItems })
  const canStart = sync.status === 'ready' && presetState.status === 'ready' && validSetup && normalizedSensitivity !== null && parsedDpi !== null && issues.length === 0
  const effectiveDifficulty: FixedWarmupDifficulty = activeItem?.difficulty === 'adaptive' ? 'medium' : (activeItem?.difficulty ?? 'medium') as FixedWarmupDifficulty
  const difficultyLabel = (difficulty: WarmupDifficulty) => difficulty === 'adaptive'
    ? t('difficulty.adaptive')
    : t(`difficulty.${difficulty}` as TranslationKey)

  const getRoutineContext = useCallback((targetRoutine: CustomRoutine): RoutineLaunchContext | null => {
    const preset = selectGamePreset(config.presets, targetRoutine.gameId, targetRoutine.presetId)
    const fallbackSensitivity = targetRoutine.gameId === selectedGame ? normalizedSensitivity : 1
    const fallbackDpi = targetRoutine.gameId === selectedGame ? parsedDpi : 800
    const contextSensitivity = preset?.sensitivity ?? fallbackSensitivity
    const contextDpi = preset?.dpi ?? fallbackDpi
    if (contextSensitivity === null || contextDpi === null) return null
    const contextGame = GAME_BY_ID[targetRoutine.gameId as GameId]
    if (!contextGame) return null
    return {
      gameId: targetRoutine.gameId as GameId,
      sensitivity: normalizeSensitivity(contextSensitivity, contextGame),
      dpi: Math.round(contextDpi),
      ...(preset?.id ? { presetId: preset.id } : {}),
    }
  }, [config.presets, normalizedSensitivity, parsedDpi, selectedGame])

  const startStage = useCallback((index: number, targetRoutine = routine, context = launchContext) => {
    const targetItems = targetRoutine.items.slice().sort((left, right) => left.order - right.order)
    const item = targetItems[index]
    if (!item || !context) return
    if (index === 0 && sessions.getSnapshot().status !== 'auth-loading') recorder.beginRun(sessions.getSnapshot().userId, targetRoutine.id, targetRoutine.name)
    sessionContext.current = createSessionContext(context.gameId, context.sensitivity, context.dpi, context.presetId, {
      difficulty: item.difficulty,
      durationSeconds: item.durationSeconds,
    })
    setInputReady(document.pointerLockElement?.classList.contains('warmup-arena') ?? false)
    setMetrics(createEmptyWarmupMetrics(item.durationSeconds))
    flushSync(() => {
      setRoutine(targetRoutine)
      setLaunchContext(context)
      setStageIndex(index)
      setSessionId((value) => value + 1)
      setPhase('countdown')
    })
    arenaRef.current?.requestPointerLock()
  }, [launchContext, routine, recorder, sessions])

  useEffect(() => {
    setRoutine((current) => current.gameId === selectedGame && current.presetId === config.draft.presetId ? current : { ...current, gameId: selectedGame, ...(config.draft.presetId ? { presetId: config.draft.presetId } : { presetId: undefined }) })
  }, [selectedGame, config.draft.presetId])

  useEffect(() => {
    if (phase !== 'countdown' || !inputReady) return
    setCountdown(3)
    const started = performance.now()
    const timer = window.setInterval(() => {
      const next = Math.max(0, 3 - Math.floor((performance.now() - started) / 1000))
      setCountdown(next)
      if (performance.now() - started >= 3000) {
        window.clearInterval(timer)
        setPhase('playing')
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [phase, sessionId, inputReady])

  useEffect(() => {
    if (phase !== 'transition') return
    setTransitionCountdown(3)
    const started = performance.now()
    const timer = window.setInterval(() => {
      const next = Math.max(0, 3 - Math.floor((performance.now() - started) / 1000))
      setTransitionCountdown(next)
      if (performance.now() - started >= 3000) {
        window.clearInterval(timer)
        startStage(stageIndex + 1)
      }
    }, 80)
    return () => window.clearInterval(timer)
  }, [phase, stageIndex, startStage])

  const updateItems = (items: CustomRoutineItem[]) => {
    setSaveState('idle')
    setRoutine((current) => ({ ...current, items: items.map((item, index) => ({ ...item, order: index })) }))
  }

  const updateItem = (id: string, patch: Partial<CustomRoutineItem>) => {
    updateItems(orderedItems.map((item) => {
      if (item.id !== id) return item
      const next = { ...item, ...patch }
      if (!supportsRoutineDifficulty(next.modeId, next.difficulty)) next.difficulty = 'medium'
      return next
    }))
  }

  const addItem = () => {
    if (!supportsRoutineDifficulty(selectedAddMode, selectedAddDifficulty)) return
    const next = { ...createRoutineItem(selectedAddMode, orderedItems.length), durationSeconds: selectedAddDuration, difficulty: selectedAddDifficulty }
    updateItems([...orderedItems, next])
    setExpandedItemId(next.id)
    setAddOpen(false)
  }

  const removeItem = (id: string) => {
    updateItems(orderedItems.filter((item) => item.id !== id))
    setExpandedItemId((current) => current === id ? null : current)
  }
  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= orderedItems.length) return
    const next = [...orderedItems]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    updateItems(next)
    setExpandedItemId(item.id)
  }

  const duplicateItem = (item: CustomRoutineItem) => {
    const next = { ...item, id: crypto.randomUUID(), order: orderedItems.length }
    updateItems([...orderedItems, next])
    setExpandedItemId(next.id)
  }

  const refreshLibrary = () => { void repository.refresh() }

  const openBuilder = (targetRoutine: CustomRoutine) => {
    const context = getRoutineContext(targetRoutine)
    setActionMenuId(null)
    setLaunchContext(null)
    setRoutine(targetRoutine)
    setExpandedItemId(null)
    setSaveState('idle')
    setScreen('builder')
    config.replace(context?.gameId ?? 'cs2', String(context?.sensitivity ?? 1), String(context?.dpi ?? 800), targetRoutine.presetId)
  }

  const createNewRoutine = () => {
    const preset = selectGamePreset(config.presets, selectedGame)
    openBuilder({
      ...createDefaultRoutine(selectedGame, preset?.id),
      name: t('routines.newName'),
    })
  }

  const duplicateRoutine = async (targetRoutine: CustomRoutine) => {
    await repository.duplicate(targetRoutine.id, t('routines.duplicateSuffix'))
    setActionMenuId(null)
  }

  const requestRenameRoutine = (targetRoutine: CustomRoutine) => {
    setActionMenuId(null)
    setRenameTarget(targetRoutine)
    setRenameValue(targetRoutine.name)
  }

  const confirmRenameRoutine = async () => {
    if (!renameTarget || !renameValue.trim()) return
    if (await repository.rename(renameTarget.id, renameValue.trim().slice(0, 48))) {
      if (routine.id === renameTarget.id) setRoutine(repository.getById(renameTarget.id)!)
      setRenameTarget(null)
    }
  }

  const confirmDeleteRoutine = async () => {
    if (!deleteTarget) return
    if (await repository.remove(deleteTarget.id)) {
      if (routine.id === deleteTarget.id) setRoutine(createDefaultRoutine(selectedGame))
      setActionMenuId(null)
      setDeleteTarget(null)
    }
  }

  const saveRoutine = async () => {
    setSaveState('idle')
    const definition = { ...routine, items: orderedItems }
    const ok = await (repository.getById(routine.id) ? repository.update(definition) : repository.create(definition))
    if (ok) {
      setRoutine(repository.getById(routine.id)!)
      setSaveState('saved')
      window.setTimeout(() => setSaveState('idle'), 1400)
    }
  }

  const startRoutine = (targetRoutine = routine) => {
    if (sync.status !== 'ready' || presetState.status !== 'ready') return
    const context = getRoutineContext(targetRoutine)
    const targetIssues = validateRoutine(targetRoutine)
    if (!context || targetIssues.length > 0) return
    if (targetRoutine.id === routine.id && screen === 'builder') void saveRoutine()
    setStageResults([])
    setSensitivity(String(context.sensitivity))
    setDpi(String(context.dpi))
    setScreen('builder')
    startStage(0, targetRoutine, context)
  }

  const completeStage = (result: WarmupMetrics) => {
    const saved = recorder.complete(result)
    const withContext = { ...result, sessionContext: sessionContext.current, ...(saved ? sessionSummary(saved) : { sessionStatus: 'invalid' as const }) }
    if (stageIndex >= orderedItems.length - 1) recorder.finishRun()
    setMetrics(withContext)
    setStageResults((current) => [...current.filter((item) => item.item.id !== activeItem.id), { item: activeItem, metrics: withContext, personalBest: null, sessionId: saved?.id ?? null, pbUnavailable: false }].sort((left, right) => left.item.order - right.item.order))
    if (saved) void getPersonalBestService().compareSessionToPB(saved).then(personalBest => {
      setStageResults(current => current.map(item => item.sessionId === saved.id ? { ...item, personalBest } : item))
    }).catch(() => { setStageResults(current => current.map(item => item.sessionId === saved.id ? { ...item, pbUnavailable: true } : item)) })
    setInputReady(false)
    setPhase(stageIndex >= orderedItems.length - 1 ? 'result' : 'transition')
  }

  const exitToBuilder = () => {
    recorder.abort('manual_abort'); recorder.finishRun('interrupted', 'manual_abort')
    document.exitPointerLock?.()
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    setInputReady(false)
    setCountdown(3)
    setTransitionCountdown(3)
    setStageIndex(0)
    setPhase('builder')
  }

  const copyRoutineCard = async () => {
    const content = [
      routine.name,
      `${GAME_BY_ID[selectedGame].label} · ${formatRoutineDuration(totalSeconds)}`,
      ...orderedItems.map((item, index) => `${index + 1}. ${exerciseById(item.modeId).name} · ${formatRoutineDuration(item.durationSeconds)} · ${difficultyLabel(item.difficulty)}`),
    ].join('\n')
    try { await navigator.clipboard?.writeText(content) } catch { /* sharing remains optional */ }
  }

  const getRoutinePresetLabel = (targetRoutine: CustomRoutine) => {
    const targetGame = GAME_BY_ID[targetRoutine.gameId as GameId]
    const preset = selectGamePreset(config.presets, targetRoutine.gameId, targetRoutine.presetId)
    return preset
      ? `${targetGame?.shortLabel ?? targetRoutine.gameId} · ${preset.sensitivity} · ${preset.dpi} DPI`
      : `${targetGame?.shortLabel ?? targetRoutine.gameId} · ${t('routines.noPreset')}`
  }

  const getRoutineSequence = (targetRoutine: CustomRoutine) => targetRoutine.items
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((item) => isRoutineModeAvailable(item.modeId) ? exerciseById(item.modeId).name : t('routines.unavailable'))
    .join(' · ')

  if (phase === 'builder' && screen === 'library') {
    return <section className="warmup-workspace routine-workspace routine-library-workspace">
      <div className="routine-library-hero">
        <div>
          <div className="panel-label"><Layers3 size={15} /> {t('routines.library')}</div>
          <h1>{t('routines.library')}</h1>
          <p>{t('routines.subtitle')}</p>
        </div>
        <button type="button" className="primary-button routine-create-button" disabled={sync.status !== 'ready' || sync.busy} onClick={createNewRoutine}><Plus size={15} /> {t('routines.createNew')}</button>
      </div>

      <div className="routine-library-heading"><button type="button" className="icon-button" title={t('presets.retry')} aria-label={t('presets.retry')} disabled={sync.busy} onClick={refreshLibrary}><RotateCcw size={16} /></button>{sync.userId && sync.pendingImport > 0 && <button type="button" className="icon-button" title={t('routines.import')} aria-label={t('routines.import')} onClick={() => repository.offerImport()}><Save size={16} /></button>}</div>
      {sync.error && <p role="alert" className="profile-v1-error">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</p>}
      <section className="routine-library-panel" aria-label={t('routines.mine')}>
        <div className="routine-library-heading">
          <h2>{t('routines.mine')}</h2>
          <span>{t('routines.savedCount', { count: library.length })}</span>
        </div>
        {sync.status !== 'ready' ? <p role="status">{t('routines.loading')}</p> : library.length === 0 ? <div className="routine-library-empty">
          <Sparkles size={24} />
          <strong>{t('routines.emptyTitle')}</strong>
          <p>{t('routines.emptyText')}</p>
          <button type="button" className="primary-button" onClick={createNewRoutine}><Plus size={14} /> {t('routines.create')}</button>
        </div> : <div className="routine-library-grid">
          {library.map((savedRoutine) => (
            <RoutineLibraryCard
              key={savedRoutine.id}
              routine={savedRoutine}
              presetLabel={getRoutinePresetLabel(savedRoutine)}
              sequence={getRoutineSequence(savedRoutine)}
              actionOpen={actionMenuId === savedRoutine.id}
              disabled={sync.busy || presetState.status !== 'ready'}
              onToggleActions={() => setActionMenuId((current) => current === savedRoutine.id ? null : savedRoutine.id)}
              onStart={() => startRoutine(savedRoutine)}
              onEdit={() => openBuilder(savedRoutine)}
              onDuplicate={() => duplicateRoutine(savedRoutine)}
              onRename={() => requestRenameRoutine(savedRoutine)}
              onDelete={() => { setActionMenuId(null); setDeleteTarget(savedRoutine) }}
            />
          ))}
        </div>}
      </section>

      {renameTarget && <div className="modal-backdrop">
        <section className="modal routine-action-modal" role="dialog" aria-modal="true" aria-label={t('routines.renameTitle')}>
          <button className="modal-close" onClick={() => setRenameTarget(null)} aria-label={t('common.close')}><X size={18} /></button>
          <Pencil size={20} className="modal-icon" />
          <h2>{t('routines.renameTitle')}</h2>
          <p>{t('routines.renameText')}</p>
          <label>{t('routine.name')}<input value={renameValue} maxLength={48} autoFocus onChange={(event) => setRenameValue(event.target.value)} /></label>
          {sync.error && <p role="alert" className="profile-v1-error">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</p>}
          <div className="warmup-result-actions">
            <button className="secondary-button" type="button" onClick={() => setRenameTarget(null)}>{t('routines.cancel')}</button>
            <button className="primary-button" type="button" disabled={sync.busy || !renameValue.trim()} onClick={confirmRenameRoutine}><Save size={14} /> {t('routines.saveName')}</button>
          </div>
        </section>
      </div>}

      {deleteTarget && <div className="modal-backdrop">
        <section className="modal routine-action-modal" role="dialog" aria-modal="true" aria-label={t('routines.deleteTitle')}>
          <button className="modal-close" onClick={() => setDeleteTarget(null)} aria-label={t('common.close')}><X size={18} /></button>
          <Trash2 size={20} className="modal-icon" />
          <h2>{t('routines.deleteQuestion')}</h2>{sync.error && <p role="alert" className="profile-v1-error">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</p>}
          <p>{t('routines.deleteText', { name: deleteTarget.name })}</p>
          <div className="warmup-result-actions">
            <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)}>{t('routines.cancel')}</button>
            <button className="primary-button danger-button" type="button" disabled={sync.busy} onClick={confirmDeleteRoutine}><Trash2 size={14} /> {t('routines.delete')}</button>
          </div>
        </section>
      </div>}
    </section>
  }

  if (phase === 'builder') {
    return <section className="warmup-workspace routine-workspace routine-builder-workspace" ref={setupRef}>
      <div className="routine-builder-hero">
        <div>
          <div className="panel-label"><Layers3 size={15} /> {t('routine.kicker')}</div>
          <h1>{t('routine.title')}</h1>
          <p>{t('routine.subtitle')}</p>
        </div>
        <button type="button" className="secondary-button routine-back-library" onClick={() => { refreshLibrary(); setScreen('library') }}><ArrowLeft size={14} /> {t('routines.back')}</button>
      </div>

      <div className="routine-builder-layout">
        <section className="routine-builder-context">
          <WizardStepper current={setupStep} steps={[t('warmup.stepGame'), t('warmup.stepSettings'), t('warmup.stepCrosshair')]} />
          <div className="routine-context-panel">
            <WizardStepPanel key={setupStep} step={setupStep} direction={stepDirection}>
              {setupStep === 1 && <>
                <h2>{t('routine.contextTitle')}</h2>
                <GamePicker gameIds={GAMES.map(item => item.id)} value={selectedGame} onChange={config.selectGame} presets={config.presets} />
              </>}
              {setupStep === 2 && <SensitivityConfigFields draft={config.draft} presets={config.presets} onSelectPreset={config.selectPreset} onSensitivityChange={setSensitivity} onDpiChange={setDpi} sensitivityInvalid={parsedSensitivity === null} dpiInvalid={parsedDpi === null} />}
              {setupStep === 3 && <>
                <h2>{t('warmup.crosshairTitle')}</h2>
                <div className="warmup-crosshairs" role="radiogroup" aria-label={t('calibration.crosshairType')}>
                  {CROSSHAIRS.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={crosshair === item.id ? 'selected' : ''} aria-pressed={crosshair === item.id} onClick={() => setCrosshair(item.id)}><Icon size={16} /><span>{t(item.label)}</span></button> })}
                </div>
              </>}
            </WizardStepPanel>
          </div>
          <div className="warmup-wizard-actions routine-context-actions">
            {setupStep > 1 && <button className="secondary-button" type="button" onClick={() => { setStepDirection(-1); setSetupStep((setupStep - 1) as SetupStep) }}><ArrowLeft size={15} /> {t('warmup.back')}</button>}
            {setupStep < 3 && <button className="primary-button" type="button" onClick={() => { setStepDirection(1); setSetupStep((setupStep + 1) as SetupStep) }} disabled={setupStep === 2 && !validSetup}>{t('warmup.next')} <ArrowRight size={15} /></button>}
          </div>
        </section>

        <section className="routine-playlist-panel" aria-label={t('routine.playlist')}>
          <div className="routine-playlist-head">
            <label>{t('routine.name')}<input value={routine.name} maxLength={48} onChange={(event) => { setSaveState('idle'); setRoutine(current => ({ ...current, name: event.target.value })) }} /></label>
            <div className="routine-builder-summary" aria-label={t('routine.summary')}>
              <RoutineSummaryMetric label={t('routine.totalDuration')} value={formatRoutineDuration(totalSeconds)} />
              <RoutineSummaryMetric label={t('routine.exerciseCount')} value={String(orderedItems.length)} />
              <RoutineSummaryMetric label={t('common.gameReference')} value={game.shortLabel} />
            </div>
            {sync.error && <p role="alert" className="profile-v1-error">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</p>}
            <div className="routine-playlist-actions">
              <button className="secondary-button" type="button" disabled={sync.busy || sync.status !== 'ready'} onClick={saveRoutine}><Save size={14} /> {saveState === 'saved' ? t('routine.saved') : t('routine.save')}</button>
              <button className="primary-button" type="button" disabled={!canStart} onClick={() => startRoutine()}><Play size={14} /> {t('routine.start')}</button>
            </div>
          </div>

          {orderedItems.length === 0 ? <div className="routine-empty-state">
            <Sparkles size={22} />
            <strong>{t('routine.emptyTitle')}</strong>
            <p>{t('routine.emptyDescription')}</p>
            <button className="primary-button" type="button" onClick={() => setAddOpen(true)}><Plus size={14} /> {t('routine.addExercise')}</button>
          </div> : <div className="routine-builder-list">
            <div className="routine-playlist-label">
              <h2>{t('routine.playlist')}</h2>
              <span>{orderedItems.length} {t('routine.exercises')}</span>
            </div>
            {orderedItems.map((item, index) => (
              <RoutineItemCard
                key={item.id}
                item={item}
                index={index}
                total={orderedItems.length}
                expanded={expandedItemId === item.id}
                difficultyLabel={difficultyLabel}
                onToggle={() => setExpandedItemId((current) => current === item.id ? null : item.id)}
                onMoveUp={() => moveItem(index, -1)}
                onMoveDown={() => moveItem(index, 1)}
                onDuplicate={() => duplicateItem(item)}
                onRemove={() => removeItem(item.id)}
              >
                <div className="routine-item-controls">
                  <label>
                    <span>{t('routine.duration')}</span>
                    <div className="routine-chip-row" aria-label={t('routine.duration')}>
                      {ROUTINE_ITEM_DURATIONS.map((duration) => <button key={duration} type="button" className={item.durationSeconds === duration ? 'selected' : ''} onClick={() => updateItem(item.id, { durationSeconds: duration })}>{duration / 60}m</button>)}
                    </div>
                  </label>
                  <label>
                    <span>{t('warmup.difficulty')}</span>
                    <div className="routine-chip-row" aria-label={t('warmup.difficulty')}>
                      {difficultyKeys.filter((difficulty) => supportsRoutineDifficulty(item.modeId, difficulty)).map((difficulty) => <button key={difficulty} type="button" className={item.difficulty === difficulty ? 'selected' : ''} onClick={() => updateItem(item.id, { difficulty })}>{difficultyLabel(difficulty)}</button>)}
                    </div>
                  </label>
                  <label>
                    <span>{t('routine.exercise')}</span>
                    <select value={item.modeId} onChange={(event) => updateItem(item.id, { modeId: event.target.value as WarmupExercise })} aria-label={t('routine.exercise')}>
                      {!isRoutineModeAvailable(item.modeId) && <option value={item.modeId}>{t('routines.unavailable')}</option>}
                      {EXERCISES.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
                    </select>
                  </label>
                  <div className="routine-expanded-preview">
                    <ExerciseMicroPreview modeId={item.modeId} />
                  </div>
                </div>
              </RoutineItemCard>
            ))}
          </div>}

          <div className="routine-builder-footer">
            <button className="secondary-button" type="button" onClick={() => setAddOpen(true)}><Plus size={14} /> {t('routine.addExercise')}</button>
            <button className="secondary-button" type="button" onClick={copyRoutineCard}><Copy size={14} /> {t('routine.copyCard')}</button>
            {issues.includes('mode') && <span role="alert">{t('routines.unavailable')}</span>}
            {issues.includes('empty') && <span>{t('routine.emptyGuard')}</span>}
          </div>
        </section>
      </div>

      {addOpen && <div className="modal-backdrop">
        <section className="modal routine-add-modal" role="dialog" aria-modal="true" aria-label={t('routine.addExercise')}>
          <button className="modal-close" onClick={() => setAddOpen(false)} aria-label={t('common.close')}><X size={18} /></button>
          <Plus size={20} className="modal-icon" />
          <h2>{t('routine.addExercise')}</h2>
          <p>{t('routine.addDescription')}</p>
          <div className="routine-add-grid">
            {EXERCISES.map((exercise) => {
              const Icon = exercise.icon
              return <button key={exercise.id} type="button" className={selectedAddMode === exercise.id ? 'selected' : ''} onClick={() => { setSelectedAddMode(exercise.id); if (!supportsRoutineDifficulty(exercise.id, selectedAddDifficulty)) setSelectedAddDifficulty('medium') }}>
                <Icon size={19} /><strong>{exercise.name}</strong><small>{t(exercise.description)}</small>
              </button>
            })}
          </div>
          <div className="routine-add-options">
            <div><span>{t('routine.duration')}</span><div className="routine-chip-row">{ROUTINE_ITEM_DURATIONS.map((duration) => <button key={duration} type="button" className={selectedAddDuration === duration ? 'selected' : ''} onClick={() => setSelectedAddDuration(duration)}>{duration / 60} min</button>)}</div></div>
            <div><span>{t('warmup.difficulty')}</span><div className="routine-chip-row">{difficultyKeys.filter((difficulty) => supportsRoutineDifficulty(selectedAddMode, difficulty)).map((difficulty) => <button key={difficulty} type="button" className={selectedAddDifficulty === difficulty ? 'selected' : ''} onClick={() => setSelectedAddDifficulty(difficulty)}>{difficultyLabel(difficulty)}</button>)}</div></div>
          </div>
          <div className="warmup-result-actions">
            <button className="secondary-button" type="button" onClick={() => setAddOpen(false)}>{t('common.close')}</button>
            <button className="primary-button" type="button" onClick={addItem}><Plus size={14} /> {t('routine.addExercise')}</button>
          </div>
        </section>
      </div>}
    </section>
  }

  if (phase === 'transition') {
    const nextExercise = nextItem ? exerciseById(nextItem.modeId) : null
    const transitionOverlay = <div className="routine-transition-overlay">
        <section className="routine-transition-card">
          <Sparkles size={24} />
          <div className="panel-label">{t('routine.phaseComplete')}</div>
          <h2>{exercise.name}</h2>
          {nextExercise && <p>{t('routine.nextExercise', { exercise: nextExercise.name })}</p>}
          {nextItem && <div className="routine-transition-score"><span>{t('routine.startsIn')}</span><strong>{transitionCountdown}</strong><small>{formatRoutineDuration(nextItem.durationSeconds)} · {difficultyLabel(nextItem.difficulty)}</small></div>}
          <div className="warmup-result-actions">
            <button className="secondary-button" onClick={exitToBuilder}><LogOut size={15} /> {t('warmup.exit')}</button>
          </div>
        </section>
      </div>
    return <section className="warmup-game-workspace routine-game-workspace">
      <WarmupArena
        ref={arenaRef}
        phase="result"
        countdown={countdown}
        exercise={activeItem.modeId}
        difficulty={effectiveDifficulty}
        durationSeconds={activeItem.durationSeconds}
        crosshair={crosshair}
        pointerGain={pointerGain}
        sessionId={sessionId}
        sensitivityLabel={`${game.shortLabel} ${format(normalizedSensitivity ?? 0, 3)}`}
        instruction={t(exercise.instruction)}
        metrics={metrics}
        progressLabel={t('routine.phase', { current: stageIndex + 1, total: orderedItems.length })}
        completionOverlay={transitionOverlay}
        exitFullscreenOnComplete={false}
        releasePointerLockOnComplete={false}
        onMetrics={next => { recorder.sample(next); setMetrics(next) }}
        recordingDifficulty={activeItem.difficulty}
        onSessionStart={snapshot => {
          const state = sessions.getSnapshot()
          if (state.status !== 'auth-loading' && sessionContext.current) recorder.start(state.userId, activeItem.modeId, sessionContext.current, snapshot, activeItem.id)
        }}
        onSessionInvalid={reason => recorder.invalidate(reason)}
        onComplete={completeStage}
        onPointerLockChange={setInputReady}
      />
      <aside className="warmup-side-panel routine-side-panel">
        <span>{routine.name}</span>
        <strong>{format(metrics.remaining, 1)}<small>s</small></strong>
        <div><span>{t('common.score')}</span><b>{metrics.score}</b></div>
        <div><span>{t('common.accuracy')}</span><b>{format(metrics.accuracy)}%</b></div>
        <div><span>{t('warmup.level')}</span><b>{difficultyLabel(activeItem.difficulty)}</b></div>
        <ol>
          {orderedItems.map((item, index) => {
            const itemExercise = exerciseById(item.modeId)
            return <li key={item.id} className={index === stageIndex ? 'active' : index < stageIndex ? 'complete' : ''}><i>{index < stageIndex ? <Check size={10} /> : index + 1}</i><span>{itemExercise.name}<small>{formatRoutineDuration(item.durationSeconds)}</small></span></li>
          })}
        </ol>
      </aside>
    </section>
  }

  if (phase === 'result') {
    return <section className="warmup-workspace routine-workspace routine-result-workspace">
      <section className="routine-final-card">
        <Check size={26} />
        <div className="panel-label">{t('routine.complete')}</div>
        <h1>{routine.name}</h1>
        <p>{formatRoutineDuration(totalSeconds)} · {stageResults.length} {t('routine.exercises')}</p>
        <div className="routine-result-list">
          {stageResults.map(({ item, metrics, personalBest, pbUnavailable }, index) => {
            const exercise = exerciseById(item.modeId)
            const primary = item.modeId === 'tracking' || item.modeId === 'strafetrack'
              ? `${format(metrics.accuracy, 1)}%`
              : metrics.micro ? metrics.micro.meanAcquisitionTimeMs === null ? '—' : `${format(metrics.micro.meanAcquisitionTimeMs)} ms` : item.modeId === 'sniper-reaction'
                ? (metrics.reactionTimeMs ? `${format(metrics.reactionTimeMs)}ms` : '—')
                : String(metrics.score)
            const label = metrics.micro ? t('micro.acquisition') : item.modeId === 'tracking' || item.modeId === 'strafetrack' ? t('common.accuracy') : item.modeId === 'sniper-reaction' ? t('sniper.reaction') : t('common.score')
            return <article key={item.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{isRoutineModeAvailable(item.modeId) ? exercise.name : t('routines.unavailable')}</strong>
              <small>{formatRoutineDuration(item.durationSeconds)} · {difficultyLabel(item.difficulty)}</small>
              <b>{label} {primary}</b>
              {metrics.micro && <small>{t('common.accuracy')} {format(metrics.micro.accuracy, 1)}% · {t('micro.hits')} {metrics.micro.hits} · {t('micro.misses')} {metrics.micro.misses}</small>}
              {personalBest && personalBest.status !== 'none' && <em>{PERSONAL_BEST_COPY[locale][personalBest.status]} · {formatPersonalBestValue(personalBest, locale)}</em>}
              {pbUnavailable && <small>{PERSONAL_BEST_COPY[locale].unavailable}</small>}
            </article>
          })}
        </div>
        <div className="warmup-result-actions">
          <button className="secondary-button" onClick={exitToBuilder}><ArrowLeft size={15} /> {t('routine.backToBuilder')}</button>
          <button className="secondary-button" onClick={() => startStage(0)}><RotateCcw size={15} /> {t('common.restart')}</button>
        </div>
      </section>
    </section>
  }

  return <section className="warmup-game-workspace routine-game-workspace">
    <WarmupArena
      ref={arenaRef}
      phase={phase as WarmupPhase}
      countdown={countdown}
      exercise={activeItem.modeId}
      difficulty={effectiveDifficulty}
      durationSeconds={activeItem.durationSeconds}
      crosshair={crosshair}
      pointerGain={pointerGain}
      sessionId={sessionId}
      sensitivityLabel={`${game.shortLabel} ${format(normalizedSensitivity ?? 0, 3)}`}
      instruction={t(exercise.instruction)}
      metrics={metrics}
      progressLabel={t('routine.phase', { current: stageIndex + 1, total: orderedItems.length })}
      exitFullscreenOnComplete={false}
      releasePointerLockOnComplete={stageIndex >= orderedItems.length - 1}
      onMetrics={next => { recorder.sample(next); setMetrics(next) }}
      recordingDifficulty={activeItem.difficulty}
      onSessionStart={snapshot => {
        const state = sessions.getSnapshot()
        if (state.status !== 'auth-loading' && sessionContext.current) recorder.start(state.userId, activeItem.modeId, sessionContext.current, snapshot, activeItem.id)
      }}
      onSessionInvalid={reason => recorder.invalidate(reason)}
      onComplete={completeStage}
      onPointerLockChange={setInputReady}
    />
    <aside className="warmup-side-panel routine-side-panel">
      <span>{routine.name}</span>
      <strong>{format(metrics.remaining, 1)}<small>s</small></strong>
      <div><span>{t('common.score')}</span><b>{metrics.score}</b></div>
      <div><span>{t('common.accuracy')}</span><b>{format(metrics.accuracy)}%</b></div>
      <div><span>{t('warmup.level')}</span><b>{difficultyLabel(activeItem.difficulty)}</b></div>
      <ol>
        {orderedItems.map((item, index) => {
          const itemExercise = exerciseById(item.modeId)
          return <li key={item.id} className={index === stageIndex ? 'active' : index < stageIndex ? 'complete' : ''}><i>{index < stageIndex ? <Check size={10} /> : index + 1}</i><span>{itemExercise.name}<small>{formatRoutineDuration(item.durationSeconds)}</small></span></li>
        })}
      </ol>
    </aside>
  </section>
}
