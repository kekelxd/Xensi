import { XensiAppShell } from './design/XensiAppShell'
import { navigateWithPageMotion } from './design/pageMotion'
import { MotionDialog, MotionDialogPanel } from './design/MotionSurfaces'
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Activity, ArrowLeft, ArrowRight, Circle, Crosshair, Dot, Info, MousePointer2, Plus, Settings2, Target, X, type LucideIcon } from 'lucide-react'
import { buildCalibrationReport, calculateRoundResult, createCalibrationSessionSummary, getTargetSpeed, isCalibrationComplete, readCalibrationHistory, ROUND_DURATION, ROUND_WARMUP, selectValidationCandidateIds, writeCalibrationSession, type CalibrationSessionSummary, type RoundCapture, type RoundIssue, type RoundResult, type TargetSpeedMode } from './calibration'
import { appendValidationRounds, BASE_CANDIDATE_MULTIPLIERS, buildCalibrationCandidates, CALIBRATION_REPETITIONS, createCalibrationPlan, createRefinementPlan, MIN_CALIBRATION_CANDIDATES, VALIDATION_FINALIST_COUNT, VALIDATION_REPETITIONS, type CalibrationPlan } from './calibrationPlan'
import { GAME_BY_ID, GAMES, GameId } from './games'
import { GamePicker } from './GamePicker'
import { WizardStepper } from './SetupWizard'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupCard } from '@/components/ui/radio-group'
import { MouseButtonTest } from './MouseButtonTest'
import { PollingRateTest } from './PollingRateTest'
import { RefreshRateTest } from './RefreshRateTest'
import { ControllerDriftTest } from './ControllerDriftTest'
import { SensitivityConverter } from './SensitivityConverter'
import { SensitivityFinderModal } from './SensitivityFinderModal'
import { normalizeSensitivity, parsePositiveNumberInput } from './sensitivity'
import { DEFAULT_HORIZONTAL_FOV, getCmPer360, MAX_HORIZONTAL_FOV, MIN_HORIZONTAL_FOV } from './aimModel'
import { CrosshairStyle, TrackingArena, TrackingArenaHandle } from './TrackingArena'
import { Warmup } from './Warmup'
import { Routine } from './Routine'
import { CalibrationLanding } from './CalibrationLanding'
import { CalibrationReportView } from './CalibrationReport'
const Home = lazy(() => import('./Home').then(module => ({ default: module.Home })))
const SquadFinder = lazy(() => import('./squad/SquadFinder').then(module => ({ default: module.SquadFinder })))
import { InstitutionalPage } from './InstitutionalPage'
import { DiagnosticLanding } from './DiagnosticLanding'
import { PlayerProfile, type ProfilePresetLaunch } from './PlayerProfile'
import { useI18n, type TranslationKey } from './i18n'
import { Analysis } from './Analysis'
import { AppNavigation } from './AppNavigation'
import type { WarmupExercise } from './warmupConfig'
import { AuthScreen } from './AuthPages'
import { initializeAuth, type AuthMode } from './authService'
import { PresetSyncStatus } from './PresetSyncStatus'
import { usePresetState } from './useSensitivityPreset'
import {
  APP_BASE_PATH,
  authRoutePath,
  readRouteStateFromLocation,
  viewRoutePath,
  type AnalysisSection,
  type AppRouteState,
  type AppView,
} from './routes'

type RoundPhase = 'idle' | 'countdown' | 'warmup' | 'running'
type CalibrationSetupStep = 1 | 2 | 3

const CROSSHAIRS: Array<{ id: CrosshairStyle, label: TranslationKey, description: TranslationKey, icon: LucideIcon }> = [
  { id: 'classic', label: 'crosshair.classic', description: 'crosshair.classicDescription', icon: Crosshair },
  { id: 'dot', label: 'crosshair.dot', description: 'crosshair.dotDescription', icon: Dot },
  { id: 'circle', label: 'crosshair.circle', description: 'crosshair.circleDescription', icon: Circle },
  { id: 'plus', label: 'crosshair.plus', description: 'crosshair.plusDescription', icon: Plus },
]

const stepTitle = 'm-0 font-heading text-base font-semibold text-foreground'

function SetupField({ label, value, onChange, inputMode, invalid }: { label: string; value: string; onChange: (value: string) => void; inputMode: 'decimal' | 'numeric'; invalid: boolean }) {
  const id = useId()
  return <div className="grid min-w-0 content-start gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type="text" inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} aria-invalid={invalid} className="font-mono tabular-nums" />
  </div>
}

