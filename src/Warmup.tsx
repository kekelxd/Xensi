import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Activity, ArrowLeft, ArrowRight, Crosshair, Dot, Circle, Plus, LogOut, MousePointer2, Play, RotateCcw, Settings2, Sparkles, Target, TrendingUp, X, type LucideIcon } from 'lucide-react'
import { GAME_BY_ID, GAMES, type GameId } from './games'
import { GamePicker } from './GamePicker'
import { SensitivityConfigFields } from './SensitivityConfigFields'
import { WizardStepPanel, WizardStepper } from './SetupWizard'
import { useSensitivityPreset } from './useSensitivityPreset'
import { createSessionContext, type SessionContext } from './playerProfileStore'
import { useDialogFocus } from './useDialogFocus'
import { normalizeSensitivity, parsePositiveNumberInput } from './sensitivity'
import type { CrosshairStyle } from './TrackingArena'
import { calculateWarmupAccuracy, getWarmupPointerGain, WARMUP_DIFFICULTIES, WARMUP_DURATION, type FixedWarmupDifficulty, type WarmupDifficulty, type WarmupExercise } from './warmupConfig'
import { useI18n, type TranslationKey } from './i18n'
import { clampAimCoordinate, requestStablePointerLock, sanitizePointerMovement } from './pointerInput'
import { EXERCISES, EXERCISE_CATEGORIES, supportsExerciseDifficulty, type ExerciseCategory } from './warmupExercises'
import { SniperReaction, summarizeSniper } from './sniperReaction'
import './sniperReaction.css'
import { createEmptyWarmupMetrics, getAimBiasLabel, getAimDiagnosis, getWarmupRecommendation, type WarmupMetrics, type WarmupSessionSummary } from './warmupTelemetry'
import { exerciseConfig, sessionSummary, type ExerciseConfig, type SessionReason } from './trainingSession'
import { getSessionRepository } from './sessionRepository'
import { useSessionRecorder } from './useSessionRecorder'
import { formatPersonalBestValue, type PersonalBestResult } from './personalBests'
import { usePersonalBestFeedback } from './usePersonalBestFeedback'
import { PERSONAL_BEST_COPY } from './personalBestCopy'
import { MicroFlick, MICRO_FLICK_PB_REQUIREMENTS } from './microFlick'

export type { WarmupMetrics } from './warmupTelemetry'

export type WarmupPhase = 'hub' | 'setup' | 'countdown' | 'playing' | 'result'
type SetupStep = 1 | 2 | 3

const CROSSHAIRS: Array<{ id: CrosshairStyle, label: TranslationKey, icon: LucideIcon }> = [
  { id: 'classic', label: 'crosshair.classic', icon: Crosshair },
  { id: 'dot', label: 'crosshair.dot', icon: Dot },
  { id: 'circle', label: 'crosshair.circle', icon: Circle },
  { id: 'plus', label: 'crosshair.plus', icon: Plus },
]

function ExercisePreview({ exercise, name }: { exercise: WarmupExercise, name: string }) {
  if (exercise === 'sniper-reaction') return <div className="warmup-preview sniper-preview" aria-hidden="true"><div className="sniper-preview-opening"><span /></div><div className="preview-meta"><b>{name}</b></div></div>
  return (
    <div className={`warmup-preview warmup-preview-${exercise}`} aria-hidden="true">
      <span className="preview-target preview-target-a" />
      <span className="preview-target preview-target-b" />
      <span className="preview-target preview-target-c" />
      <span className="preview-crosshair" />
      <div className="preview-meta"><b>{name}</b></div>
    </div>
  )
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)
const format = (value: number, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '0'
const isClickExercise = (exercise: WarmupExercise) => exercise === 'flick' || exercise === 'reflex' || exercise === 'gridshot'
const isTrackingExercise = (exercise: WarmupExercise) => exercise === 'tracking' || exercise === 'strafetrack'
const exerciseRadiusScale = (exercise: WarmupExercise) => exercise === 'gridshot' ? 0.78 : exercise === 'reflex' || exercise === 'strafetrack' ? 0.88 : 1
const reflexWindow = (targetScale: number) => targetScale > 1 ? 1250 : targetScale > 0.8 ? 900 : 650

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, style: CrosshairStyle, color: string) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = style === 'plus' ? 2.2 : 1.5
  if (style === 'dot') {
    ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill(); return
  }
  if (style === 'circle') {
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); return
  }
  const gap = style === 'plus' ? 2 : 7
  const length = style === 'plus' ? 12 : 14
  ctx.beginPath()
  ctx.moveTo(x - gap - length, y); ctx.lineTo(x - gap, y)
  ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + length, y)
  ctx.moveTo(x, y - gap - length); ctx.lineTo(x, y - gap)
  ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + length)
  ctx.stroke()
  if (style === 'classic') { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill() }
}

