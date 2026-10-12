import { XensiPageHeader } from './design/Primitives'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Circle, Copy, Crosshair, Dot, GripVertical, LogOut, MoreHorizontal, Pencil, Play, Plus, RotateCcw, Save, Sparkles, Trash2, X, type LucideIcon } from 'lucide-react'
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
import { getDegreesPerCount } from './aimModel'
import { preloadSniperArena } from './sniperArenaLoader'
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
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupCard, RadioGroupChip } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

const eyebrow = 'text-xs font-medium leading-none text-muted-foreground'
const heading = 'm-0 font-heading font-semibold leading-tight tracking-[-0.01em] text-foreground'

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
  return <Card className={cn('routine-builder-item gap-0 p-0', expanded && 'expanded border-foreground/15')}>
    <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
      <div className="flex flex-none items-center gap-1.5 text-subtle" aria-label={t('routines.itemOrder', { current: index + 1, total })}>
        <GripVertical size={15} aria-hidden="true" />
        <span className="font-mono text-xs font-medium text-primary">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-9 flex-none place-content-center rounded-lg border border-solid border-border bg-black/25 text-primary"><Icon size={17} aria-hidden="true" /></span>
        <span className="grid min-w-0 gap-1">
          <strong className="truncate font-heading text-[15px] font-semibold text-foreground">{isRoutineModeAvailable(item.modeId) ? exercise.name : t('routines.unavailable')}</strong>
          <small className="text-xs text-muted-foreground">{formatRoutineDuration(item.durationSeconds)} · {difficultyLabel(item.difficulty)}</small>
        </span>
      </div>
      <div className="flex flex-none items-center gap-1">
        <Button variant="ghost" size="icon" className="size-9" onClick={onMoveUp} disabled={index === 0} aria-label={t('routine.moveUp')}><ArrowUp /></Button>
        <Button variant="ghost" size="icon" className="size-9" onClick={onMoveDown} disabled={index === total - 1} aria-label={t('routine.moveDown')}><ArrowDown /></Button>
        <Button variant="ghost" size="icon" className="size-9" onClick={onDuplicate} aria-label={t('routine.duplicate')}><Copy /></Button>
        <Button variant="outline" size="sm" className="routine-edit-action" onClick={onToggle} aria-expanded={expanded}><Pencil /> {t('routines.edit')}</Button>
        <Button variant="ghost" size="icon" className="size-9 hover:text-destructive" onClick={onRemove} aria-label={t('routine.remove')}><X /></Button>
      </div>
    </div>
    {expanded && <div className="routine-item-expanded border-0 border-t border-solid border-border px-4 py-4 sm:px-5">{children}</div>}
  </Card>
}

function RoutineSummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="grid content-start gap-2 bg-card px-4 py-3"><span className={eyebrow}>{label}</span><strong className="font-mono text-lg font-medium leading-none tabular-nums text-foreground">{value}</strong></div>
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
  onActionsChange,
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
  onActionsChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const total = getRoutineTotalSeconds(routine.items)
  return <Card spotlight className="routine-library-card gap-4 p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1.5">
        <span className={eyebrow}>{t('routines.savedPlaylist')}</span>
        <h2 className={cn(heading, 'text-xl [overflow-wrap:anywhere]')}>{routine.name}</h2>
      </div>
      <DropdownMenu open={actionOpen} onOpenChange={onActionsChange}>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="routine-menu-trigger size-9 flex-none" aria-label={t('routines.actions', { name: routine.name })}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onEdit}><Pencil /> {t('routines.edit')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}><Copy /> {t('routines.duplicate')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}><Pencil /> {t('routines.rename')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 /> {t('routines.delete')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <p className="m-0 text-sm text-muted-foreground">{presetLabel}</p>
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">{formatRoutineDuration(total)}</Badge>
      <Badge variant="secondary">{routine.items.length} {t('routine.exercises')}</Badge>
    </div>
    <p className="m-0 text-xs leading-relaxed text-subtle">{sequence}</p>
    <div className="mt-auto border-0 border-t border-solid border-border pt-4">
      <Button className="routine-start-button w-full" disabled={disabled || validateRoutine(routine).length > 0 || !GAME_BY_ID[routine.gameId as GameId]} onClick={onStart}><Play /> {t('routines.start')}</Button>
    </div>
  </Card>
}

export function Routine() {
  const { t, locale } = useI18n()
  const arenaRef = useRef<ArenaHandle>(null)
  useEffect(() => { preloadSniperArena() }, [])
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
  const degreesPerCount = getDegreesPerCount(game, runtimeSensitivity ?? game.sensitivityMin) ?? undefined
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
      <XensiPageHeader className="routine-library-hero" title={t('routines.library')} description={t('routines.subtitle')} actions={<Button className="routine-create-button" disabled={sync.status !== 'ready' || sync.busy} onClick={createNewRoutine}><Plus /> {t('routines.createNew')}</Button>} />

      <div className="mb-4 flex gap-2"><Button variant="outline" size="icon" title={t('presets.retry')} aria-label={t('presets.retry')} disabled={sync.busy} onClick={refreshLibrary}><RotateCcw /></Button>{sync.userId && sync.pendingImport > 0 && <Button variant="outline" size="icon" title={t('routines.import')} aria-label={t('routines.import')} onClick={() => repository.offerImport()}><Save /></Button>}</div>
      {sync.error && <Alert variant="destructive" role="alert" className="mb-4"><span className="col-start-2">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</span></Alert>}
      <section className="routine-library-panel grid gap-4" aria-label={t('routines.mine')}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={cn(heading, 'text-xl')}>{t('routines.mine')}</h2>
          <span className="text-xs font-medium text-muted-foreground">{t('routines.savedCount', { count: library.length })}</span>
        </div>
        {sync.status !== 'ready' ? <p role="status" className="m-0 text-sm text-muted-foreground">{t('routines.loading')}</p> : library.length === 0 ? <Card className="routine-library-empty grid min-h-[300px] place-content-center justify-items-center gap-3 border-dashed p-8 text-center">
          <Sparkles size={24} className="text-primary" />
          <strong className={cn(heading, 'text-xl')}>{t('routines.emptyTitle')}</strong>
          <p className="m-0 text-sm text-muted-foreground">{t('routines.emptyText')}</p>
          <Button className="mt-2" onClick={createNewRoutine}><Plus /> {t('routines.create')}</Button>
        </Card> : <div className="routine-library-grid grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-4">
          {library.map((savedRoutine) => (
            <RoutineLibraryCard
              key={savedRoutine.id}
              routine={savedRoutine}
              presetLabel={getRoutinePresetLabel(savedRoutine)}
              sequence={getRoutineSequence(savedRoutine)}
              actionOpen={actionMenuId === savedRoutine.id}
              disabled={sync.busy || presetState.status !== 'ready'}
              onActionsChange={open => setActionMenuId(open ? savedRoutine.id : null)}
              onStart={() => startRoutine(savedRoutine)}
              onEdit={() => openBuilder(savedRoutine)}
              onDuplicate={() => duplicateRoutine(savedRoutine)}
              onRename={() => requestRenameRoutine(savedRoutine)}
              onDelete={() => { setActionMenuId(null); setDeleteTarget(savedRoutine) }}
            />
          ))}
        </div>}
      </section>

      <Dialog open={Boolean(renameTarget)} onOpenChange={open => { if (!open) setRenameTarget(null) }}>
        <DialogContent closeLabel={t('common.close')} className="routine-action-modal">
          <DialogHeader><Pencil size={20} className="text-primary" aria-hidden="true" /><DialogTitle>{t('routines.renameTitle')}</DialogTitle><DialogDescription>{t('routines.renameText')}</DialogDescription></DialogHeader>
          <div className="grid gap-2"><Label htmlFor="routine-rename">{t('routine.name')}</Label><Input id="routine-rename" value={renameValue} maxLength={48} autoFocus onChange={(event) => setRenameValue(event.target.value)} /></div>
          {sync.error && <p role="alert" className="m-0 text-sm text-destructive">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>{t('routines.cancel')}</Button>
            <Button disabled={sync.busy || !renameValue.trim()} onClick={confirmRenameRoutine}><Save /> {t('routines.saveName')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent closeLabel={t('common.close')} className="routine-action-modal">
          <DialogHeader><Trash2 size={20} className="text-destructive" aria-hidden="true" /><DialogTitle>{t('routines.deleteQuestion')}</DialogTitle><DialogDescription>{deleteTarget && t('routines.deleteText', { name: deleteTarget.name })}</DialogDescription></DialogHeader>
          {sync.error && <p role="alert" className="m-0 text-sm text-destructive">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('routines.cancel')}</Button>
            <Button variant="destructive" disabled={sync.busy} onClick={confirmDeleteRoutine}><Trash2 /> {t('routines.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  }

  if (phase === 'builder') {
    const chipGroup = 'flex flex-wrap gap-1.5'
    return <section className="warmup-workspace routine-workspace routine-builder-workspace" ref={setupRef}>
      <XensiPageHeader className="routine-builder-hero" title={t('routine.title')} description={t('routine.subtitle')} actions={<Button variant="outline" className="routine-back-library" onClick={() => { refreshLibrary(); setScreen('library') }}><ArrowLeft /> {t('routines.back')}</Button>} />

      <div className="routine-builder-layout grid items-start gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="routine-builder-context gap-5 p-5 lg:sticky lg:top-28">
          <WizardStepper current={setupStep} steps={[t('warmup.stepGame'), t('warmup.stepSettings'), t('warmup.stepCrosshair')]} />
          <div className="routine-context-panel">
            <WizardStepPanel key={setupStep} step={setupStep} direction={stepDirection}>
              {setupStep === 1 && <div className="grid gap-4">
                <h2 className={cn(heading, 'text-base')}>{t('routine.contextTitle')}</h2>
                <GamePicker gameIds={GAMES.map(item => item.id)} value={selectedGame} onChange={config.selectGame} presets={config.presets} />
              </div>}
              {setupStep === 2 && <SensitivityConfigFields draft={config.draft} presets={config.presets} onSelectPreset={config.selectPreset} onSensitivityChange={setSensitivity} onDpiChange={setDpi} sensitivityInvalid={parsedSensitivity === null} dpiInvalid={parsedDpi === null} />}
              {setupStep === 3 && <div className="grid gap-4">
                <h2 className={cn(heading, 'text-base')}>{t('warmup.crosshairTitle')}</h2>
                <RadioGroup className="warmup-crosshairs grid-cols-2 gap-2" aria-label={t('calibration.crosshairType')} value={crosshair} onValueChange={value => setCrosshair(value as CrosshairStyle)}>
                  {CROSSHAIRS.map((item) => { const Icon = item.icon; return <RadioGroupChip key={item.id} value={item.id} className="h-11 [&_svg]:text-primary"><Icon />{t(item.label)}</RadioGroupChip> })}
                </RadioGroup>
              </div>}
            </WizardStepPanel>
          </div>
          <div className="routine-context-actions flex justify-end gap-2 border-0 border-t border-solid border-border pt-4">
            {setupStep > 1 && <Button variant="outline" onClick={() => { setStepDirection(-1); setSetupStep((setupStep - 1) as SetupStep) }}><ArrowLeft /> {t('warmup.back')}</Button>}
            {setupStep < 3 && <Button onClick={() => { setStepDirection(1); setSetupStep((setupStep + 1) as SetupStep) }} disabled={setupStep === 2 && !validSetup}>{t('warmup.next')} <ArrowRight /></Button>}
          </div>
        </Card>

        <Card className="routine-playlist-panel gap-5 p-5" aria-label={t('routine.playlist')} role="region">
          <div className="grid gap-4 xl:grid-cols-[minmax(180px,1fr)_auto_auto] xl:items-end">
            <div className="grid min-w-0 gap-2"><Label htmlFor="routine-name">{t('routine.name')}</Label><Input id="routine-name" value={routine.name} maxLength={48} onChange={(event) => { setSaveState('idle'); setRoutine(current => ({ ...current, name: event.target.value })) }} /></div>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-solid border-border bg-border" aria-label={t('routine.summary')}>
              <RoutineSummaryMetric label={t('routine.totalDuration')} value={formatRoutineDuration(totalSeconds)} />
              <RoutineSummaryMetric label={t('routine.exerciseCount')} value={String(orderedItems.length)} />
              <RoutineSummaryMetric label={t('common.gameReference')} value={game.shortLabel} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={sync.busy || sync.status !== 'ready'} onClick={saveRoutine}><Save /> {saveState === 'saved' ? t('routine.saved') : t('routine.save')}</Button>
              <Button disabled={!canStart} onClick={() => startRoutine()}><Play /> {t('routine.start')}</Button>
            </div>
          </div>
          {sync.error && <p role="alert" className="m-0 text-sm text-destructive">{t(sync.error === 'import' ? 'routines.importFailure' : 'routines.saveFailure')}</p>}

          {orderedItems.length === 0 ? <div className="routine-empty-state grid min-h-[260px] place-content-center justify-items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <Sparkles size={22} className="text-primary" />
            <strong className={cn(heading, 'text-lg')}>{t('routine.emptyTitle')}</strong>
            <p className="m-0 text-sm text-muted-foreground">{t('routine.emptyDescription')}</p>
            <Button className="mt-2" onClick={() => setAddOpen(true)}><Plus /> {t('routine.addExercise')}</Button>
          </div> : <div className="routine-builder-list grid gap-3 border-0 border-t border-solid border-border pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className={cn(heading, 'text-lg')}>{t('routine.playlist')}</h2>
              <span className="text-xs font-medium text-muted-foreground">{orderedItems.length} {t('routine.exercises')}</span>
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
                <div className="routine-item-controls grid items-start gap-4 md:grid-cols-[auto_auto_minmax(180px,1fr)_auto]">
                  <div className="grid gap-2">
                    <span className={eyebrow}>{t('routine.duration')}</span>
                    <RadioGroup className={chipGroup} aria-label={t('routine.duration')} value={String(item.durationSeconds)} onValueChange={value => updateItem(item.id, { durationSeconds: Number(value) as RoutineItemDuration })}>
                      {ROUTINE_ITEM_DURATIONS.map((duration) => <RadioGroupChip key={duration} value={String(duration)}>{duration / 60}m</RadioGroupChip>)}
                    </RadioGroup>
                  </div>
                  <div className="grid gap-2">
                    <span className={eyebrow}>{t('warmup.difficulty')}</span>
                    <RadioGroup className={chipGroup} aria-label={t('warmup.difficulty')} value={item.difficulty} onValueChange={value => updateItem(item.id, { difficulty: value as WarmupDifficulty })}>
                      {difficultyKeys.filter((difficulty) => supportsRoutineDifficulty(item.modeId, difficulty)).map((difficulty) => <RadioGroupChip key={difficulty} value={difficulty}>{difficultyLabel(difficulty)}</RadioGroupChip>)}
                    </RadioGroup>
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <Label htmlFor={`routine-exercise-${item.id}`}>{t('routine.exercise')}</Label>
                    <Select value={item.modeId} onValueChange={value => updateItem(item.id, { modeId: value as WarmupExercise })}>
                      <SelectTrigger id={`routine-exercise-${item.id}`} size="sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {!isRoutineModeAvailable(item.modeId) && <SelectItem value={item.modeId}>{t('routines.unavailable')}</SelectItem>}
                        {EXERCISES.filter(exercise => exercise.completionMode !== 'rounds').map((exercise) => <SelectItem key={exercise.id} value={exercise.id}>{exercise.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="routine-expanded-preview w-[132px] max-md:hidden">
                    <ExerciseMicroPreview modeId={item.modeId} />
                  </div>
                </div>
              </RoutineItemCard>
            ))}
          </div>}

          <div className="routine-builder-footer flex flex-wrap items-center gap-2 border-0 border-t border-solid border-border pt-5">
            <Button variant="outline" onClick={() => setAddOpen(true)}><Plus /> {t('routine.addExercise')}</Button>
            <Button variant="outline" onClick={copyRoutineCard}><Copy /> {t('routine.copyCard')}</Button>
            {issues.includes('mode') && <span role="alert" className="text-sm text-destructive">{t('routines.unavailable')}</span>}
            {issues.includes('empty') && <span className="text-sm text-muted-foreground">{t('routine.emptyGuard')}</span>}
          </div>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent closeLabel={t('common.close')} className="routine-add-modal max-w-[820px]">
          <DialogHeader><Plus size={20} className="text-primary" aria-hidden="true" /><DialogTitle>{t('routine.addExercise')}</DialogTitle><DialogDescription>{t('routine.addDescription')}</DialogDescription></DialogHeader>
          <RadioGroup className="routine-add-grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('routine.exercise')} value={selectedAddMode} onValueChange={value => { const mode = value as WarmupExercise; setSelectedAddMode(mode); if (!supportsRoutineDifficulty(mode, selectedAddDifficulty)) setSelectedAddDifficulty('medium') }}>
            {EXERCISES.filter(exercise => exercise.completionMode !== 'rounds').map((exercise) => {
              const Icon = exercise.icon
              return <RadioGroupCard key={exercise.id} value={exercise.id} indicator="corner" className="items-start p-3.5">
                <Icon size={18} className="mt-0.5 flex-none text-primary" aria-hidden="true" />
                <span className="grid min-w-0 gap-1"><strong className="font-semibold">{exercise.name}</strong><small className="text-xs font-normal leading-snug text-muted-foreground">{t(exercise.description)}</small></span>
              </RadioGroupCard>
            })}
          </RadioGroup>
          <div className="routine-add-options grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><span className={eyebrow}>{t('routine.duration')}</span><RadioGroup className={chipGroup} aria-label={t('routine.duration')} value={String(selectedAddDuration)} onValueChange={value => setSelectedAddDuration(Number(value) as RoutineItemDuration)}>{ROUTINE_ITEM_DURATIONS.map((duration) => <RadioGroupChip key={duration} value={String(duration)}>{duration / 60} min</RadioGroupChip>)}</RadioGroup></div>
            <div className="grid gap-2"><span className={eyebrow}>{t('warmup.difficulty')}</span><RadioGroup className={chipGroup} aria-label={t('warmup.difficulty')} value={selectedAddDifficulty} onValueChange={value => setSelectedAddDifficulty(value as WarmupDifficulty)}>{difficultyKeys.filter((difficulty) => supportsRoutineDifficulty(selectedAddMode, difficulty)).map((difficulty) => <RadioGroupChip key={difficulty} value={difficulty}>{difficultyLabel(difficulty)}</RadioGroupChip>)}</RadioGroup></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.close')}</Button>
            <Button onClick={addItem}><Plus /> {t('routine.addExercise')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            <Button variant="outline" onClick={exitToBuilder}><LogOut /> {t('warmup.exit')}</Button>
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
        degreesPerCount={degreesPerCount}
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
          <Button variant="outline" onClick={exitToBuilder}><ArrowLeft /> {t('routine.backToBuilder')}</Button>
          <Button onClick={() => startStage(0)}><RotateCcw /> {t('common.restart')}</Button>
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
      degreesPerCount={degreesPerCount}
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