const format = (value: number, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '0'

const ROUND_ISSUE_KEYS: Record<RoundIssue, TranslationKey> = {
  'insufficient-samples': 'calibration.issueInsufficientSamples',
  'canvas-resized': 'calibration.issueCanvasResized',
  'unstable-frame-time': 'calibration.issueUnstableFrames',
  'too-many-interruptions': 'calibration.issueInterruptions',
}

const leaveFullscreen = () => {
  if (!document.fullscreenElement) return
  const request = document.exitFullscreen?.()
  request?.catch(() => {})
}

function Metric({ label, value, suffix, tone }: { label: string, value: string, suffix?: string, tone?: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: tone }}>{value}<small>{suffix}</small></div>
    </div>
  )
}

function App() {
  const presetState = usePresetState()
  const { locale, setLocale, t } = useI18n()
  const arenaRef = useRef<TrackingArenaHandle>(null)
  const phaseRemainingMsRef = useRef(3000)
  const [view, setView] = useState<AppView>(() => readRouteStateFromLocation().view)
  const currentViewRef = useRef(view)
  const [authRoute, setAuthRoute] = useState<AuthMode | null>(() => readRouteStateFromLocation().authRoute)
  const [analysisSection, setAnalysisSection] = useState<AnalysisSection>(() => readRouteStateFromLocation().analysisSection)
  const [warmupEntry, setWarmupEntry] = useState<WarmupExercise | null>(() => readRouteStateFromLocation().warmupEntry)
  const [round, setRound] = useState(0)
  const [results, setResults] = useState<RoundResult[]>([])
  const [plan, setPlan] = useState<CalibrationPlan | null>(null)
  const [rejectedIssue, setRejectedIssue] = useState<RoundIssue | null>(null)
  const [phase, setPhase] = useState<RoundPhase>('idle')
  const [inputReady, setInputReady] = useState(false)
  const [remaining, setRemaining] = useState(ROUND_DURATION)
  const [countdown, setCountdown] = useState(3)
  const [setupOpen, setSetupOpen] = useState(false)
  const [calibrationStarted, setCalibrationStarted] = useState(false)
  const [setupStep, setSetupStep] = useState<CalibrationSetupStep>(1)
  const [startAfterSetup, setStartAfterSetup] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [selectedGame, setSelectedGame] = useState<GameId>('cs2')
  const [sensitivityInput, setSensitivityInput] = useState('1')
  const [dpiInput, setDpiInput] = useState('800')
  const [fovInput, setFovInput] = useState(String(DEFAULT_HORIZONTAL_FOV))
  const [confirmedGame, setConfirmedGame] = useState<GameId>('cs2')
  const [confirmedDpi, setConfirmedDpi] = useState(800)
  const [confirmedHorizontalFov, setConfirmedHorizontalFov] = useState(DEFAULT_HORIZONTAL_FOV)
  const [speedMode, setSpeedMode] = useState<TargetSpeedMode>('normal')
  const [selectedSpeedMode, setSelectedSpeedMode] = useState<TargetSpeedMode>('normal')
  const [baseSensitivity, setBaseSensitivity] = useState(1)
  const [crosshair, setCrosshair] = useState<CrosshairStyle>('classic')
  const [selectedCrosshair, setSelectedCrosshair] = useState<CrosshairStyle>('classic')
  const [metrics, setMetrics] = useState({ accuracy: 0, meanError: 0, smoothness: 0 })
  const [previousCalibration, setPreviousCalibration] = useState<CalibrationSessionSummary | null>(null)
  const [calibrationHistory, setCalibrationHistory] = useState<CalibrationSessionSummary[]>([])
  const [converterPreset, setConverterPreset] = useState<ProfilePresetLaunch | null>(null)
  const [finderPreset, setFinderPreset] = useState<ProfilePresetLaunch | null>(null)

  const applyRouteState = (routeState: AppRouteState) => {
    setAuthRoute(routeState.authRoute)
    setView(routeState.view)
    setAnalysisSection(routeState.analysisSection)
    setWarmupEntry(routeState.warmupEntry)
  }

  useEffect(() => { currentViewRef.current = view }, [view])

  useEffect(() => {
    const syncRouteFromLocation = () => {
      const routeState = readRouteStateFromLocation()
      if (routeState.shouldReplace) window.history.replaceState({}, '', routeState.canonicalPath)
      navigateWithPageMotion(() => applyRouteState(routeState), currentViewRef.current, routeState.view, false)
    }
    syncRouteFromLocation()
    window.addEventListener('popstate', syncRouteFromLocation)
    return () => window.removeEventListener('popstate', syncRouteFromLocation)
  }, [])

  useEffect(() => {
    void initializeAuth()
  }, [])

  const active = phase !== 'idle'
  const showLegacyCalibration = false
  const tracking = phase === 'running'
  const moving = phase === 'warmup' || phase === 'running'
  const landingRounds = BASE_CANDIDATE_MULTIPLIERS.length * CALIBRATION_REPETITIONS + VALIDATION_FINALIST_COUNT * VALIDATION_REPETITIONS
  const totalRounds = plan?.rounds.length ?? landingRounds
  const currentRoundPlan = plan?.rounds[round] ?? null
  const currentCandidate = currentRoundPlan
    ? plan?.candidates.find((candidate) => candidate.id === currentRoundPlan.candidateId) ?? null
    : null
  const calibrationComplete = Boolean(plan?.validationRoundCount)
    && isCalibrationComplete(results.length, plan?.rounds.length ?? 0)
  const targetSpeed = getTargetSpeed(speedMode)
  const calibrationReport = plan
    ? buildCalibrationReport(results, plan.candidates, plan.measurementRoundCount, plan.validationRoundCount)
    : null
  const recommendation = calibrationReport?.recommendation ?? 1
  const confirmedGameConfig = GAME_BY_ID[confirmedGame]
  const recommendedSelected = normalizeSensitivity(baseSensitivity * recommendation, confirmedGameConfig)
  const recommendedRangeMin = calibrationReport
    ? normalizeSensitivity(baseSensitivity * calibrationReport.range.min, confirmedGameConfig)
    : recommendedSelected
  const recommendedRangeMax = calibrationReport
    ? normalizeSensitivity(baseSensitivity * calibrationReport.range.max, confirmedGameConfig)
    : recommendedSelected
  const displayedCandidate = currentCandidate?.sensitivity ?? baseSensitivity
  const multiplier = currentCandidate?.multiplier ?? 1
  const selectedGameConfig = GAME_BY_ID[selectedGame]
  const parsedSensitivityInput = parsePositiveNumberInput(sensitivityInput)
  const parsedDpiInput = parsePositiveNumberInput(dpiInput)
  const parsedFovInput = parsePositiveNumberInput(fovInput)
  const sensitivityPreview = parsedSensitivityInput === null ? null : normalizeSensitivity(parsedSensitivityInput, selectedGameConfig)
  const fovPreview = parsedFovInput === null ? null : Math.min(MAX_HORIZONTAL_FOV, Math.max(MIN_HORIZONTAL_FOV, parsedFovInput))
  const cmPer360Preview = sensitivityPreview === null || parsedDpiInput === null
    ? null
    : getCmPer360(selectedGameConfig, sensitivityPreview, parsedDpiInput)
  const setupCandidateCount = sensitivityPreview === null
    ? 0
    : buildCalibrationCandidates(sensitivityPreview, selectedGameConfig).length
  const setupCanCalibrate = setupCandidateCount >= MIN_CALIBRATION_CANDIDATES
  const rejectedIssueMessage = rejectedIssue ? t(ROUND_ISSUE_KEYS[rejectedIssue]) : undefined
  const validationReady = Boolean(
    plan?.validationRoundCount
    && results.length === plan.measurementRoundCount
    && currentRoundPlan?.stage === 'validation',
  )
  const resultTitleKey: TranslationKey = calibrationReport?.resultKind === 'recommended'
    ? 'calibration.resultTitleRecommended'
    : calibrationReport?.resultKind === 'range'
      ? 'calibration.resultTitleRange'
      : 'calibration.resultTitleInconclusive'
  const canRefine = Boolean(
    plan?.refinementDepth === 0
    && calibrationReport
    && calibrationReport.refinementMultipliers.length >= MIN_CALIBRATION_CANDIDATES
    && (
      calibrationReport.resultKind === 'range'
      || calibrationReport.reason === 'split-candidates'
      || calibrationReport.reason === 'validation-split'
    ),
  )
  useEffect(() => {
    if (phase === 'idle' || !inputReady) return

    const started = performance.now()
    const initialRemaining = phaseRemainingMsRef.current
    let transitioned = false
    const updateTimer = () => {
      const nextRemaining = Math.max(0, initialRemaining - (performance.now() - started))
      phaseRemainingMsRef.current = nextRemaining
      if (phase === 'countdown') setCountdown(Math.ceil(nextRemaining / 1000))
      else setRemaining(nextRemaining / 1000)

      if (nextRemaining > 0 || phase === 'running') return
      transitioned = true
      if (phase === 'countdown') {
        phaseRemainingMsRef.current = ROUND_WARMUP * 1000
        setRemaining(ROUND_WARMUP)
        setPhase('warmup')
      } else {
        phaseRemainingMsRef.current = ROUND_DURATION * 1000
        setRemaining(ROUND_DURATION)
        setPhase('running')
      }
    }

    updateTimer()
    const timer = window.setInterval(updateTimer, 100)
    return () => {
      window.clearInterval(timer)
      if (!transitioned) phaseRemainingMsRef.current = Math.max(0, initialRemaining - (performance.now() - started))
    }
  }, [phase, round, inputReady])

  const beginRound = (targetPlan = plan, targetRoundIndex = round, force = false) => {
    if (!targetPlan?.rounds[targetRoundIndex]) return
    if (!force && (resultOpen || (targetPlan.validationRoundCount > 0 && isCalibrationComplete(results.length, targetPlan.rounds.length)))) {
      setResultOpen(true)
      leaveFullscreen()
      return
    }
    setRejectedIssue(null)
    setMetrics({ accuracy: 0, meanError: 0, smoothness: 0 })
    phaseRemainingMsRef.current = 3000
    setCountdown(3)
    setRemaining(ROUND_DURATION)
    setInputReady(false)
    arenaRef.current?.requestPointerLock()
    setPhase('countdown')
  }

  const saveSetup = () => {
    if (parsedSensitivityInput === null || parsedDpiInput === null || fovPreview === null) return
    const cleanSensitivity = normalizeSensitivity(parsedSensitivityInput, selectedGameConfig)
    const configurationChanged = selectedGame !== confirmedGame
      || cleanSensitivity !== baseSensitivity
      || parsedDpiInput !== confirmedDpi
      || fovPreview !== confirmedHorizontalFov
      || selectedSpeedMode !== speedMode
      || selectedCrosshair !== crosshair
    const nextPlan = configurationChanged || !plan
      ? createCalibrationPlan(cleanSensitivity, selectedGameConfig)
      : plan
    if (nextPlan.candidates.length < MIN_CALIBRATION_CANDIDATES) return

    flushSync(() => {
      setSensitivityInput(String(cleanSensitivity))
      setDpiInput(String(Math.round(parsedDpiInput)))
      setFovInput(String(fovPreview))
      setConfirmedGame(selectedGame)
      setBaseSensitivity(cleanSensitivity)
      setConfirmedDpi(parsedDpiInput)
      setConfirmedHorizontalFov(fovPreview)
      setSpeedMode(selectedSpeedMode)
      setCrosshair(selectedCrosshair)
      setPlan(nextPlan)
      setRejectedIssue(null)

      if (configurationChanged) {
        setResults([])
        setRound(0)
        setResultOpen(false)
        const history = readCalibrationHistory(window.localStorage, selectedGame)
        setCalibrationHistory(history)
        setPreviousCalibration(history[0] ?? null)
      }

      if (startAfterSetup) {
        setStartAfterSetup(false)
        setCalibrationStarted(true)
        setSetupOpen(false)
      } else {
        setSetupOpen(false)
      }
    })

    if (startAfterSetup) beginRound(nextPlan, configurationChanged ? 0 : round)
  }

  const start = () => {
    if (calibrationComplete) {
      setResultOpen(true)
      leaveFullscreen()
      return
    }
    if (!plan) {
      setSelectedSpeedMode(speedMode)
      setSelectedCrosshair(crosshair)
      setStartAfterSetup(true)
      setSetupStep(1)
      setSetupOpen(true)
      return
    }
    beginRound()
  }

  const openSetup = () => {
    if (active) return
    setSelectedGame(confirmedGame)
    setSensitivityInput(String(baseSensitivity))
    setDpiInput(String(confirmedDpi))
    setFovInput(String(confirmedHorizontalFov))
    setSelectedSpeedMode(speedMode)
    setSelectedCrosshair(crosshair)
    setStartAfterSetup(false)
    setSetupStep(1)
    setSetupOpen(true)
  }

  const closeSetup = () => {
    setStartAfterSetup(false)
    setSetupOpen(false)
  }

  const completeRound = (capture: RoundCapture) => {
    if (!plan || !currentRoundPlan || !currentCandidate) return
    const result = calculateRoundResult(currentRoundPlan, currentCandidate, capture)

    setPhase('idle')
    setRemaining(ROUND_DURATION)
    setInputReady(false)
    document.exitPointerLock?.()

    if (!result.valid) {
      setRejectedIssue(result.issues[0] ?? 'insufficient-samples')
      leaveFullscreen()
      return
    }

    const nextResults = [...results, result]
    setResults(nextResults)
    setRejectedIssue(null)

    const measurementComplete = nextResults.filter((item) => item.stage === 'measurement').length >= plan.measurementRoundCount
    if (measurementComplete && plan.validationRoundCount === 0) {
      const preliminaryReport = buildCalibrationReport(nextResults, plan.candidates, plan.measurementRoundCount, 0)
      if (preliminaryReport) {
        const finalistIds = selectValidationCandidateIds(preliminaryReport, VALIDATION_FINALIST_COUNT)
        const expandedPlan = appendValidationRounds(plan, finalistIds)
        setPlan(expandedPlan)
        setRound(nextResults.length)
        return
      }
    }

    const completed = plan.validationRoundCount > 0 && isCalibrationComplete(nextResults.length, plan.rounds.length)
    if (completed) {
      const finalReport = buildCalibrationReport(nextResults, plan.candidates, plan.measurementRoundCount, plan.validationRoundCount)
      if (finalReport) {
        const finalSensitivity = normalizeSensitivity(baseSensitivity * finalReport.recommendation, confirmedGameConfig)
        const rangeMinSensitivity = normalizeSensitivity(baseSensitivity * finalReport.range.min, confirmedGameConfig)
        const rangeMaxSensitivity = normalizeSensitivity(baseSensitivity * finalReport.range.max, confirmedGameConfig)
        const history = readCalibrationHistory(window.localStorage, confirmedGame)
        setPreviousCalibration(history[0] ?? null)
        setCalibrationHistory(history)
        if (finalReport.resultKind === 'recommended' || finalReport.resultKind === 'range') {
          const savedHistory = writeCalibrationSession(
            window.localStorage,
            confirmedGame,
            createCalibrationSessionSummary(
              finalReport,
              finalSensitivity,
              rangeMinSensitivity,
              rangeMaxSensitivity,
              confirmedDpi,
              confirmedHorizontalFov,
              getCmPer360(confirmedGameConfig, finalSensitivity, confirmedDpi),
            ),
          )
          setCalibrationHistory(savedHistory)
        }
      }
      setRound(Math.max(0, plan.rounds.length - 1))
      setResultOpen(true)
      leaveFullscreen()
      return
    }

    setRound(nextResults.length)
  }

  const refineCalibration = () => {
    if (!calibrationReport || !canRefine || plan?.refinementDepth !== 0) return
    const nextPlan = createRefinementPlan(
      baseSensitivity,
      confirmedGameConfig,
      calibrationReport.refinementMultipliers,
    )
    if (nextPlan.candidates.length < MIN_CALIBRATION_CANDIDATES) return

    flushSync(() => {
      setPhase('idle')
      setInputReady(false)
      setRound(0)
      setResults([])
      setPlan(nextPlan)
      setRejectedIssue(null)
      setResultOpen(false)
      setRemaining(ROUND_DURATION)
      setCountdown(3)
      setMetrics({ accuracy: 0, meanError: 0, smoothness: 0 })
      phaseRemainingMsRef.current = 3000
    })

    beginRound(nextPlan, 0, true)
  }

  const reset = () => {
    setPhase('idle')
    setInputReady(false)
    setRound(0)
    setResults([])
    setPlan(null)
    setRejectedIssue(null)
    setResultOpen(false)
    setCalibrationStarted(false)
    setRemaining(ROUND_DURATION)
    setCountdown(3)
    setMetrics({ accuracy: 0, meanError: 0, smoothness: 0 })
    setPreviousCalibration(null)
    phaseRemainingMsRef.current = 3000
    document.exitPointerLock?.()
    leaveFullscreen()
  }

  const navigateAuth = (route: AuthMode) => {
    window.history.pushState({}, '', authRoutePath(route))
    applyRouteState(readRouteStateFromLocation())
  }

  const navigateView = (
    next: AppView,
    options: { warmupEntry?: WarmupExercise | null; analysisSection?: AnalysisSection; preserveLaunchPreset?: boolean } = {},
  ) => {
    if (next === 'converter' && !options.preserveLaunchPreset) setConverterPreset(null)
    if (next === 'calibration' && !options.preserveLaunchPreset) setFinderPreset(null)
    // Keep URL/history immediate, including clicks that interrupt a snapshot capture.
    window.history.pushState({}, '', viewRoutePath(next, options))
    const routeState = readRouteStateFromLocation()
    navigateWithPageMotion(() => applyRouteState(routeState), view, next, active)
  }

  const completeAuth = () => {
    window.history.pushState({}, '', APP_BASE_PATH)
    applyRouteState(readRouteStateFromLocation())
  }

  if (authRoute) {
    return <AuthScreen mode={authRoute} onNavigate={navigateAuth} onAuthenticated={completeAuth} />
  }

  return (
    <XensiAppShell view={view} onNavigate={navigateView} className={view === 'calibration' && calibrationStarted ? 'app-shell' : 'app-shell tool-shell'}>
      <header className="app-header">
        <AppNavigation
          view={view}
          analysisSection={analysisSection}
          locale={locale}
          disabled={active}
          onLocaleChange={setLocale}
          onNavigate={navigateView}
          onLogin={() => navigateAuth('login')}
          onExercise={(exercise) => navigateView('warmup', { warmupEntry: exercise })}
          onAnalysisSection={(section) => navigateView('analysis', { analysisSection: section })}
        />
        {view === 'calibration' && calibrationStarted && (
          <div className="header-context">
            <>
              <span>{t('header.rounds', { completed: results.length, total: totalRounds })}</span>
              <button className="icon-button" onClick={openSetup} aria-label={t('header.openSettings')} disabled={active}><Settings2 size={17} /></button>
            </>
          </div>
        )}
      </header>
      <PresetSyncStatus />
      <main className="xensi-route-content">

      {view === 'squad' ? <Suspense fallback={<p role="status">XENSI Squad Finder…</p>}><SquadFinder onLogin={() => navigateAuth('login')} /></Suspense> : view === 'home' ? <Suspense fallback={<div className="xensi-home-loading" role="status" aria-label="XENSI"><span /></div>}><Home onNavigate={navigateView} /></Suspense> : view === 'about' || view === 'privacy' || view === 'terms' || view === 'contact' ? <InstitutionalPage page={view} onNavigate={navigateView} /> : view === 'analysis' ? <Analysis section={analysisSection} onStartTraining={() => navigateView('warmup')} /> : view === 'profile' ? <PlayerProfile key={presetState.userId ?? 'guest'} onConvert={(preset) => { setConverterPreset(preset); navigateView('converter', { preserveLaunchPreset: true }) }} onCalibrate={(preset) => { setFinderPreset(preset); navigateView('calibration', { preserveLaunchPreset: true }) }} /> : view === 'routine' ? <Routine key={presetState.userId ?? 'guest'} /> : view === 'warmup' ? <Warmup key={`${presetState.userId ?? 'guest'}:${warmupEntry ?? 'hub'}`} initialExercise={warmupEntry} onExerciseChange={(exercise) => navigateView('warmup', { warmupEntry: exercise })} /> : view === 'calibration' ? <SensitivityFinderModal initialPreset={finderPreset ? { ...finderPreset, gameId: finderPreset.gameId as GameId } : null} /> : view === 'diagnostics' ? <DiagnosticLanding onNavigate={navigateView} /> : showLegacyCalibration ? calibrationStarted ? <><section className="workspace">
        <aside className="metrics-rail">
          <div className="rail-heading"><Activity size={15} /> {t('calibration.live')}</div>
          <Metric label={t('common.accuracy')} value={format(metrics.accuracy)} suffix="%" tone="#8dfbd3" />
          <Metric label={t('common.meanError')} value={format(metrics.meanError)} suffix="px" />
          <Metric label={t('common.smoothness')} value={format(metrics.smoothness)} suffix="%" />
        </aside>

        <TrackingArena
          ref={arenaRef}
          active={active}
          moving={moving && inputReady}
          scoring={tracking && inputReady}
          paused={!inputReady}
          multiplier={multiplier}
          game={confirmedGameConfig}
          sensitivity={displayedCandidate}
          horizontalFov={confirmedHorizontalFov}
          targetSpeed={targetSpeed}
          trajectorySeed={currentRoundPlan?.trajectorySeed ?? plan?.sessionSeed ?? 1}
          roundKey={currentRoundPlan?.id ?? 'idle'}
          crosshair={crosshair}
          countdownLabel={phase === 'countdown' ? String(countdown) : phase === 'warmup' ? t('calibration.adjust') : ''}
          idleMessage={rejectedIssueMessage ?? (validationReady ? t('calibration.validationReady') : undefined)}
          idleHint={rejectedIssue ? t('calibration.retryRound') : validationReady ? t('calibration.validationHint') : undefined}
          hasResults={results.length > 0}
          isComplete={calibrationComplete}
          hud={{
            round: Math.min(round + 1, totalRounds),
            totalRounds,
            accuracy: format(metrics.accuracy),
            meanError: format(metrics.meanError),
            sensitivity: format(displayedCandidate, 3),
            remaining: phase === 'countdown' ? String(countdown) : format(remaining, 1),
          }}
          onStart={start}
          onReset={reset}
          onShowResults={() => {
            setResultOpen(true)
            leaveFullscreen()
          }}
          onMetrics={setMetrics}
          onRoundComplete={completeRound}
          onPointerLockChange={setInputReady}
        />

        <aside className="round-panel">
          <div>
            <div className="panel-label">{t('calibration.roundOf', { round: Math.min(round + 1, totalRounds), total: totalRounds })}</div>
            <div className="round-progress"><i style={{ width: `${((round + (tracking ? 0.5 : 0)) / totalRounds) * 100}%` }} /></div>
          </div>
          <div className="test-value">
            <span>{t('calibration.testSensitivity')}</span>
            <strong>{format(displayedCandidate, 3)}</strong>
            <small>{GAME_BY_ID[confirmedGame].label} · {format(multiplier, 2)}× · {currentRoundPlan?.stage === 'validation' ? t('calibration.validationStage') : t('calibration.measurementStage')} · {t('calibration.speed', { speed: speedMode === 'normal' ? t('calibration.normal') : t('calibration.fastBadge') })}</small>
          </div>
          <div className={phase === 'countdown' ? 'timer countdown-timer' : 'timer'}>
            {phase === 'countdown' ? countdown : active ? format(remaining, 1) : format(ROUND_DURATION, 1)}
            <small>{phase === 'countdown' ? '' : 's'}</small>
          </div>
          <p>
            {phase === 'countdown'
              ? t('calibration.prepareHand')
              : phase === 'warmup'
                ? t('calibration.warmup')
                : t('calibration.guidance')}
          </p>
          <div className="candidate-list calibration-round-list">
            {(plan?.rounds ?? []).map((plannedRound, index) => {
              const candidate = plan?.candidates.find((item) => item.id === plannedRound.candidateId)
              return (
                <div key={plannedRound.id} className={`${index === round ? 'current' : index < results.length ? 'done' : ''} ${plannedRound.stage}`.trim()}>
                  <span>{String(index + 1).padStart(2, '0')}</span><i /><b>{candidate ? format(candidate.multiplier, 2) : '--'}×</b>
                </div>
              )
            })}
          </div>
        </aside>
      </section>

      <footer>
        <div className="footer-status">{active && <><MousePointer2 size={16} /> {t('calibration.trackingActive')}</>}</div>
        <div className="controls" />
        <div className="dpi-status">{t('calibration.physicalProfile', { dpi: confirmedDpi, fov: confirmedHorizontalFov })}</div>
      </footer></> : <CalibrationLanding rounds={`${BASE_CANDIDATE_MULTIPLIERS.length * CALIBRATION_REPETITIONS}+${VALIDATION_FINALIST_COUNT * VALIDATION_REPETITIONS}`} seconds={ROUND_DURATION} onStart={start} /> : view === 'converter' ? <SensitivityConverter initialPreset={converterPreset} /> : view === 'polling' ? <PollingRateTest /> : view === 'buttons' ? <MouseButtonTest /> : view === 'refresh-rate' ? <RefreshRateTest /> : <ControllerDriftTest />}

      </main>
      <Dialog open={view === 'calibration' && setupOpen} onOpenChange={open => { if (!open) closeSetup() }}>
        <DialogContent closeLabel={t('common.close')} className="calibration-setup-modal max-w-[820px] gap-6">
          <DialogHeader>
            <Settings2 size={22} className="text-primary" aria-hidden="true" />
            <DialogTitle>{t('calibration.setupTitle')}</DialogTitle>
            <DialogDescription>{t('calibration.setupDescriptionPhysical', { rounds: landingRounds, seconds: ROUND_DURATION })}</DialogDescription>
          </DialogHeader>

          <WizardStepper current={setupStep} steps={[t('warmup.stepGame'), t('warmup.stepSettings'), t('warmup.stepCrosshair')]} />

          <div className="min-h-[220px]">
            {setupStep === 1 && <div className="grid gap-4">
              <h3 className={stepTitle}>{t('warmup.chooseGame')}</h3>
              <GamePicker gameIds={GAMES.map(item => item.id)} value={selectedGame} onChange={id => setSelectedGame(id as GameId)} />
            </div>}

            {setupStep === 2 && <div className="grid gap-4">
              <h3 className={stepTitle}>{t('warmup.settingsTitle')}</h3>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,.6fr)_minmax(0,.6fr)]">
                <SetupField label={t('calibration.currentSensitivity', { game: selectedGameConfig.label })} inputMode="decimal" value={sensitivityInput} onChange={setSensitivityInput} invalid={parsedSensitivityInput === null} />
                <SetupField label={t('common.mouseDpi')} inputMode="numeric" value={dpiInput} onChange={setDpiInput} invalid={parsedDpiInput === null} />
                <SetupField label={t('calibration.horizontalFov')} inputMode="decimal" value={fovInput} onChange={setFovInput} invalid={fovPreview === null} />
              </div>
              <RadioGroup className="grid-cols-2 gap-2.5" aria-label={t('calibration.targetSpeed')} value={selectedSpeedMode} onValueChange={value => setSelectedSpeedMode(value as TargetSpeedMode)}>
                {(['normal', 'fast'] as TargetSpeedMode[]).map((mode) => (
                  <RadioGroupCard key={mode} value={mode} className="items-start p-3">
                    <span className="grid min-w-0 gap-1"><strong className="font-semibold">{mode === 'normal' ? t('calibration.normal') : t('calibration.fast')}</strong><small className="text-xs font-normal leading-snug text-muted-foreground">{mode === 'normal' ? t('calibration.normalDescription') : t('calibration.fastDescription')}</small></span>
                  </RadioGroupCard>
                ))}
              </RadioGroup>
              <div className="grid gap-2 rounded-lg border border-solid border-border bg-black/25 px-4 py-3 text-sm text-muted-foreground sm:grid-cols-2">
                <span className="flex items-baseline justify-between gap-3">{t('calibration.baseSensitivity', { game: selectedGameConfig.shortLabel })} <strong className="font-mono font-medium tabular-nums text-foreground">{sensitivityPreview === null ? '--' : format(sensitivityPreview, 3)}</strong></span>
                <span className="flex items-baseline justify-between gap-3">{t('calibration.cmPer360')} <strong className="font-mono font-medium tabular-nums text-success">{cmPer360Preview === null ? t('calibration.cmPer360Unavailable') : `${format(cmPer360Preview, 2)} cm`}</strong></span>
              </div>
              {!selectedGameConfig.yaw && <Alert variant="warning"><Info /><span className="col-start-2">{t('calibration.relativeProfileNotice')}</span></Alert>}
              {sensitivityPreview !== null && !setupCanCalibrate ? <Alert variant="warning"><Info /><span className="col-start-2">{t('calibration.insufficientCandidates')}</span></Alert> : null}
            </div>}

            {setupStep === 3 && <div className="grid gap-4">
              <h3 className={stepTitle}>{t('warmup.crosshairTitle')}</h3>
              <RadioGroup className="grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label={t('calibration.crosshairType')} value={selectedCrosshair} onValueChange={value => setSelectedCrosshair(value as CrosshairStyle)}>
                {CROSSHAIRS.map((item) => { const Icon = item.icon; return (
                  <RadioGroupCard key={item.id} value={item.id} indicator="corner" className="flex-col items-start gap-1.5 p-3">
                    <Icon className="size-[18px] text-primary" aria-hidden="true" /><strong className="font-semibold">{t(item.label)}</strong><small className="text-xs font-normal leading-snug text-muted-foreground">{t(item.description)}</small>
                  </RadioGroupCard>
                ) })}
              </RadioGroup>
            </div>}
          </div>

          <DialogFooter className="border-0 border-t border-solid border-border pt-5">
            {setupStep > 1 && <Button variant="outline" onClick={() => setSetupStep((setupStep - 1) as CalibrationSetupStep)}><ArrowLeft /> {t('warmup.back')}</Button>}
            {setupStep < 3
              ? <Button onClick={() => setSetupStep((setupStep + 1) as CalibrationSetupStep)} disabled={setupStep === 2 && (parsedSensitivityInput === null || parsedDpiInput === null || fovPreview === null || !setupCanCalibrate)}>{t('warmup.next')} <ArrowRight /></Button>
              : <Button onClick={saveSetup} disabled={parsedSensitivityInput === null || parsedDpiInput === null || fovPreview === null || !setupCanCalibrate}>{startAfterSetup ? t('calibration.saveStart') : t('calibration.save')}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MotionDialog open={Boolean(view === 'calibration' && resultOpen)} className="modal-backdrop calibration-result-backdrop">{view === 'calibration' && resultOpen && (<MotionDialogPanel className="modal result-modal calibration-result-modal" role="dialog" aria-modal="true" aria-labelledby="calibration-result-title">
            <button className="modal-close" onClick={() => setResultOpen(false)} aria-label={t('common.close')}><X size={18} /></button>
            <Target size={24} className="modal-icon" />
            <div className="panel-label">{t('common.result')}</div>
            <h2 id="calibration-result-title">{t(resultTitleKey)}</h2>
            {calibrationReport && <CalibrationReportView
              report={calibrationReport}
              previous={previousCalibration}
              history={calibrationHistory}
              game={confirmedGameConfig}
              baseSensitivity={baseSensitivity}
              recommendedSensitivity={recommendedSelected}
              recommendedRangeMin={recommendedRangeMin}
              recommendedRangeMax={recommendedRangeMax}
              canRefine={canRefine}
              isRefinement={plan?.mode === 'refinement'}
              onRefine={refineCalibration}
              onRedo={reset}
              onClose={() => setResultOpen(false)}
            />}
          </MotionDialogPanel>)}</MotionDialog>
    </XensiAppShell>
  )
}

export default App
