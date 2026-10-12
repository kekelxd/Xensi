import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { drawCrosshair } from './crosshair'
import { useI18n } from './i18n'
import { requestStablePointerLock, sanitizePointerMovement } from './pointerInput'
import { nextScopeLevel, scopeSensitivityRatio, SNIPER_SCOPES, SniperReaction, summarizeSniper, type ScopeLevel } from './sniperReaction'
import { SniperAudio } from './sniperAudio'
import { SniperViewport } from './sniperScene'
import { exerciseConfig } from './trainingSession'
import { createEmptyWarmupMetrics } from './warmupTelemetry'
import { WARMUP_DURATION } from './warmupConfig'
import type { ArenaHandle, ArenaProps } from './Warmup'
import './sniperReaction.css'

const format = (value: number, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '0'
const MAX_PITCH = 85 * Math.PI / 180

// First-person AWP at a Dust 2 style double door: right click scopes (1x/2x/4x), left click fires one bolt-action shot.
export const SniperArena = forwardRef<ArenaHandle, ArenaProps>(function SniperArena({ phase, countdown, difficulty, durationSeconds = WARMUP_DURATION, crosshair, pointerGain, degreesPerCount, sessionId, sensitivityLabel, instruction, metrics, progressLabel, completionOverlay, exitFullscreenOnComplete = true, releasePointerLockOnComplete = true, onMetrics, onComplete, onPointerLockChange, recordingDifficulty, onSessionStart, onSessionInvalid }, ref) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<SniperViewport | null>(null)
  const engineRef = useRef<SniperReaction | null>(null)
  const audioRef = useRef<SniperAudio | null>(null)
  const [pointerLocked, setPointerLocked] = useState(false)
  const [renderFailed, setRenderFailed] = useState(false)
  const translateRef = useRef(t)
  const pointerLockedAtRef = useRef(0)
  const pointerLockedRef = useRef(false)
  const inputPausedAtRef = useRef(0)
  const phaseRef = useRef(phase)
  const gainRef = useRef(degreesPerCount ?? pointerGain * .022)
  const durationSecondsRef = useRef(durationSeconds)
  const crosshairRef = useRef(crosshair)
  const exitFullscreenOnCompleteRef = useRef(exitFullscreenOnComplete)
  const releasePointerLockOnCompleteRef = useRef(releasePointerLockOnComplete)
  const onMetricsRef = useRef(onMetrics)
  const onCompleteRef = useRef(onComplete)
  const recordingRef = useRef({ difficulty, recordingDifficulty, onSessionStart, onSessionInvalid })
  const stateRef = useRef({ yaw: 0, pitch: 0, scope: 0 as ScopeLevel, appliedScope: -1, startedAt: 0, lastMetricsAt: 0, elapsed: 0, complete: false, lastShotScoped: true })
  useEffect(() => { translateRef.current = t }, [t])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { gainRef.current = degreesPerCount ?? pointerGain * .022 }, [degreesPerCount, pointerGain])
  useEffect(() => { durationSecondsRef.current = durationSeconds }, [durationSeconds])
  useEffect(() => { crosshairRef.current = crosshair }, [crosshair])
  useEffect(() => { exitFullscreenOnCompleteRef.current = exitFullscreenOnComplete }, [exitFullscreenOnComplete])
  useEffect(() => { releasePointerLockOnCompleteRef.current = releasePointerLockOnComplete }, [releasePointerLockOnComplete])
  useEffect(() => { onMetricsRef.current = onMetrics }, [onMetrics])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => { recordingRef.current = { difficulty, recordingDifficulty, onSessionStart, onSessionInvalid } }, [difficulty, recordingDifficulty, onSessionStart, onSessionInvalid])
  useImperativeHandle(ref, () => ({ requestPointerLock: () => { void requestStablePointerLock(canvasRef.current) } }), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const updateLock = () => {
      const locked = document.pointerLockElement === canvas
      if (locked) {
        const now = performance.now(), state = stateRef.current
        if (inputPausedAtRef.current && state.startedAt) state.startedAt += now - inputPausedAtRef.current
        inputPausedAtRef.current = 0
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
      // Degrees per count follow the selected game; zooming scales it like zoom_sensitivity_ratio 1.
      const movement = sanitizePointerMovement({
        movementX: event.movementX, movementY: event.movementY,
        gain: gainRef.current * scopeSensitivityRatio(state.scope) * Math.PI / 180,
        width: canvas.clientWidth, height: canvas.clientHeight,
        elapsedSinceLock: performance.now() - pointerLockedAtRef.current,
      })
      if (!movement) return
      state.yaw = (state.yaw + movement.x) % (Math.PI * 2)
      state.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitch - movement.y))
    }
    const handleButton = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      const state = stateRef.current, engine = engineRef.current, active = phaseRef.current
      if (active !== 'countdown' && active !== 'playing') return
      if (event.button === 2) {
        event.preventDefault()
        // The bolt is being cycled: the scope cannot be raised until the rifle is ready again.
        if (engine && (engine.phase === 'feedback' || engine.phase === 'complete')) return
        state.scope = nextScopeLevel(state.scope)
        return
      }
      if (event.button !== 0 || active !== 'playing' || !engine) return
      if (!state.startedAt || state.complete || performance.now() - state.startedAt >= durationSecondsRef.current * 1000) return
      if (engine.phase !== 'waiting' && engine.phase !== 'peek') return
      const now = performance.now()
      state.lastShotScoped = state.scope > 0
      engine.shoot(now - state.startedAt, { yaw: state.yaw, pitch: state.pitch }, state.scope > 0)
      state.scope = 0
      viewportRef.current?.kick(now)
      ;(audioRef.current ??= new SniperAudio()).shot()
    }
    const suppressMenu = (event: Event) => { if (document.pointerLockElement === canvas) event.preventDefault() }
    document.addEventListener('pointerlockchange', updateLock)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mousedown', handleButton)
    document.addEventListener('contextmenu', suppressMenu)
    updateLock()
    return () => {
      audioRef.current?.dispose(); audioRef.current = null
      document.removeEventListener('pointerlockchange', updateLock)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mousedown', handleButton)
      document.removeEventListener('contextmenu', suppressMenu)
    }
  }, [onPointerLockChange])

  useEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current
    if (!canvas || !overlay) return
    let viewport: SniperViewport
    try { viewport = new SniperViewport(canvas) } catch { setRenderFailed(true); return }
    viewportRef.current = viewport
    const engine = engineRef.current
    if (engine) viewport.configure(engine.config)
    let frame = 0, width = 0, height = 0
    const resize = () => {
      const ratio = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect()
      overlay.width = rect.width * ratio; overlay.height = rect.height * ratio
      overlay.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (stateRef.current.startedAt && !stateRef.current.complete && width && (Math.round(width) !== Math.round(rect.width) || Math.round(height) !== Math.round(rect.height))) recordingRef.current.onSessionInvalid?.('configuration_changed')
      width = rect.width; height = rect.height
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas); resize()

    const render = (time: number) => {
      const ctx = overlay.getContext('2d'), state = stateRef.current, sniper = engineRef.current
      if (!ctx || !sniper) { frame = requestAnimationFrame(render); return }
      const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight
      if (phaseRef.current === 'playing' && pointerLockedRef.current && !state.complete) {
        if (!state.startedAt) {
          state.startedAt = time
          const recording = recordingRef.current
          recording.onSessionStart?.(exerciseConfig('sniper-reaction', recording.recordingDifficulty ?? recording.difficulty,
            recording.difficulty === 'adaptive' ? 'medium' : recording.difficulty, durationSecondsRef.current, cssWidth, cssHeight, crosshairRef.current))
        }
        const elapsed = time - state.startedAt
        state.elapsed = elapsed
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
      // The rifle is lowered while the bolt cycles and when the session is over.
      if (sniper.phase === 'feedback' || sniper.phase === 'complete') state.scope = 0
      if (state.appliedScope !== state.scope) { viewport.setScope(state.scope); state.appliedScope = state.scope }
      viewport.setAim(state.yaw, state.pitch)
      viewport.setRunner(sniper.renderState(state.elapsed), sniper.direction, time)
      viewport.render(time)

      ctx.clearRect(0, 0, cssWidth, cssHeight)
      const cx = cssWidth / 2, cy = cssHeight / 2, active = phaseRef.current === 'countdown' || phaseRef.current === 'playing'
      if (active) {
        if (state.scope > 0) drawScope(ctx, cssWidth, cssHeight, state.scope)
        else drawCrosshair(ctx, cx, cy, crosshairRef.current, '#f4f2eb')
        if (sniper.phase === 'feedback') drawFeedback(ctx, cssWidth, cssHeight, sniper, state, translateRef.current)
      }
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); engineRef.current?.stop(); viewport.dispose(); viewportRef.current = null }
  }, [])

  useEffect(() => {
    Object.assign(stateRef.current, { yaw: 0, pitch: 0, scope: 0, appliedScope: -1, startedAt: 0, lastMetricsAt: 0, elapsed: 0, complete: false, lastShotScoped: true })
    inputPausedAtRef.current = 0
    engineRef.current = new SniperReaction(difficulty === 'adaptive' ? 'medium' : difficulty)
    viewportRef.current?.configure(engineRef.current.config)
  }, [sessionId, difficulty])

  const active = phase === 'countdown' || phase === 'playing'
  return (
    <div className="warmup-arena-wrap sniper-arena-wrap">
      <canvas ref={canvasRef} className="warmup-arena" tabIndex={0} onContextMenu={event => event.preventDefault()} onMouseDown={() => active && void requestStablePointerLock(canvasRef.current)} />
      <canvas ref={overlayRef} className="sniper-overlay" aria-hidden="true" />
      {renderFailed && <p className="sniper-render-error" role="alert">{t('sniper.webglError')}</p>}
      {active && (
        <div className="warmup-hud">
          <div><span>{t('common.score')}</span><strong>{metrics.score}</strong></div>
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

// Black scope mask with a duplex reticle, drawn over the 3D view.
function drawScope(ctx: CanvasRenderingContext2D, width: number, height: number, level: ScopeLevel) {
  const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * .46
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.arc(cx, cy, radius, 0, Math.PI * 2, true); ctx.fill('evenodd')
  const vignette = ctx.createRadialGradient(cx, cy, radius * .8, cx, cy, radius)
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.55)')
  ctx.fillStyle = vignette; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,.92)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke()
  ctx.lineWidth = 4
  const inner = radius * .16
  ctx.beginPath()
  ctx.moveTo(cx - radius, cy); ctx.lineTo(cx - inner * 2.2, cy); ctx.moveTo(cx + inner * 2.2, cy); ctx.lineTo(cx + radius, cy)
  ctx.moveTo(cx, cy + inner * 2.2); ctx.lineTo(cx, cy + radius)
  ctx.stroke()
  ctx.fillStyle = '#8dfbd3'; ctx.font = '500 12px ui-monospace, monospace'; ctx.textAlign = 'center'
  ctx.fillText(SNIPER_SCOPES[level].label, cx, Math.max(16, cy - radius - 8))
  ctx.restore()
}

function drawFeedback(ctx: CanvasRenderingContext2D, width: number, height: number, sniper: SniperReaction, state: { lastShotScoped: boolean }, translate: ReturnType<typeof useI18n>['t']) {
  const last = sniper.attempts[sniper.attempts.length - 1]
  if (!last) return
  const hit = last.outcome === 'hit'
  ctx.save()
  ctx.textAlign = 'center'; ctx.font = '500 16px sans-serif'
  ctx.fillStyle = hit ? '#8dfbd3' : '#ff7251'
  const label = hit && last.zone === 'head' ? translate('sniper.headshot') : translate(`sniper.${last.outcome}`)
  const detail = last.reactionMs === null ? '' : ` · ${Math.round(last.reactionMs)} ms`
  const note = last.outcome === 'miss' && !state.lastShotScoped ? ` · ${translate('sniper.unscoped')}` : ''
  ctx.fillText(`${label}${detail}${note}`, width / 2, height * .9)
  if (hit) {
    ctx.strokeStyle = '#8dfbd3'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(width / 2 - 10, height / 2 - 10); ctx.lineTo(width / 2 - 4, height / 2 - 4); ctx.moveTo(width / 2 + 10, height / 2 - 10); ctx.lineTo(width / 2 + 4, height / 2 - 4)
    ctx.moveTo(width / 2 - 10, height / 2 + 10); ctx.lineTo(width / 2 - 4, height / 2 + 4); ctx.moveTo(width / 2 + 10, height / 2 + 10); ctx.lineTo(width / 2 + 4, height / 2 + 4); ctx.stroke()
  }
  ctx.restore()
}
