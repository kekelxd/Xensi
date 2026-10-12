import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Crosshair, Headphones, Play, RotateCcw } from 'lucide-react'
import { FirstPersonViewport } from './firstPersonViewport'
import { SpatialAudio } from './spatialAudio'
import { SpatialHuntController, SPATIAL_HUNT_RULES, type SpatialMetrics, type SpatialView } from './spatialHunt'
import { useI18n, type TranslationKey } from './i18n'
import { useSensitivityPreset } from './useSensitivityPreset'
import { SensitivityConfigFields } from './SensitivityConfigFields'
import { GAME_BY_ID, GAMES, type GameId } from './games'
import { normalizeSensitivity, parsePositiveNumberInput } from './sensitivity'
import { createSessionContext } from './playerProfileStore'
import { requestStablePointerLock } from './pointerInput'
import { useSessionRecorder } from './useSessionRecorder'
import { getSessionRepository, useSessionState } from './sessionRepository'
import { exerciseConfig, type SessionReason } from './trainingSession'
import { createEmptyWarmupMetrics } from './warmupTelemetry'
import { PersonalBestPanel } from './PersonalBestPanel'
import { usePersonalBestFeedback } from './usePersonalBestFeedback'
import { PERSONAL_BEST_COPY } from './personalBestCopy'
import { readAuthSessionState } from './authService'
import { formatAnalysisValue, getAnalysisMetrics } from './analysisMetrics'
import './spatialHunt.css'
import { GameSelect } from './GameSelect'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const SPATIAL_GAMES = GAMES.map(item => ({ id: item.id, name: item.label }))