function signed(value: number, suffix = '') {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}${suffix}`
}

function WarmupReport({ metrics, previous, exercise, onSelectRecommendation }: { metrics: WarmupMetrics, previous: WarmupSessionSummary | null, exercise: WarmupExercise, onSelectRecommendation: (exercise: WarmupExercise) => void }) {
  const { t } = useI18n()
  if (metrics.micro) {
    const micro = metrics.micro
    return <div className="warmup-report"><div className="report-metrics-grid">
      <div><span>{t('common.accuracy')}</span><strong>{format(micro.accuracy, 1)}%</strong></div>
      <div><span>{t('micro.acquisition')}</span><strong>{micro.meanAcquisitionTimeMs === null ? '—' : `${format(micro.meanAcquisitionTimeMs)} ms`}</strong></div>
      <div><span>{t('micro.median')}</span><strong>{micro.medianAcquisitionTimeMs === null ? '—' : `${format(micro.medianAcquisitionTimeMs)} ms`}</strong></div>
      <div><span>{t('micro.hits')}</span><strong>{micro.hits}</strong></div>
      <div><span>{t('micro.misses')}</span><strong>{micro.misses}</strong></div>
      <div><span>{t('micro.rate')}</span><strong>{format(micro.targetsPerSecond, 2)}</strong></div>
      <div><span>{t('micro.distance')}</span><strong>{micro.meanFlickDistancePx === null ? '—' : `${format(micro.meanFlickDistancePx, 1)} px`}</strong></div>
      <div><span>{t('micro.overshoot')}</span><strong>{micro.meanOvershootPx === null ? '—' : `${format(micro.meanOvershootPx, 1)} px`}</strong></div>
    </div><p>{t('micro.pbRequirements', { accuracy: MICRO_FLICK_PB_REQUIREMENTS.minAccuracy, hits: MICRO_FLICK_PB_REQUIREMENTS.minHits })}</p></div>
  }
  const trackingExercise = isTrackingExercise(exercise)
  const diagnosis = getAimDiagnosis(metrics, exercise)
  const recommendationId = getWarmupRecommendation(metrics, exercise)
  const recommendation = EXERCISES.find((item) => item.id === recommendationId) ?? EXERCISES[0]
  const comparison = previous ? [
    { label: t('common.score'), value: signed(metrics.score - previous.score) },
    { label: t('common.accuracy'), value: signed(metrics.accuracy - previous.accuracy, '%') },
    { label: t('warmup.reactionSpeed'), value: metrics.reactionTimeMs && previous.reactionTimeMs ? signed(metrics.reactionTimeMs - previous.reactionTimeMs, 'ms') : '—' },
  ] : []
  const overshootUnit = exercise === 'flick' || exercise === 'reflex' || exercise === 'gridshot'
    ? t('warmup.doctorFlicks')
    : t('warmup.doctorCorrections')
  const diagnosisMessage = diagnosis.kind === 'overshoot'
    ? t('warmup.doctorOvershoot', { rate: diagnosis.rate, unit: overshootUnit })
    : diagnosis.kind === 'clicks'
      ? t('warmup.doctorClicks', { rate: diagnosis.rate })
      : diagnosis.kind === 'bias'
        ? t('warmup.doctorBias', { direction: getAimBiasLabel(metrics.aimBiasX, metrics.aimBiasY).toLowerCase() })
        : diagnosis.kind === 'tracking'
          ? t('warmup.doctorTracking', { accuracy: diagnosis.rate })
          : t('warmup.doctorBalanced')

  return (
    <div className="warmup-report">
      <div className="report-metrics-grid">
        {metrics.sniper ? <>
          <div><span>{t('sniper.reaction')}</span><strong>{metrics.sniper.hits ? `${format(metrics.reactionTimeMs)}ms` : '—'}</strong></div>
          <div><span>{t('common.accuracy')}</span><strong>{format(metrics.accuracy, 1)}%</strong></div>
          <div><span>{t('sniper.consistency')}</span><strong>{metrics.sniper.consistency === null ? '—' : `${format(metrics.sniper.consistency)}%`}</strong></div>
          <div><span>{t('sniper.earlyShots')}</span><strong>{metrics.sniper.earlyShots}</strong></div>
          <div><span>{t('sniper.best')}</span><strong>{metrics.sniper.bestReactionMs === null ? '—' : `${format(metrics.sniper.bestReactionMs)}ms`}</strong></div>
        </> : <>
        <div><span>{t('common.accuracy')}</span><strong>{format(metrics.accuracy, 1)}%</strong></div>
        <div><span>{t('warmup.timeOnTarget')}</span><strong>{format(metrics.onTargetMs / 1000, 1)}s</strong></div>
        <div><span>{t('warmup.reactionSpeed')}</span><strong>{metrics.reactionTimeMs ? `${format(metrics.reactionTimeMs)}ms` : '—'}</strong></div>
        <div><span>{t('warmup.clickErrors')}</span><strong>{metrics.clickErrors}</strong></div>
        <div><span>{t('warmup.bestStreak')}</span><strong>{trackingExercise ? `${format(metrics.bestTrackingStreakMs / 1000, 1)}s` : metrics.bestStreak}</strong></div>
        </>}
      </div>
      {!metrics.sniper && <>
      <section className={`aim-doctor-card ${diagnosis.kind}`}>
        <div className="report-section-heading"><div><Activity size={15} /><span>{t('warmup.aimDoctor')}</span></div></div>
        <p>{diagnosisMessage}</p>
      </section>
      <div className="report-insights-grid">
        <section className="aim-bias-insight">
          <div className="report-section-heading"><div><Target size={15} /><span>Tendência de mira</span></div></div>
          <div className="aim-bias-visual" style={{ '--bias-x': metrics.aimBiasX ?? 0, '--bias-y': metrics.aimBiasY ?? 0 } as React.CSSProperties}><i /><b /></div>
          <p><strong>{getAimBiasLabel(metrics.aimBiasX, metrics.aimBiasY)}</strong> em relação ao centro do alvo.</p>
        </section>
        <section>
          <div className="report-section-heading"><div><TrendingUp size={15} /><span>{t('warmup.previousComparison')}</span></div></div>
          {previous ? <div className="session-comparison">
            {comparison.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
          </div> : <p>{t('warmup.firstComparison')}</p>}
        </section>
        <button type="button" className="exercise-recommendation" onClick={() => onSelectRecommendation(recommendationId)}>
          <div className="report-section-heading"><div><Activity size={15} /><span>{t('warmup.nextRecommendation')}</span></div></div>
          <strong>{recommendation.name} <ArrowRight size={15} /></strong>
          <p>{t('warmup.recommendationDescription')}</p>
        </button>
      </div>
      </>}
    </div>
  )
}

function PersonalBestFeedback({ result, exercise, gameLabel }: { result: PersonalBestResult; exercise: WarmupExercise; gameLabel: string }) {
  const { t, locale } = useI18n()
  const copy = PERSONAL_BEST_COPY[locale]
  if (result.status === 'none') return null
  const metricLabel = result.definition.primaryMetric === 'meanAcquisitionTimeMs' ? t('micro.acquisition') : result.definition.primaryMetric === 'bestReactionMs' ? t('sniper.best') : result.definition.primaryMetric === 'accuracy' ? t('common.accuracy') : t('common.score')
  const context = result.current.context
  return <section className={`personal-best-feedback personal-best-${result.status}`} aria-live="polite">
    <div className="personal-best-heading"><Target size={17} /><span>{result.status === 'first' ? copy.first : copy.new}</span></div>
    <div className="personal-best-main"><strong>{exercise === 'sniper-reaction' ? 'Sniper Reaction' : metricLabel}</strong><b aria-label={copy.newBest}>{formatPersonalBestValue(result, locale)}</b>{result.delta !== null && <small>{result.definition.direction === 'higher' ? '↑' : '↓'} {formatPersonalBestValue({ definition: result.definition, value: result.delta }, locale)}</small>}</div>
    {result.previousValue !== null && <div className="personal-best-previous"><span>{copy.previous}</span><strong>{formatPersonalBestValue({ definition: result.definition, value: result.previousValue }, locale)}</strong></div>}
    {context && <small className="personal-best-context">{gameLabel} · {context.sensitivity} · {context.dpi} DPI</small>}
  </section>
}

type ArenaProps = {
  phase: WarmupPhase
  countdown: number
  exercise: WarmupExercise
  difficulty: WarmupDifficulty
  durationSeconds?: number
  crosshair: CrosshairStyle
  pointerGain: number
  sessionId: number
  sensitivityLabel: string
  instruction: string
  metrics: WarmupMetrics
  progressLabel?: string
  completionOverlay?: ReactNode
  exitFullscreenOnComplete?: boolean
  releasePointerLockOnComplete?: boolean
  onMetrics: (metrics: WarmupMetrics) => void
  onComplete: (metrics: WarmupMetrics) => void
  onPointerLockChange: (locked: boolean) => void
  recordingDifficulty?: WarmupDifficulty
  onSessionStart?: (config: ExerciseConfig) => void
  onSessionInvalid?: (reason: SessionReason) => void
}

export type ArenaHandle = { requestPointerLock: () => void }

export const WarmupArena = forwardRef<ArenaHandle, ArenaProps>(function WarmupArena({ phase, countdown, exercise, difficulty, durationSeconds = WARMUP_DURATION, crosshair, pointerGain, sessionId, sensitivityLabel, instruction, metrics, progressLabel, completionOverlay, exitFullscreenOnComplete = true, releasePointerLockOnComplete = true, onMetrics, onComplete, onPointerLockChange, recordingDifficulty, onSessionStart, onSessionInvalid }, ref) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sniperRef = useRef<SniperReaction | null>(null)
  const microRef = useRef<MicroFlick | null>(null)
  const translateRef = useRef(t)
  useEffect(() => { translateRef.current = t }, [t])
  const [pointerLocked, setPointerLocked] = useState(false)
  const pointerLockedAtRef = useRef(0)
  const pointerLockedRef = useRef(false)
  const inputPausedAtRef = useRef(0)
  const phaseRef = useRef(phase)
  const exerciseRef = useRef(exercise)
  const configRef = useRef(WARMUP_DIFFICULTIES[difficulty])
  const gainRef = useRef(pointerGain)
  const durationSecondsRef = useRef(durationSeconds)
  const crosshairRef = useRef(crosshair)
  const exitFullscreenOnCompleteRef = useRef(exitFullscreenOnComplete)
  const releasePointerLockOnCompleteRef = useRef(releasePointerLockOnComplete)
  const onMetricsRef = useRef(onMetrics)
  const onCompleteRef = useRef(onComplete)
  const recordingRef = useRef({ difficulty, recordingDifficulty, onSessionStart, onSessionInvalid })
  useEffect(() => { recordingRef.current = { difficulty, recordingDifficulty, onSessionStart, onSessionInvalid } }, [difficulty, recordingDifficulty, onSessionStart, onSessionInvalid])
  const recordStart = (width: number, height: number) => {
    const recording = recordingRef.current
    const snapshot = exerciseConfig(exerciseRef.current, recording.recordingDifficulty ?? recording.difficulty,
      recording.difficulty === 'adaptive' ? 'medium' : recording.difficulty, durationSecondsRef.current, width, height, crosshairRef.current)
    if (snapshot.micro && microRef.current) snapshot.micro.seed = microRef.current.seed
    recording.onSessionStart?.(snapshot)
  }
  const stateRef = useRef({
    aimX: 0, aimY: 0, visualAimX: 0, visualAimY: 0,
    targetX: 0, targetY: 0, destinationX: 0, destinationY: 0,
    directionX: 1, directionY: 0, width: 0, height: 0,
    lastFrame: 0, startedAt: 0, lastMetricsAt: 0,
    onTargetMs: 0, currentOnTargetStreakMs: 0, bestOnTargetStreakMs: 0,
    dwellMs: 0, hiddenUntil: 0, targetExpiresAt: 0,
    extraTargets: [] as Array<{ x: number, y: number }>, strafeDirection: 1, nextDirectionChangeAt: 0,
    targetTrail: [] as Array<{ x: number, y: number, time: number }>, lastTrailSample: 0,
    targetVisibleAt: [0, 0, 0], targetAcquired: false,
    reactionMsTotal: 0, reactionCount: 0, clickErrors: 0, currentStreak: 0, bestStreak: 0,
    lastAimSampleAt: 0, aimBiasXTotal: 0, aimBiasYTotal: 0, aimBiasSamples: 0,
    previousAimOffsetX: 0, previousAimOffsetY: 0, hasPreviousAimOffset: false,
    previousSampleAimX: 0, previousSampleAimY: 0, hasPreviousSampleAim: false, correctionCount: 0,
    overshootCount: 0, lastOvershootAt: 0,
    hits: 0, shots: 0, score: 0, complete: false,
  })

  useImperativeHandle(ref, () => ({ requestPointerLock: () => { void requestStablePointerLock(canvasRef.current) } }), [])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { exerciseRef.current = exercise }, [exercise])
  useEffect(() => { configRef.current = WARMUP_DIFFICULTIES[difficulty] }, [difficulty])
  useEffect(() => { gainRef.current = pointerGain }, [pointerGain])
  useEffect(() => { durationSecondsRef.current = durationSeconds }, [durationSeconds])
  useEffect(() => { crosshairRef.current = crosshair }, [crosshair])
  useEffect(() => { exitFullscreenOnCompleteRef.current = exitFullscreenOnComplete }, [exitFullscreenOnComplete])
  useEffect(() => { releasePointerLockOnCompleteRef.current = releasePointerLockOnComplete }, [releasePointerLockOnComplete])
  useEffect(() => { onMetricsRef.current = onMetrics }, [onMetrics])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const placeTarget = (time = 0, slot = 0) => {
    const state = stateRef.current
    const exercise = exerciseRef.current
    const radius = Math.max(16, Math.min(state.width, state.height) * 0.048 * configRef.current.targetScale * exerciseRadiusScale(exercise))
    const existing = [{ x: state.targetX, y: state.targetY }, ...state.extraTargets].filter((_, index) => index !== slot)
    let next = { x: state.width / 2, y: state.height / 2 }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      next = {
        x: randomBetween(radius * 1.7, Math.max(radius * 1.7, state.width - radius * 1.7)),
        y: randomBetween(radius * 1.7, Math.max(radius * 1.7, state.height - radius * 1.7)),
      }
      if (existing.every((target) => !target.x || Math.hypot(target.x - next.x, target.y - next.y) > radius * 3.2)) break
    }
    if (slot === 0) { state.targetX = next.x; state.targetY = next.y } else state.extraTargets[slot - 1] = next
    state.hiddenUntil = exercise === 'gridshot' ? 0 : time ? time + configRef.current.respawnMs : 0
    state.targetVisibleAt[slot] = exercise === 'gridshot' ? time : state.hiddenUntil
    if (slot === 0) {
      state.targetAcquired = false
      state.hasPreviousAimOffset = false
    }
    if (exercise === 'reflex') state.targetExpiresAt = time ? state.hiddenUntil + reflexWindow(configRef.current.targetScale) : 0
    state.dwellMs = 0
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const updateLock = () => {
      const locked = document.pointerLockElement === canvas
      if (locked) {
        const state = stateRef.current
        const now = performance.now()
        if (inputPausedAtRef.current && state.startedAt) state.startedAt += now - inputPausedAtRef.current
        inputPausedAtRef.current = 0
        state.aimX = canvas.clientWidth / 2
        state.aimY = canvas.clientHeight / 2
        state.visualAimX = state.aimX
        state.visualAimY = state.aimY
        state.lastFrame = now
        pointerLockedAtRef.current = now
      } else {
        pointerLockedAtRef.current = 0
        if (pointerLockedRef.current && phaseRef.current === 'playing') {
          inputPausedAtRef.current = performance.now()
          if (stateRef.current.startedAt && !stateRef.current.complete) recordingRef.current.onSessionInvalid?.('pointer_lock_lost')
        }
      }
      pointerLockedRef.current = locked
      setPointerLocked(locked)
      onPointerLockChange(locked)
    }
    const handleMove = (event: MouseEvent) => {
      if ((phaseRef.current !== 'countdown' && phaseRef.current !== 'playing') || document.pointerLockElement !== canvas) return
      const state = stateRef.current
      const movement = sanitizePointerMovement({
        movementX: event.movementX,
        movementY: event.movementY,
        gain: gainRef.current,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        elapsedSinceLock: performance.now() - pointerLockedAtRef.current,
      })
      if (!movement) return
      state.aimX = clampAimCoordinate(state.aimX + movement.x, canvas.clientWidth)
      state.aimY = clampAimCoordinate(state.aimY + movement.y, canvas.clientHeight)
      microRef.current?.sampleAim({ x: state.aimX, y: state.aimY })
    }
    const handleShot = (event: MouseEvent) => {
      if (microRef.current) {
        const state = stateRef.current, now = performance.now()
        if (event.button === 0 && phaseRef.current === 'playing' && document.pointerLockElement === canvas
          && state.startedAt && !state.complete && now - state.startedAt < durationSecondsRef.current * 1000) {
          microRef.current.shoot(now - state.startedAt, { x: state.aimX, y: state.aimY })
        }
        return
      }
      if (exerciseRef.current === 'sniper-reaction') {
        if (event.button !== 0 || phaseRef.current !== 'playing' || document.pointerLockElement !== canvas) return
        const state = stateRef.current
        if (!state.startedAt || state.complete || performance.now() - state.startedAt >= durationSecondsRef.current * 1000) return
        const scale = Math.max(1, Math.min(state.width, state.height))
        sniperRef.current?.shoot(performance.now() - state.startedAt, (state.aimX - state.width / 2) / scale, (state.aimY - state.height / 2) / scale)
        return
      }
      if (event.button !== 0 || phaseRef.current !== 'playing' || !isClickExercise(exerciseRef.current) || document.pointerLockElement !== canvas) return
      const state = stateRef.current
      const exercise = exerciseRef.current
      const radius = Math.max(16, Math.min(state.width, state.height) * 0.048 * configRef.current.targetScale * exerciseRadiusScale(exercise))
      state.shots += 1
      const targets = [{ x: state.targetX, y: state.targetY }, ...(exercise === 'gridshot' ? state.extraTargets : [])]
      const hitIndex = targets.findIndex((target) => Math.hypot(state.visualAimX - target.x, state.visualAimY - target.y) <= radius)
      const now = performance.now()
      if (state.hiddenUntil <= now && hitIndex >= 0) {
        state.hits += 1
        state.score += 100
        state.currentStreak += 1
        state.bestStreak = Math.max(state.bestStreak, state.currentStreak)
        const visibleAt = state.targetVisibleAt[hitIndex]
        if (visibleAt > 0) {
          state.reactionMsTotal += Math.max(0, now - visibleAt)
          state.reactionCount += 1
        }
        placeTarget(now, hitIndex)
      } else {
        state.clickErrors += 1
        state.currentStreak = 0
      }
    }
    document.addEventListener('pointerlockchange', updateLock)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mousedown', handleShot)
    updateLock()
    return () => {
      document.removeEventListener('pointerlockchange', updateLock)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mousedown', handleShot)
    }
  }, [onPointerLockChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0)
      const state = stateRef.current
      const oldWidth = state.width || rect.width
      const oldHeight = state.height || rect.height
      if (state.startedAt && !state.complete && (Math.round(oldWidth) !== Math.round(rect.width) || Math.round(oldHeight) !== Math.round(rect.height))) recordingRef.current.onSessionInvalid?.('configuration_changed')
      state.aimX = state.aimX ? state.aimX * rect.width / oldWidth : rect.width / 2
      state.aimY = state.aimY ? state.aimY * rect.height / oldHeight : rect.height / 2
      state.visualAimX = state.visualAimX ? state.visualAimX * rect.width / oldWidth : state.aimX
      state.visualAimY = state.visualAimY ? state.visualAimY * rect.height / oldHeight : state.aimY
      state.targetX = state.targetX ? state.targetX * rect.width / oldWidth : rect.width / 2
      state.targetY = state.targetY ? state.targetY * rect.height / oldHeight : rect.height / 2
      state.extraTargets = state.extraTargets.map((target) => ({ x: target.x * rect.width / oldWidth, y: target.y * rect.height / oldHeight }))
      state.targetTrail = state.targetTrail.map((point) => ({ ...point, x: point.x * rect.width / oldWidth, y: point.y * rect.height / oldHeight }))
      state.aimX = clampAimCoordinate(state.aimX, rect.width)
      state.aimY = clampAimCoordinate(state.aimY, rect.height)
      state.visualAimX = clampAimCoordinate(state.visualAimX, rect.width)
      state.visualAimY = clampAimCoordinate(state.visualAimY, rect.height)
      state.width = rect.width; state.height = rect.height
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas); resize()

    const render = (time: number) => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const state = stateRef.current
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const config = configRef.current
      const exercise = exerciseRef.current
      const radius = Math.max(16, Math.min(width, height) * 0.048 * config.targetScale * exerciseRadiusScale(exercise))
      if (!state.lastFrame) state.lastFrame = time
      const deltaMs = Math.min(50, Math.max(0, time - state.lastFrame))
      const deltaSeconds = deltaMs / 1000
      state.lastFrame = time

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1
      for (let x = 0; x < width; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
      for (let y = 0; y < height; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke() }

      if ((phaseRef.current === 'countdown' || phaseRef.current === 'playing') && pointerLockedRef.current) {
        const aimBlend = 1 - Math.exp(-70 * deltaSeconds)
        state.visualAimX += (state.aimX - state.visualAimX) * aimBlend
        state.visualAimY += (state.aimY - state.visualAimY) * aimBlend
      }

      if (exercise === 'micro_flick') {
        const micro = microRef.current
        if (micro) {
          if (phaseRef.current === 'playing' && pointerLockedRef.current && !state.complete) {
            if (!state.startedAt) { state.startedAt = time; recordStart(width, height) }
            const elapsed = time - state.startedAt, duration = durationSecondsRef.current * 1000
            const remaining = Math.max(0, (duration - elapsed) / 1000)
            if (remaining > 0) micro.update(elapsed, width, height, { x: state.aimX, y: state.aimY })
            if (time - state.lastMetricsAt >= 100 || remaining <= 0) {
              const summary = micro.summary(Math.min(duration, elapsed))
              const next = { ...createEmptyWarmupMetrics(durationSecondsRef.current), micro: summary, remaining,
                hits: summary.hits, shots: summary.shots, accuracy: summary.accuracy,
                reactionTimeMs: summary.meanAcquisitionTimeMs ?? 0, clickErrors: summary.misses, overshootCount: summary.overshootCount }
              state.lastMetricsAt = time; onMetricsRef.current(next)
              if (remaining <= 0) {
                state.complete = true; micro.stop()
                if (releasePointerLockOnCompleteRef.current) document.exitPointerLock?.()
                if (exitFullscreenOnCompleteRef.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
                onCompleteRef.current(next)
              }
            }
          }
          ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.min(width, height) * micro.rules.referenceRadius, 0, Math.PI * 2); ctx.stroke()
          if (micro.target && !state.complete) {
            ctx.fillStyle = '#ff7251'; ctx.beginPath(); ctx.arc(micro.target.x, micro.target.y, micro.target.radius, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.arc(micro.target.x, micro.target.y, micro.target.radius * .24, 0, Math.PI * 2); ctx.fill()
          }
          const feedback = time - state.startedAt < micro.feedbackUntil ? micro.feedback : null
          drawCrosshair(ctx, state.aimX, state.aimY, crosshairRef.current, feedback === 'hit' ? '#8dfbd3' : feedback === 'miss' ? '#ff7251' : '#f4f2eb')
        }
        frame = requestAnimationFrame(render)
        return
      }

      if (exercise === 'sniper-reaction') {
        const sniper = sniperRef.current
        const scale = Math.min(width, height)
        if (sniper) {
          if (phaseRef.current === 'playing' && pointerLockedRef.current && !state.complete) {
            if (!state.startedAt) { state.startedAt = time; recordStart(width, height) }
            const elapsed = time - state.startedAt
            const remaining = Math.max(0, durationSecondsRef.current - elapsed / 1000)
            if (remaining > 0) sniper.update(elapsed)
            if (time - state.lastMetricsAt >= 100 || remaining <= 0) {
              const summary = summarizeSniper(sniper.attempts)
              const next = { ...createEmptyWarmupMetrics(durationSecondsRef.current), hits: summary.hits, shots: summary.shots, accuracy: summary.accuracy, reactionTimeMs: summary.reactionTimeMs, remaining, score: summary.hits * 100, clickErrors: summary.misses, sniper: summary }
              state.lastMetricsAt = time
              onMetricsRef.current(next)
              if (remaining <= 0) {
                state.complete = true
                sniper.stop()
                if (releasePointerLockOnCompleteRef.current) document.exitPointerLock?.()
                if (exitFullscreenOnCompleteRef.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
                onCompleteRef.current(next)
              }
            }
          }
          const opening = sniper.config.opening * scale
          const left = (width - opening) / 2
          ctx.fillStyle = '#171d26'
          ctx.fillRect(width * .12, height * .15, left - width * .12, height * .7)
          ctx.fillRect(left + opening, height * .15, left - width * .12, height * .7)
          ctx.strokeStyle = '#ff7251'; ctx.lineWidth = 2
          ctx.strokeRect(left, height * .15, opening, height * .7)
          ctx.save(); ctx.beginPath(); ctx.rect(left, height * .15, opening, height * .7); ctx.clip()
          if (sniper.phase === 'peek') {
            ctx.fillStyle = '#ff7251'; ctx.beginPath(); ctx.arc(width / 2 + sniper.x * scale, height / 2 + sniper.y * scale, sniper.config.radius * scale, 0, Math.PI * 2); ctx.fill()
          }
          ctx.restore()
          if (sniper.phase === 'feedback') {
            const last = sniper.attempts[sniper.attempts.length - 1]
            ctx.fillStyle = last.outcome === 'hit' ? '#8dfbd3' : '#ff7251'
            ctx.textAlign = 'center'; ctx.font = '16px sans-serif'
            ctx.fillText(`${translateRef.current(`sniper.${last.outcome}`)}${last.reactionMs === null ? '' : ` · ${Math.round(last.reactionMs)} ms`}`, width / 2, height * .9)
          }
          drawCrosshair(ctx, state.aimX, state.aimY, crosshairRef.current, '#f4f2eb')
        }
        frame = requestAnimationFrame(render)
        return
      }

      if (phaseRef.current === 'playing' && pointerLockedRef.current) {
        if (!state.startedAt) {
          state.startedAt = time
          recordStart(width, height)
          state.targetVisibleAt = state.targetVisibleAt.map((visibleAt) => visibleAt || time)
        }
        if (exercise === 'tracking') {
          if (!state.destinationX || Math.hypot(state.destinationX - state.targetX, state.destinationY - state.targetY) < radius) {
            state.destinationX = randomBetween(radius * 1.6, width - radius * 1.6)
            state.destinationY = randomBetween(radius * 1.6, height - radius * 1.6)
          }
          const dx = state.destinationX - state.targetX
          const dy = state.destinationY - state.targetY
          const distance = Math.hypot(dx, dy) || 1
          const desiredX = dx / distance
          const desiredY = dy / distance
          const turnBlend = 1 - Math.exp(-6 * deltaSeconds)
          state.directionX += (desiredX - state.directionX) * turnBlend
          state.directionY += (desiredY - state.directionY) * turnBlend
          const directionLength = Math.hypot(state.directionX, state.directionY) || 1
          state.directionX /= directionLength; state.directionY /= directionLength
          const speed = Math.min(width, height) * config.targetSpeed
          state.targetX = clamp(state.targetX + state.directionX * speed * deltaSeconds, radius, width - radius)
          state.targetY = clamp(state.targetY + state.directionY * speed * deltaSeconds, radius, height - radius)
        }

        if (exercise === 'strafetrack') {
          if (!state.nextDirectionChangeAt) state.nextDirectionChangeAt = time + randomBetween(900, 1800)
          if (time >= state.nextDirectionChangeAt) {
            state.strafeDirection *= -1
            state.nextDirectionChangeAt = time + randomBetween(850, 1750)
          }
          const speed = Math.min(width, height) * config.targetSpeed * 1.05
          state.targetX += state.strafeDirection * speed * deltaSeconds
          if (state.targetX <= radius || state.targetX >= width - radius) {
            state.targetX = clamp(state.targetX, radius, width - radius)
            state.strafeDirection *= -1
            state.nextDirectionChangeAt = time + randomBetween(850, 1750)
          }
        }

        if (isTrackingExercise(exercise) && time - state.lastTrailSample >= 18) {
          state.targetTrail.push({ x: state.targetX, y: state.targetY, time })
          if (state.targetTrail.length > 20) state.targetTrail.shift()
          state.lastTrailSample = time
        }

        if (exercise === 'reflex' && !state.targetExpiresAt) state.targetExpiresAt = time + reflexWindow(config.targetScale)
        if (exercise === 'reflex' && time >= state.targetExpiresAt) {
          state.currentStreak = 0
          placeTarget(time)
        }

        const visible = time >= state.hiddenUntil
        const onTarget = visible && Math.hypot(state.visualAimX - state.targetX, state.visualAimY - state.targetY) <= radius
        if (onTarget) {
          state.onTargetMs += deltaMs
          state.currentOnTargetStreakMs += deltaMs
          state.bestOnTargetStreakMs = Math.max(state.bestOnTargetStreakMs, state.currentOnTargetStreakMs)
          if (!isClickExercise(exercise) && !state.targetAcquired && state.targetVisibleAt[0] > 0) {
            state.reactionMsTotal += Math.max(0, time - state.targetVisibleAt[0])
            state.reactionCount += 1
            state.targetAcquired = true
          }
          if (exercise === 'switch') {
            state.dwellMs += deltaMs
            if (state.dwellMs >= config.dwellMs) {
              state.hits += 1; state.shots += 1; state.score += 100; state.currentStreak += 1
              state.bestStreak = Math.max(state.bestStreak, state.currentStreak)
              placeTarget(time)
            }
          }
        } else {
          state.currentOnTargetStreakMs = 0
          if (exercise === 'switch') state.dwellMs = 0
        }

        if (time - state.lastAimSampleAt >= 50) {
          const telemetryTargets = [{ x: state.targetX, y: state.targetY }, ...(exercise === 'gridshot' ? state.extraTargets : [])]
          const nearestTarget = telemetryTargets.reduce((nearest, target) => (
            Math.hypot(state.visualAimX - target.x, state.visualAimY - target.y) < Math.hypot(state.visualAimX - nearest.x, state.visualAimY - nearest.y) ? target : nearest
          ), telemetryTargets[0])
          const offsetX = (state.visualAimX - nearestTarget.x) / Math.max(1, width)
          const offsetY = (state.visualAimY - nearestTarget.y) / Math.max(1, height)
          if (state.hasPreviousSampleAim && Math.hypot(state.visualAimX - state.previousSampleAimX, state.visualAimY - state.previousSampleAimY) > radius * .08) state.correctionCount += 1
          state.previousSampleAimX = state.visualAimX
          state.previousSampleAimY = state.visualAimY
          state.hasPreviousSampleAim = true
          const crossedTarget = state.hasPreviousAimOffset
            && state.previousAimOffsetX * offsetX + state.previousAimOffsetY * offsetY < 0
            && time - state.lastOvershootAt > 140
          if (crossedTarget && Math.hypot(offsetX * width, offsetY * height) > radius * 0.25) {
            state.overshootCount += 1
            state.lastOvershootAt = time
          }
          state.previousAimOffsetX = offsetX
          state.previousAimOffsetY = offsetY
          state.aimBiasXTotal += offsetX
          state.aimBiasYTotal += offsetY
          state.aimBiasSamples += 1
          state.hasPreviousAimOffset = true
          state.lastAimSampleAt = time
        }

        const elapsed = time - state.startedAt
        const remaining = Math.max(0, durationSecondsRef.current - elapsed / 1000)
        const trackingAccuracy = elapsed > 0 ? state.onTargetMs / elapsed * 100 : 0
        const trackingBasedAccuracy = exercise === 'switch' || isTrackingExercise(exercise)
        const metrics: WarmupMetrics = {
          score: isTrackingExercise(exercise) ? Math.round(state.onTargetMs / 10) : state.score,
          accuracy: trackingBasedAccuracy ? clamp(trackingAccuracy, 0, 100) : calculateWarmupAccuracy(state.hits, state.shots),
          hits: state.hits,
          shots: state.shots,
          remaining,
          onTargetMs: state.onTargetMs,
          reactionTimeMs: state.reactionCount ? state.reactionMsTotal / state.reactionCount : 0,
          clickErrors: state.clickErrors,
          bestStreak: state.bestStreak,
          bestTrackingStreakMs: state.bestOnTargetStreakMs,
          overshootCount: state.overshootCount,
          correctionCount: state.correctionCount,
          aimBiasX: state.aimBiasSamples ? state.aimBiasXTotal / state.aimBiasSamples : 0,
          aimBiasY: state.aimBiasSamples ? state.aimBiasYTotal / state.aimBiasSamples : 0,
        }
        if (time - state.lastMetricsAt >= 100) { state.lastMetricsAt = time; onMetricsRef.current(metrics) }
        if (remaining <= 0 && !state.complete) {
          state.complete = true
          if (releasePointerLockOnCompleteRef.current) document.exitPointerLock?.()
          if (exitFullscreenOnCompleteRef.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
          onCompleteRef.current(metrics)
        }
      }

      const visible = time >= state.hiddenUntil
      state.targetTrail = state.targetTrail.filter((point) => time - point.time <= 360)
      if (isTrackingExercise(exercise)) {
        for (const point of state.targetTrail) {
          const life = 1 - (time - point.time) / 360
          ctx.fillStyle = `rgba(255,114,81,${Math.max(0, life) * 0.2})`
          ctx.beginPath(); ctx.arc(point.x, point.y, radius * (0.22 + life * 0.42), 0, Math.PI * 2); ctx.fill()
        }
      }
      const drawTarget = (targetX: number, targetY: number) => {
        const glow = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, radius * 2)
        glow.addColorStop(0, 'rgba(255,114,81,.28)'); glow.addColorStop(1, 'rgba(255,114,81,0)')
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(targetX, targetY, radius * 2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ff7251'; ctx.beginPath(); ctx.arc(targetX, targetY, radius, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.beginPath(); ctx.arc(targetX, targetY, radius * .24, 0, Math.PI * 2); ctx.fill()
        if (exercise === 'switch' && state.dwellMs > 0) {
          ctx.strokeStyle = '#8dfbd3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(targetX, targetY, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, state.dwellMs / config.dwellMs)); ctx.stroke()
        }
        if (exercise === 'reflex') {
          const progress = clamp((state.targetExpiresAt - time) / reflexWindow(config.targetScale), 0, 1)
          ctx.strokeStyle = progress > .35 ? '#8dfbd3' : '#ff7251'; ctx.lineWidth = 3
          ctx.beginPath(); ctx.arc(targetX, targetY, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke()
        }
      }
      if (state.targetX && visible) {
        drawTarget(state.targetX, state.targetY)
        if (exercise === 'gridshot') state.extraTargets.forEach((target) => drawTarget(target.x, target.y))
      }
      if (phaseRef.current === 'countdown' || phaseRef.current === 'playing') {
        const targets = [{ x: state.targetX, y: state.targetY }, ...(exercise === 'gridshot' ? state.extraTargets : [])]
        const onTarget = visible && targets.some((target) => Math.hypot(state.visualAimX - target.x, state.visualAimY - target.y) <= radius)
        drawCrosshair(ctx, state.visualAimX, state.visualAimY, crosshairRef.current, onTarget ? '#8dfbd3' : '#f4f2eb')
      }
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); sniperRef.current?.stop(); microRef.current?.stop() }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const state = stateRef.current
    const width = canvas?.clientWidth ?? state.width
    const height = canvas?.clientHeight ?? state.height
    Object.assign(state, {
      aimX: width / 2, aimY: height / 2, visualAimX: width / 2, visualAimY: height / 2,
      targetX: width / 2, targetY: height / 2, destinationX: 0, destinationY: 0,
      directionX: 1, directionY: 0, lastFrame: 0, startedAt: 0, lastMetricsAt: 0,
      onTargetMs: 0, currentOnTargetStreakMs: 0, bestOnTargetStreakMs: 0,
      dwellMs: 0, hiddenUntil: 0, targetExpiresAt: 0, extraTargets: [], targetVisibleAt: [0, 0, 0], targetAcquired: false,
      strafeDirection: Math.random() > .5 ? 1 : -1, nextDirectionChangeAt: 0, targetTrail: [], lastTrailSample: 0,
      reactionMsTotal: 0, reactionCount: 0, clickErrors: 0, currentStreak: 0, bestStreak: 0,
      lastAimSampleAt: 0,
      previousAimOffsetX: 0, previousAimOffsetY: 0, hasPreviousAimOffset: false,
      previousSampleAimX: 0, previousSampleAimY: 0, hasPreviousSampleAim: false, correctionCount: 0,
      overshootCount: 0, lastOvershootAt: 0, aimBiasXTotal: 0, aimBiasYTotal: 0, aimBiasSamples: 0,
      hits: 0, shots: 0, score: 0, complete: false,
    })
    inputPausedAtRef.current = 0
    sniperRef.current = exerciseRef.current === 'sniper-reaction' ? new SniperReaction(difficulty === 'adaptive' ? 'medium' : difficulty) : null
    microRef.current = exerciseRef.current === 'micro_flick' ? new MicroFlick(difficulty === 'adaptive' ? 'medium' : difficulty) : null
    if (!microRef.current) placeTarget()
    if (exerciseRef.current === 'gridshot') { placeTarget(0, 1); placeTarget(0, 2) }
  }, [sessionId, difficulty])

  const active = phase === 'countdown' || phase === 'playing'
  return (
    <div className="warmup-arena-wrap">
      <canvas ref={canvasRef} className="warmup-arena" tabIndex={0} onMouseDown={() => active && void requestStablePointerLock(canvasRef.current)} />
      {active && (
        <div className="warmup-hud">
          <div><span>{t(exercise === 'micro_flick' ? 'micro.hits' : 'common.score')}</span><strong>{exercise === 'micro_flick' ? metrics.hits : metrics.score}</strong></div>
          <div><span>{t('common.accuracy')}</span><strong>{format(metrics.accuracy)}<small>%</small></strong></div>
          <div><span>{t('common.time')}</span><strong>{format(metrics.remaining, 1)}<small>s</small></strong></div>
          <div><span>{t('common.sensitivity')}</span><strong>{sensitivityLabel}</strong></div>
        </div>
      )}
      {phase === 'countdown' && <div className="warmup-countdown"><strong>{countdown}</strong><span>{t('warmup.prepareAim')}</span></div>}
      {phase === 'playing' && <div className="warmup-instruction">{instruction}</div>}
      {progressLabel && active && <div className="warmup-progress-badge">{progressLabel}</div>}
      {active && !pointerLocked && <button className="lock-prompt" onClick={() => void requestStablePointerLock(canvasRef.current)}>{t('arena.lockCursor')}</button>}
      {completionOverlay}
    </div>
  )
})

export function Warmup({
  initialExercise = null,
  onExerciseChange,
}: {
  initialExercise?: WarmupExercise | null
  onExerciseChange?: (exercise: WarmupExercise | null) => void
}) {
  const { t, locale } = useI18n()
  const arenaRef = useRef<ArenaHandle>(null)
  const [phase, setPhase] = useState<WarmupPhase>(initialExercise ? 'setup' : 'hub')
  const recorder = useSessionRecorder()
  const sessions = getSessionRepository()
  const setupRef = useRef<HTMLElement>(null)
  useDialogFocus(setupRef, phase === 'setup')
  const [setupStep, setSetupStep] = useState<SetupStep>(1)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1)
  const [inputReady, setInputReady] = useState(false)
  const [exercise, setExercise] = useState<WarmupExercise>(initialExercise ?? 'switch')
  const [difficulty, setDifficulty] = useState<WarmupDifficulty>('easy')
  const [adaptiveLevel, setAdaptiveLevel] = useState<FixedWarmupDifficulty>('medium')
  const config = useSensitivityPreset('cs2', null, true)
  const selectedGame = config.draft.gameId as GameId
  const { sensitivity, dpi } = config.draft
  const { setSensitivity, setDpi } = config
  const sessionContext = useRef<SessionContext | undefined>(undefined)
  const [crosshair, setCrosshair] = useState<CrosshairStyle>('classic')
  const [countdown, setCountdown] = useState(3)
  const [sessionId, setSessionId] = useState(0)
  const [previewExercise, setPreviewExercise] = useState<WarmupExercise | null>(null)
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all')
  const visibleExercises = EXERCISES.filter(item => category === 'all' || item.category === category)
  const [sniperFocused, setSniperFocused] = useState(false)
  const activePreview = sniperFocused ? 'sniper-reaction' : previewExercise
  const [metrics, setMetrics] = useState<WarmupMetrics>(() => createEmptyWarmupMetrics(WARMUP_DURATION))
  const [previousSession, setPreviousSession] = useState<WarmupSessionSummary | null>(null)
  const { result: personalBest, unavailable: pbUnavailable, reset: resetPersonalBest, evaluate: evaluateSavedPB } = usePersonalBestFeedback()

  const game = GAME_BY_ID[selectedGame]
  const parsedSensitivity = parsePositiveNumberInput(sensitivity)
  const parsedDpi = parsePositiveNumberInput(dpi)
  const validSetup = parsedSensitivity !== null && parsedDpi !== null
  const normalizedSensitivity = parsedSensitivity === null ? null : normalizeSensitivity(parsedSensitivity, game)
  const effectiveDifficulty: FixedWarmupDifficulty = difficulty === 'adaptive' ? adaptiveLevel : difficulty
  const pointerGain = getWarmupPointerGain(game, normalizedSensitivity ?? game.sensitivityMin)
  const exerciseConfig = EXERCISES.find((item) => item.id === exercise) ?? EXERCISES[0]
  const difficultyLabel = difficulty === 'adaptive'
    ? `${t('difficulty.adaptive')} · ${t(`difficulty.${adaptiveLevel}` as TranslationKey)}`
    : t(`difficulty.${difficulty}` as TranslationKey)

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

  const openSetup = (nextExercise: WarmupExercise) => {
    if (!supportsExerciseDifficulty(nextExercise, difficulty)) setDifficulty('medium')
    setPreviewExercise(null)
    setSniperFocused(false)
    setExercise(nextExercise)
    onExerciseChange?.(nextExercise)
    setSetupStep(1)
    setStepDirection(1)
    setPhase('setup')
  }

  const start = () => {
    if (!validSetup || normalizedSensitivity === null || parsedDpi === null) return
    sessionContext.current = createSessionContext(selectedGame, normalizedSensitivity, Math.round(parsedDpi), config.draft.presetId)
    sessionContext.current.configuration = { difficulty: effectiveDifficulty, durationSeconds: WARMUP_DURATION }
    resetPersonalBest()
    setSensitivity(String(normalizedSensitivity))
    setDpi(String(Math.round(parsedDpi)))
    setInputReady(false)
    setMetrics(createEmptyWarmupMetrics(WARMUP_DURATION))
    flushSync(() => {
      setSessionId((value) => value + 1)
      setPhase('countdown')
    })
    arenaRef.current?.requestPointerLock()
  }

  const repeat = () => {
    resetPersonalBest()
    setInputReady(false)
    setMetrics(createEmptyWarmupMetrics(WARMUP_DURATION))
    flushSync(() => {
      setSessionId((value) => value + 1)
      setPhase('countdown')
    })
    arenaRef.current?.requestPointerLock()
  }

  const playNextRound = () => {
    resetPersonalBest()
    setInputReady(false)
    setMetrics(createEmptyWarmupMetrics(WARMUP_DURATION))
    flushSync(() => {
      setSessionId((value) => value + 1)
      setPhase('countdown')
    })
    arenaRef.current?.requestPointerLock()
  }

  const completeWarmup = (result: WarmupMetrics) => {
    const saved = recorder.complete(result)
    const withContext = { ...result, sessionContext: sessionContext.current, ...(saved ? sessionSummary(saved) : { sessionStatus: 'invalid' as const }) }
    const history = sessions.history(exercise)
    if (saved) evaluateSavedPB(saved)
    setPreviousSession(history[0] ?? null)
    setMetrics(withContext)
    setPhase('result')
  }

  const exitToHub = () => {
    recorder.abort('manual_abort')
    document.exitPointerLock?.()
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    setInputReady(false)
    setCountdown(3)
    onExerciseChange?.(null)
    setPhase('hub')
  }

  if (phase === 'hub' || phase === 'setup' || phase === 'result') {
    return (
      <section className="warmup-workspace">
        <div className="warmup-heading">
          <h1>{t('warmup.title')}</h1>
          <p>{t('warmup.subtitle')}</p>
        </div>
        <div className="warmup-category-filters" role="group" aria-label={t('warmup.categories')}>
          {(['all', ...Object.keys(EXERCISE_CATEGORIES)] as Array<ExerciseCategory | 'all'>).map(value => (
            <button key={value} type="button" aria-pressed={category === value} onClick={() => {
              setCategory(value)
              setPreviewExercise(null)
              setSniperFocused(false)
            }}>
              {t(value === 'all' ? 'warmup.category.all' : EXERCISE_CATEGORIES[value])}
              <span>{value === 'all' ? EXERCISES.length : EXERCISES.filter(item => item.category === value).length}</span>
            </button>
          ))}
        </div>
        <div className="warmup-exercises">
          {visibleExercises.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={activePreview === item.id ? 'preview-active' : ''}
                onPointerEnter={() => setPreviewExercise(item.id)}
                onPointerLeave={(event) => {
                  if (item.id === 'sniper-reaction' && document.activeElement === event.currentTarget) return
                  setPreviewExercise((current) => current === item.id ? null : current)
                }}
                onFocus={() => { if (item.id === 'sniper-reaction') setSniperFocused(true); setPreviewExercise(item.id) }}
                onBlur={() => { if (item.id === 'sniper-reaction') setSniperFocused(false); setPreviewExercise((current) => current === item.id ? null : current) }}
                onClick={() => openSetup(item.id)}
              >
                <Icon size={26} />
                {activePreview === item.id && <ExercisePreview exercise={item.id} name={item.name} />}
                <strong>{item.name}</strong>
                <small>{t(item.description)}</small>
                <i>{t('warmup.configure')} <Play size={13} /></i>
              </button>
            )
          })}
        </div>

        {phase === 'setup' && (
          <div className="modal-backdrop">
            <section ref={setupRef} className="modal setup-modal warmup-setup-modal" role="dialog" aria-modal="true" aria-label={t('warmup.configureExercise', { exercise: exerciseConfig.name })} onKeyDown={event => { if (event.key === 'Escape') exitToHub() }}>
              <button className="modal-close" onClick={exitToHub} aria-label={t('common.close')}><X size={18} /></button>
              <Settings2 size={20} className="modal-icon" />
              <h2>{t('warmup.configureExercise', { exercise: exerciseConfig.name })}</h2>
              <p>{t(exerciseConfig.description)}</p>

              <WizardStepper current={setupStep} steps={[t('warmup.stepGame'), t('warmup.stepSettings'), t('warmup.stepCrosshair')]} />

              <div className="warmup-step-content">
                <WizardStepPanel key={setupStep} step={setupStep} direction={stepDirection}>
                {setupStep === 1 && <>
                  <h3>{t('warmup.chooseGame')}</h3>
                  <GamePicker gameIds={GAMES.map(item => item.id)} value={selectedGame} onChange={config.selectGame} presets={config.presets} />
                </>}

                {setupStep === 2 && <>
                  <SensitivityConfigFields draft={config.draft} presets={config.presets} onSelectPreset={config.selectPreset} onSensitivityChange={setSensitivity} onDpiChange={setDpi} sensitivityInvalid={parsedSensitivity === null} dpiInvalid={parsedDpi === null}>
                    <div className="warmup-config-label">{t('warmup.difficulty')}</div>
                    <div className="warmup-difficulty" role="radiogroup" aria-label={t('warmup.difficulty')}>
                      {(Object.keys(WARMUP_DIFFICULTIES) as WarmupDifficulty[]).filter(level => supportsExerciseDifficulty(exercise, level)).map((level) => (
                        <button type="button" key={level} className={difficulty === level ? 'selected' : ''} aria-pressed={difficulty === level} onClick={() => { setDifficulty(level); if (level === 'adaptive') setAdaptiveLevel('medium') }}>
                          <i aria-hidden="true" /> <strong>{t(`difficulty.${level}` as TranslationKey)}</strong><small>{t(`difficulty.${level}Description` as TranslationKey)}</small>
                        </button>
                      ))}
                    </div>
                  </SensitivityConfigFields>
                </>}

                {setupStep === 3 && <>
                  <h3>{t('warmup.crosshairTitle')}</h3>
                  <div className="warmup-crosshairs" role="radiogroup" aria-label={t('calibration.crosshairType')}>
                    {CROSSHAIRS.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={crosshair === item.id ? 'selected' : ''} onClick={() => setCrosshair(item.id)}><Icon size={16} /><span>{t(item.label)}</span></button> })}
                  </div>
                </>}
                </WizardStepPanel>
              </div>

              <div className="warmup-wizard-actions">
                {setupStep > 1 && <button className="secondary-button" onClick={() => { setStepDirection(-1); setSetupStep((setupStep - 1) as SetupStep) }}><ArrowLeft size={15} /> {t('warmup.back')}</button>}
                {setupStep < 3
                  ? <button className="primary-button" onClick={() => { setStepDirection(1); setSetupStep((setupStep + 1) as SetupStep) }} disabled={setupStep === 2 && !validSetup}>{t('warmup.next')} <ArrowRight size={15} /></button>
                  : <button className="primary-button" onClick={start} disabled={!validSetup}><Play size={15} /> {t('warmup.start')}</button>}
              </div>
            </section>
          </div>
        )}

        {phase === 'result' && (
          <div className="modal-backdrop">
            <section className="modal warmup-result-modal">
              <Sparkles size={22} className="modal-icon" />
              <div className="panel-label">{t('warmup.reportTitle')}</div>
              <h2>{exerciseConfig.name}</h2>
              <p>{difficultyLabel} · {exercise === 'sniper-reaction' ? '' : `${game.label} · `}{WARMUP_DURATION}s</p>
              <div className="warmup-result-score"><span>{t(metrics.micro ? 'micro.acquisition' : 'common.score')}</span><strong>{metrics.micro ? metrics.micro.meanAcquisitionTimeMs === null ? '—' : `${format(metrics.micro.meanAcquisitionTimeMs)} ms` : metrics.score}</strong></div>
              {personalBest && <PersonalBestFeedback result={personalBest} exercise={exercise} gameLabel={game.label} />}
              {pbUnavailable && <p role="status">{PERSONAL_BEST_COPY[locale].unavailable}</p>}
              <WarmupReport metrics={metrics} previous={previousSession} exercise={exercise} onSelectRecommendation={openSetup} />
              <div className="warmup-next-hint">
                {t('warmup.fixedNextHint', { level: difficultyLabel })}
              </div>
              <div className="warmup-result-actions">
                <button className="secondary-button" onClick={exitToHub}><LogOut size={15} /> {t('warmup.exit')}</button>
                <button className="secondary-button" onClick={repeat}><RotateCcw size={15} /> {t('warmup.repeat')}</button>
                <button className="primary-button" onClick={playNextRound}>{t('warmup.nextRound')} <ArrowRight size={15} /></button>
              </div>
            </section>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="warmup-game-workspace">
      <WarmupArena
        ref={arenaRef}
        phase={phase}
        countdown={countdown}
        exercise={exercise}
        difficulty={effectiveDifficulty}
        crosshair={crosshair}
        pointerGain={pointerGain}
        sessionId={sessionId}
        sensitivityLabel={`${exercise === 'sniper-reaction' ? '' : `${game.shortLabel} `}${format(normalizedSensitivity ?? 0, 3)}`}
        instruction={t(exerciseConfig.instruction)}
        metrics={metrics}
        onMetrics={next => { recorder.sample(next); setMetrics(next) }}
        recordingDifficulty={difficulty}
        onSessionStart={snapshot => {
          const state = sessions.getSnapshot()
          if (state.status !== 'auth-loading' && sessionContext.current) recorder.start(state.userId, exercise, sessionContext.current, snapshot)
        }}
        onSessionInvalid={reason => recorder.invalidate(reason)}
        onComplete={completeWarmup}
        onPointerLockChange={setInputReady}
      />
      <aside className="warmup-side-panel">
        <span>{exerciseConfig.name}</span>
        <strong>{format(metrics.remaining, 1)}<small>s</small></strong>
        <div><span>{t('common.score')}</span><b>{metrics.score}</b></div>
        <div><span>{t('common.accuracy')}</span><b>{format(metrics.accuracy)}%</b></div>
        <div><span>{t('warmup.level')}</span><b>{difficultyLabel}</b></div>
        <p><MousePointer2 size={14} /> {t(exerciseConfig.instruction)}</p>
      </aside>
    </section>
  )
}