const idle: SpatialView = { phase: 'idle', round: 1, countdown: 3, result: null }
export default function SpatialHuntPage({ onExit }: { onExit: () => void }) {
  const { t, locale } = useI18n(), config = useSensitivityPreset('cs2', null, true)
  const recorder = useSessionRecorder(), sessionState = useSessionState(), feedback = usePersonalBestFeedback()
  const canvas = useRef<HTMLCanvasElement>(null), blackout = useRef<HTMLDivElement>(null)
  const viewport = useRef<FirstPersonViewport | null>(null), audio = useRef<SpatialAudio | null>(null), controller = useRef<SpatialHuntController | null>(null)
  const [view, setView] = useState<SpatialView>(idle), [ready, setReady] = useState(false)
  const [error, setError] = useState<TranslationKey | null>(null), [metrics, setMetrics] = useState<SpatialMetrics | null>(null)
  const alive = useRef(false), epoch = useRef(0), starting = useRef(false), frame = useRef(0), lockedAt = useRef(0)
  const snapshot = useRef({ game: GAME_BY_ID.cs2, sensitivity: 1 })
  const callbacks = useRef({ evaluate: feedback.evaluate })
  useEffect(() => { callbacks.current = { evaluate: feedback.evaluate } })
  const active = !['idle', 'completed', 'interrupted', 'preparing'].includes(view.phase)
  const sensitivity = parsePositiveNumberInput(config.draft.sensitivity), dpi = parsePositiveNumberInput(config.draft.dpi)
  const game = GAME_BY_ID[config.draft.gameId as GameId]
  const valid = sensitivity !== null && dpi !== null && dpi >= 1 && !!game?.yaw && sessionState.status === 'ready'
  const wrap = (spatial: SpatialMetrics) => ({ ...createEmptyWarmupMetrics(0), spatial })

  useEffect(() => {
    alive.current = true
    const element = canvas.current!
    let owner = readAuthSessionState().userId
    let scene: FirstPersonViewport | null = null
    const interrupt = (reason: SessionReason) => {
      if (starting.current) { epoch.current++; starting.current = false }
      const current = controller.current
      if (current && !['completed', 'interrupted', 'idle'].includes(current.phase)) {
        current.interrupt(performance.now()); recorder.abort(reason)
        cancelAnimationFrame(frame.current); void audio.current?.suspend()
        if (document.pointerLockElement === element) document.exitPointerLock()
      } else if (alive.current && !current) setView(idle)
    }
    if (!window.AudioContext || !window.PannerNode || !element.requestPointerLock || !window.WebGL2RenderingContext || !matchMedia('(pointer: fine)').matches) setError('spatial.unsupported')
    else {
      try { scene = new FirstPersonViewport(element); viewport.current = scene; scene.render(); setReady(true) }
      catch { setError('spatial.unsupported') }
    }
    const movement = (event: MouseEvent) => {
      if (document.pointerLockElement !== element || !controller.current || ['completed', 'interrupted'].includes(controller.current.phase)) return
      scene?.move(event, snapshot.current.game, snapshot.current.sensitivity, performance.now() - lockedAt.current)
      const orientation = scene?.orientation()
      if (orientation) audio.current?.updateListener(orientation.forward, orientation.up)
    }
    const click = (event: MouseEvent) => { if (event.button === 0 && document.pointerLockElement === element) controller.current?.respond(performance.now()) }
    const lock = () => { if (document.pointerLockElement === element) lockedAt.current = performance.now(); else interrupt('pointer_lock_lost') }
    const hidden = () => { if (document.hidden) interrupt('visibility_hidden') }
    const key = (event: KeyboardEvent) => {
      if (document.pointerLockElement !== element) return
      if (event.key === 'Escape') interrupt('escape')
      else if (['Tab', ' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) event.preventDefault()
    }
    const wheel = (event: WheelEvent) => { if (document.pointerLockElement === element) event.preventDefault() }
    const contextLost = (event: Event) => { event.preventDefault(); interrupt('configuration_changed'); setError('spatial.unsupported'); setReady(false) }
    const authChanged = () => {
      const next = readAuthSessionState().userId
      if (next !== owner) { interrupt('account_changed'); owner = next }
    }
    const audioState = () => { if (audio.current && audio.current.context.state !== 'running' && controller.current && activePhases(controller.current.phase)) interrupt('configuration_changed') }
    const attachAudioState = () => { audio.current?.context.addEventListener('statechange', audioState) }
    element.addEventListener('spatial-audio-ready', attachAudioState)
    document.addEventListener('mousemove', movement); document.addEventListener('mousedown', click)
    document.addEventListener('pointerlockchange', lock); document.addEventListener('visibilitychange', hidden)
    window.addEventListener('keydown', key); window.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('xensi-auth-updated', authChanged); element.addEventListener('webglcontextlost', contextLost)
    return () => {
      alive.current = false; starting.current = false
      controller.current?.interrupt(performance.now()); recorder.abort('navigation'); cancelAnimationFrame(frame.current)
      document.removeEventListener('mousemove', movement); document.removeEventListener('mousedown', click)
      document.removeEventListener('pointerlockchange', lock); document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('keydown', key); window.removeEventListener('wheel', wheel)
      window.removeEventListener('xensi-auth-updated', authChanged); element.removeEventListener('webglcontextlost', contextLost)
      element.removeEventListener('spatial-audio-ready', attachAudioState)
      audio.current?.context.removeEventListener('statechange', audioState)
      if (document.pointerLockElement === element) document.exitPointerLock()
      audio.current?.dispose(); audio.current = null; scene?.dispose(); viewport.current = null
    }
  }, [recorder])

  const start = async () => {
    const scene = viewport.current, element = canvas.current
    if (!scene || !element || !ready || !valid || starting.current || sensitivity === null || dpi === null) return
    starting.current = true; const request = ++epoch.current
    setError(null); setMetrics(null); feedback.reset(); setView({ ...idle, phase: 'preparing' })
    controller.current = null
    try {
      if (!audio.current) { audio.current = new SpatialAudio(); element.dispatchEvent(new Event('spatial-audio-ready')) }
      const sound = audio.current
      // Both operations begin inside the same trusted click, before awaiting either.
      const resume = sound.resume(), lock = requestStablePointerLock(element, { fullscreen: false })
      await Promise.all([resume, lock])
      if (!alive.current || request !== epoch.current) {
        if (document.pointerLockElement === element) document.exitPointerLock()
        if (sound.context.state !== 'closed') void sound.suspend()
        return
      }
      if (sound.context.state !== 'running') throw new Error('audio')
      if (document.pointerLockElement !== element) { setError('spatial.lockError'); setView(idle); void sound.suspend(); return }
      const account = getSessionRepository().getSnapshot()
      if (account.status !== 'ready' || account.userId !== sessionState.userId) throw new Error('Account changed')
      const normalized = normalizeSensitivity(sensitivity, game), seed = crypto.getRandomValues(new Uint32Array(1))[0]
      snapshot.current = { game, sensitivity: normalized }
      const cfg = exerciseConfig('spatial_hunt', 'medium', 'medium', 0, element.clientWidth, element.clientHeight, 'classic')
      cfg.spatial = { ...SPATIAL_HUNT_RULES, seed }
      recorder.start(sessionState.userId, 'spatial_hunt', createSessionContext(config.draft.gameId, normalized, Math.round(dpi), config.draft.presetId), cfg)
      const orientation = scene.orientation(); sound.updateListener(orientation.forward, orientation.up)
      const engine = new SpatialHuntController(seed, {
        audioTime: () => sound.context.currentTime, cue: direction => sound.cue(direction), stopAudio: () => sound.stop(),
        orientation: () => scene.orientation(), reveal: (source, response) => scene.reveal(source, response), hideSource: () => { scene.markers.visible = false },
        blackout: opacity => { if (blackout.current) blackout.current.style.opacity = String(opacity) },
        changed: next => { if (alive.current) setView(next) }, sample: value => recorder.sample(wrap(value)),
        completed: value => {
          const saved = recorder.complete(wrap(value)); setMetrics(value)
          if (saved) {
            callbacks.current.evaluate(saved)
            void getSessionRepository().waitForSession(saved).catch(() => { if (alive.current) setError('spatial.saveError') })
          }
          document.exitPointerLock(); void sound.suspend()
        },
      }, matchMedia('(prefers-reduced-motion: reduce)').matches)
      controller.current = engine
      if (blackout.current) blackout.current.style.opacity = '0'
      engine.start(performance.now())
      const animate = (now: number) => {
        if (!alive.current || controller.current !== engine) return
        engine.tick(now)
        if (!engine.fullyBlack) scene.render()
        if (activePhases(engine.phase)) frame.current = requestAnimationFrame(animate)
      }
      cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(animate)
    } catch {
      if (alive.current && request === epoch.current) { setError('spatial.audioError'); setView(idle) }
      recorder.abort('configuration_changed'); void audio.current?.suspend()
      if (document.pointerLockElement === element) document.exitPointerLock()
    } finally { if (request === epoch.current) starting.current = false }
  }

  const format = (value: number | null, unit = '°', precision = 1) => formatAnalysisValue(value, { unit, precision }, locale)
  const result = view.result
  return <section className={`spatial-hunt ${active ? 'is-playing' : ''} ${error === 'spatial.unsupported' ? 'is-unsupported' : ''}`} data-phase={view.phase}>
    <div className="spatial-world"><canvas ref={canvas} tabIndex={-1} aria-label={t('spatial.name')} />
      {active && <div className="spatial-hud"><span>{t('spatial.name')} · {view.round}/8</span>
        {view.phase === 'orientation' && <span>{t('spatial.orientation')} · {view.countdown}</span>}
        {view.phase === 'revealing' && result && <div className="spatial-round-result"><b>{result.timedOut ? t('spatial.timeout') : `${t('spatial.error')}: ${format(result.angularErrorDeg)}`}</b><span>{format(result.localizationTimeMs, 'ms', 0)}</span>
          <svg viewBox="0 0 100 100" aria-label={`${t('spatial.source')} / ${t('spatial.response')}`}><circle cx="50" cy="50" r="38"/>{!result.timedOut && <line className="spatial-response-ray" x1="50" y1="50" x2="50" y2="12"/>}
            <line className="spatial-source-ray" x1="50" y1="50" x2={50 + Math.sin((result.sourceAzimuth - (result.responseAzimuth ?? result.referenceYaw))*Math.PI/180)*38} y2={50 - Math.cos((result.sourceAzimuth - (result.responseAzimuth ?? result.referenceYaw))*Math.PI/180)*38}/></svg>
          <small><i className="source-key"/>{t('spatial.source')} {!result.timedOut && <><i className="response-key"/>{t('spatial.response')}</>}</small>
        </div>}
      </div>}
      <div className="spatial-blackout" ref={blackout} />
      {active && <Crosshair className="spatial-crosshair" size={28} aria-hidden="true" />}
    </div>
    {!active && <div className="spatial-controls">
      <header><h1>{t('spatial.name')}</h1><span>{t('spatial.experimental')}</span><Button variant="outline" size="icon" onClick={onExit} aria-label={t('spatial.exit')} title={t('spatial.exit')}><ArrowLeft /></Button></header>
      {error && <p role="alert">{t(error)}</p>}
      {view.phase === 'completed' && metrics ? <>
        <div className="spatial-results">{getAnalysisMetrics('spatial_hunt').map(metric => <div key={metric.key}><span>{t(metric.label)}</span><strong>{formatAnalysisValue(metrics[metric.key as keyof SpatialMetrics] as number | null, metric, locale)}</strong></div>)}</div>
        <p>{t('spatial.rounds')}: {metrics.round_count} · {t('spatial.timeouts')}: {metrics.timeouts}</p>
        {feedback.result && feedback.result.status !== 'none' && <p className="spatial-pb" role="status">{PERSONAL_BEST_COPY[locale][feedback.result.status === 'first' ? 'first' : 'new']}</p>}
        {feedback.unavailable && <p role="status">{PERSONAL_BEST_COPY[locale].unavailable}</p>}
        <PersonalBestPanel exercise="spatial_hunt" />
      </> : view.phase === 'interrupted' ? <><h2>{t('spatial.interrupted')}</h2><p>{t('spatial.interruptedText')}</p></> : <>
        <p>{t('spatial.instruction')}</p><p className="spatial-headphones"><Headphones size={18}/>{t('spatial.headphones')}</p>
        <div className="spatial-game grid gap-2"><Label htmlFor="spatial-game">{t('common.gameReference')}</Label><GameSelect id="spatial-game" games={SPATIAL_GAMES} value={config.draft.gameId} onValueChange={id => config.selectGame(id as GameId)} disabled={view.phase === 'preparing'} /></div>
        <SensitivityConfigFields draft={config.draft} presets={config.presets} onSelectPreset={config.selectPreset} onSensitivityChange={config.setSensitivity} onDpiChange={config.setDpi}/>
      </>}
      <p className="spatial-rule">{t('spatial.profile')}<br/>{t('spatial.pbRule')}</p>
      {view.phase === 'preparing' && <p role="status">{t('spatial.preparing')}</p>}
      <div className="spatial-actions flex flex-wrap gap-2"><Button disabled={!ready || !valid || view.phase === 'preparing'} onClick={() => void start()}>{view.phase === 'completed' || view.phase === 'interrupted' ? <RotateCcw /> : <Play />} {t(view.phase === 'completed' || view.phase === 'interrupted' ? 'spatial.retry' : 'spatial.start')}</Button><Button variant="outline" onClick={onExit}>{t('spatial.exit')}</Button></div>
    </div>}
  </section>
}
function activePhases(phase: string) { return !['idle', 'preparing', 'completed', 'interrupted'].includes(phase) }
