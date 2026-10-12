import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Crosshair,
  Database,
  Gamepad2,
  Gauge,
  History,
  MonitorUp,
  Mouse,
  Play,
  SlidersHorizontal,
  Stethoscope,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useHomeLighting } from './design/useHomeLighting'
import { TechnicalTitle } from './design/HomeMotion'
import { xensiMotion } from './design/motion'
import { GAME_SENSITIVITY_PROFILE_BY_ID } from './gameSensitivityProfiles'
import { useI18n, type Locale } from './i18n'
import { formatRoutineDuration, getRoutineTotalSeconds, type CustomRoutine } from './routineConfig'
import { calculatePresetCm360, type SensitivityPreset } from './playerProfileStore'
import { usePlayerProfile } from './useSensitivityPreset'
import { useRoutineState } from './useRoutineState'
import { useSessionState } from './sessionRepository'
import { sessionSummary } from './trainingSession'
import { EXERCISES, type ExerciseCategory } from './warmupExercises'
import type { WarmupExercise } from './warmupConfig'
import type { WarmupSessionSummary } from './warmupTelemetry'
import type { AppView } from './routes'
import { homeCopy, type HomeCopy } from './home/homeCopy'
import { HomeAimDemo } from './home/HomeAimDemo'
import { ExerciseArt } from './home/ExerciseArt'
import { HomeConverter } from './home/HomeConverter'
import './home/landing.css'

export type HomeDestination = AppView
type Navigate = (destination: HomeDestination, options?: { warmupEntry?: WarmupExercise | null }) => void
type Props = { onNavigate: Navigate }

const DIAGNOSTIC_ROUTES: Array<{ view: HomeDestination; icon: LucideIcon }> = [
  { view: 'polling', icon: Gauge },
  { view: 'buttons', icon: Mouse },
  { view: 'refresh-rate', icon: MonitorUp },
  { view: 'controller-drift', icon: Gamepad2 },
]
const exerciseName = (id: WarmupExercise) => EXERCISES.find(item => item.id === id)?.name ?? id

/* ---------- shared bits ---------- */

function Reveal({ children, className = '', delay = 0, as = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'section' | 'header' }) {
  const reduced = useReducedMotion()
  const Component = as === 'section' ? motion.section : as === 'header' ? motion.header : motion.div
  return <Component className={className} initial={reduced ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: reduced ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut, delay: reduced ? 0 : delay }}>{children}</Component>
}

function SectionHead({ kicker, title, description, id, aside }: { kicker: string; title: readonly [string, string]; description?: string; id: string; aside?: ReactNode }) {
  return <Reveal as="header" className="xl-head">
    <div>
      <span className="xl-kicker">{kicker}</span>
      <h2 id={id}>{title[0]} <span className="xl-accent">{title[1]}</span></h2>
    </div>
    {(description || aside) && <div className="xl-head-aside">{description && <p>{description}</p>}{aside}</div>}
  </Reveal>
}

/* ---------- hero ---------- */

function HomeHero({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  const reduced = useReducedMotion()
  const enter = (delay: number) => ({ initial: reduced ? false as const : { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: reduced ? 0 : xensiMotion.durations.reveal, delay: reduced ? 0 : delay, ease: xensiMotion.easings.easeOut } })
  return <section className="xl-hero" aria-labelledby="home-title" data-home-hero data-light-surface>
    <div className="xl-hero-media" aria-hidden="true"><div className="xl-hero-photo" /><div className="xl-hero-scan" /><div className="xl-hero-light" /></div>
    <div className="xl-wrap xl-hero-grid">
      <div className="xl-hero-copy">
        <h1 id="home-title"><TechnicalTitle>{copy.heroTitleOne}</TechnicalTitle> <TechnicalTitle index={1}>{copy.heroTitleTwo}</TechnicalTitle></h1>
        <motion.p {...enter(xensiMotion.hero.description)}>{copy.heroDescription}</motion.p>
        <motion.div className="xl-hero-actions" {...enter(xensiMotion.hero.actions)}>
          <button type="button" className="xl-btn xl-btn-primary xl-btn-lg" onClick={() => onNavigate('warmup')}>{copy.primaryCta}<ArrowRight size={18} /></button>
          <button type="button" className="xl-btn xl-btn-outline xl-btn-lg" onClick={() => onNavigate('buttons')}>{copy.secondaryCta}<Mouse size={17} /></button>
        </motion.div>
      </div>
      <motion.div className="xl-hero-demo" initial={reduced ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : xensiMotion.durations.cinematic, delay: reduced ? 0 : .3, ease: xensiMotion.easings.easeOut }}>
        <HomeAimDemo copy={copy} onTrain={() => onNavigate('warmup', { warmupEntry: 'reflex' })} />
      </motion.div>
    </div>
  </section>
}

/* ---------- loop ---------- */

const LOOP_STEPS: Array<{ icon: LucideIcon; view: HomeDestination }> = [
  { icon: SlidersHorizontal, view: 'calibration' },
  { icon: Crosshair, view: 'warmup' },
  { icon: Stethoscope, view: 'diagnostics' },
  { icon: Database, view: 'analysis' },
  { icon: BarChart3, view: 'analysis' },
  { icon: TrendingUp, view: 'routine' },
]

function HomeLoop({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 55%'] })
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: .4 })
  const scale = useTransform(progress, value => reduced ? 1 : value)
  const [active, setActive] = useState(reduced ? LOOP_STEPS.length - 1 : -1)
  useMotionValueEvent(scrollYProgress, 'change', value => {
    if (reduced) return
    const next = Math.min(LOOP_STEPS.length - 1, Math.floor(value * LOOP_STEPS.length + .15) - 1)
    setActive(current => current === next ? current : next)
  })
  return <section ref={ref} className="xl-section xl-loop" aria-labelledby="home-loop-title">
    <div className="xl-wrap">
      <SectionHead id="home-loop-title" kicker={copy.loopKicker} title={copy.loopTitle} description={copy.loopDescription} />
      <div className="xl-loop-rail">
        <div className="xl-loop-track" aria-hidden="true"><motion.i style={{ scaleX: scale }} /></div>
        <ol>
          {copy.loop.map(([title, text], index) => {
            const { icon: Icon, view } = LOOP_STEPS[index]
            return <li key={title} data-active={index <= active ? 'true' : 'false'} style={{ '--i': index } as CSSProperties}>
              <button type="button" onClick={() => onNavigate(view)}>
                <span className="xl-loop-node"><Icon size={18} /></span>
                <small>{String(index + 1).padStart(2, '0')}</small>
                <b>{title}</b>
                <p>{text}</p>
              </button>
            </li>
          })}
        </ol>
      </div>
    </div>
  </section>
}

/* ---------- training showcase ---------- */

const CATEGORY_ORDER: ExerciseCategory[] = ['precision', 'tracking', 'reaction', 'audio']
const CATEGORY_KEYS = { precision: 'warmup.category.precision', tracking: 'warmup.category.tracking', reaction: 'warmup.category.reaction', audio: 'spatial.category' } as const

function HomeTraining({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  const { t } = useI18n()
  const reduced = useReducedMotion()
  const [filter, setFilter] = useState<ExerciseCategory | 'all'>('all')
  const visible = filter === 'all' ? EXERCISES : EXERCISES.filter(item => item.category === filter)
  return <section className="xl-section xl-train" aria-labelledby="home-train-title">
    <div className="xl-wrap">
      <SectionHead id="home-train-title" kicker={`${copy.trainKicker} · ${copy.trainCount.replace('{count}', String(EXERCISES.length))}`} title={copy.trainTitle} description={copy.trainDescription}
        aside={<div className="xl-filters" role="group" aria-label={copy.trainFilterLabel}>
          {(['all', ...CATEGORY_ORDER] as const).map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {filter === item && <motion.span layoutId={reduced ? undefined : 'xl-filter-pill'} className="xl-filter-pill" transition={xensiMotion.springs.springLayout} />}
            <span>{item === 'all' ? copy.trainAll : t(CATEGORY_KEYS[item])}</span>
          </button>)}
        </div>} />
      <motion.ul className="xl-ex-grid" layout={!reduced}>
        {visible.map((exercise, index) => {
          const Icon = exercise.icon
          return <motion.li key={exercise.id} layout={!reduced} initial={reduced ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: reduced ? 0 : xensiMotion.durations.reveal, delay: reduced ? 0 : (index % 3) * .06, ease: xensiMotion.easings.easeOut }}>
            <button type="button" className="xl-ex-card" onClick={() => onNavigate('warmup', { warmupEntry: exercise.id })} data-exercise={exercise.id}>
              <ExerciseArt id={exercise.id} />
              <span className="xl-ex-num" aria-hidden="true">{String(EXERCISES.indexOf(exercise) + 1).padStart(2, '0')}</span>
              <span className="xl-ex-meta">
                <span className="xl-ex-cat"><Icon size={13} />{t(CATEGORY_KEYS[exercise.category])}</span>
                <b>{exercise.name}</b>
                <small>{t(exercise.description)}</small>
              </span>
              <span className="xl-ex-go">{copy.trainOpen}<Play size={13} /></span>
            </button>
          </motion.li>
        })}
      </motion.ul>
      <Reveal className="xl-row-actions">
        <button type="button" className="xl-btn xl-btn-primary" onClick={() => onNavigate('warmup')}>{copy.trainCta}<ArrowRight size={16} /></button>
        <button type="button" className="xl-btn xl-btn-outline" onClick={() => onNavigate('routine')}>{copy.trainRoutines}<History size={16} /></button>
      </Reveal>
    </div>
  </section>
}

/* ---------- tools ---------- */

const CALIBRATOR_BARS = [38, 56, 72, 64, 86, 78, 52, 44, 30]
const FINALISTS = new Set([3, 4, 5])
const PICK = 4

function HomeTools({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  return <section className="xl-section xl-tools" aria-labelledby="home-tools-title">
    <div className="xl-wrap">
      <SectionHead id="home-tools-title" kicker={copy.toolsKicker} title={copy.toolsTitle} />
      <div className="xl-bento">
        <Reveal className="xl-panel xl-calib">
          <span className="xl-tag"><SlidersHorizontal size={14} />{copy.calibratorTag}</span>
          <h3>{copy.calibratorTitle}</h3>
          <p>{copy.calibratorDescription}</p>
          <figure className="xl-calib-fig" aria-label={copy.calibratorFigure}>
            <div className="xl-calib-bars">
              {CALIBRATOR_BARS.map((height, index) => <i key={index} data-finalist={FINALISTS.has(index)} data-pick={index === PICK} style={{ '--h': `${height}%`, '--i': index } as CSSProperties} />)}
            </div>
            <ol>{copy.calibratorSteps.map((step, index) => <li key={step} style={{ '--i': index } as CSSProperties}>{step}</li>)}</ol>
            <figcaption>{copy.calibratorFigure}</figcaption>
          </figure>
          <button type="button" className="xl-btn xl-btn-primary" onClick={() => onNavigate('calibration')}>{copy.calibratorCta}<ArrowRight size={16} /></button>
        </Reveal>
        <Reveal className="xl-panel xl-convert" delay={.08}>
          <span className="xl-tag"><Activity size={14} />{copy.converterTag}</span>
          <h3>{copy.converterTitle}</h3>
          <HomeConverter copy={copy} onOpen={() => onNavigate('converter')} />
        </Reveal>
        <Reveal className="xl-panel xl-diag" delay={.12}>
          <div className="xl-diag-head">
            <span className="xl-tag is-mint"><Stethoscope size={14} />{copy.diagnosticsTag}</span>
            <h3>{copy.diagnosticsTitle}</h3>
            <button type="button" className="xl-link" onClick={() => onNavigate('diagnostics')}>{copy.diagnosticsCta}<ArrowRight size={15} /></button>
          </div>
          <ul>
            {copy.diagnostics.map(([title, text], index) => {
              const { icon: Icon, view } = DIAGNOSTIC_ROUTES[index]
              return <li key={title}><button type="button" onClick={() => onNavigate(view)}>
                <span className="xl-diag-icon"><Icon size={18} /></span>
                <svg className="xl-wave" viewBox="0 0 120 24" aria-hidden="true"><path d={index % 2 ? 'M0 12h18l4-8 6 16 5-12 4 4h83' : 'M0 12h10l3-3 3 6 3-6 3 6 3-6 3 6 3-3h89'} /></svg>
                <b>{title}</b>
                <small>{text}</small>
                <ArrowUpRight className="xl-diag-go" size={16} />
              </button></li>
            })}
          </ul>
        </Reveal>
      </div>
    </div>
  </section>
}

/* ---------- analysis teaser ---------- */

const CHART = [62, 58, 66, 61, 69, 64, 71, 68, 74, 79, 76, 82, 80, 85]
function chartPath(values: number[]) {
  const w = 560, h = 200, min = 50, max = 90
  return values.map((value, index) => `${index ? 'L' : 'M'}${(index / (values.length - 1) * w).toFixed(1)} ${(h - (value - min) / (max - min) * h).toFixed(1)}`).join(' ')
}

function HomeAnalysis({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  const reduced = useReducedMotion()
  const path = chartPath(CHART)
  return <section className="xl-section xl-analysis" aria-labelledby="home-analysis-title">
    <div className="xl-wrap xl-analysis-grid">
      <Reveal className="xl-analysis-copy">
        <span className="xl-kicker">{copy.analysisKicker}</span>
        <h2 id="home-analysis-title">{copy.analysisTitle[0]} <span className="xl-accent">{copy.analysisTitle[1]}</span></h2>
        <p>{copy.analysisDescription}</p>
        <ul>{copy.analysisPoints.map(point => <li key={point}><i />{point}</li>)}</ul>
        <button type="button" className="xl-btn xl-btn-outline" onClick={() => onNavigate('analysis')}>{copy.analysisCta}<ArrowRight size={16} /></button>
      </Reveal>
      <Reveal className="xl-panel xl-chart" delay={.1}>
        <header><span className="xl-tag is-muted"><BarChart3 size={14} />{copy.analysisChartLabel}</span><small>{copy.analysisChartHint}</small></header>
        <svg viewBox="0 0 560 220" role="img" aria-label={`${copy.analysisChartLabel}. ${copy.analysisChartHint}`}>
          <defs><linearGradient id="xl-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff4055" stopOpacity=".28" /><stop offset="1" stopColor="#ff4055" stopOpacity="0" /></linearGradient></defs>
          {[0, 1, 2, 3].map(line => <line key={line} x1="0" x2="560" y1={line * 66 + 2} y2={line * 66 + 2} className="xl-chart-grid" />)}
          <line x1={8 / 13 * 560} x2={8 / 13 * 560} y1="0" y2="200" className="xl-chart-marker" />
          <text x={8 / 13 * 560 + 8} y="16" className="xl-chart-label">{copy.analysisSensChange}</text>
          <motion.path d={`${path} L560 200 L0 200 Z`} fill="url(#xl-chart-fill)" initial={reduced ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: .6 }} />
          <motion.path d={path} className="xl-chart-line" initial={reduced ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true, amount: .4 }} transition={{ duration: reduced ? 0 : 1.4, ease: xensiMotion.easings.easeInOut }} />
          <circle cx="560" cy={200 - (CHART[CHART.length - 1] - 50) / 40 * 200} r="5" className="xl-chart-dot" />
        </svg>
      </Reveal>
    </div>
  </section>
}

/* ---------- progress (only with real data) ---------- */

type LastTraining = WarmupSessionSummary & { exercise: WarmupExercise }

function relativeDate(value: string | undefined, copy: HomeCopy) {
  if (!value) return copy.noDate
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000))
  return days === 0 ? copy.today : copy.daysAgo.replace('{days}', String(days))
}
const formatPercent = (value: number | undefined) => Number.isFinite(value) ? `${Math.round(value ?? 0)}%` : '—'
const formatMs = (value: number | undefined) => Number.isFinite(value) && (value ?? 0) > 0 ? `${Math.round(value ?? 0)}ms` : '—'
const formatSensitivity = (value: number) => value >= 10 ? value.toFixed(2) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')

function ProgressCard({ label, title, description, rows, cta, icon: Icon, onClick }: { label: string; title: string; description: string; rows: Array<[string, string]>; cta: string; icon: LucideIcon; onClick: () => void }) {
  return <Reveal className="xl-panel xl-progress-card">
    <header><span className="xl-progress-icon"><Icon size={17} /></span><span>{label}</span></header>
    <h3>{title}</h3>
    <p>{description}</p>
    {rows.length > 0 && <dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>}
    <button type="button" className="xl-link" onClick={onClick}>{cta}<ArrowRight size={15} /></button>
  </Reveal>
}

function HomeProgress({ copy, training, preset, routine, onNavigate }: { copy: HomeCopy; training: LastTraining | null; preset: SensitivityPreset | null; routine: CustomRoutine | null; onNavigate: Navigate }) {
  if (!training && !preset && !routine) return null
  const presetGame = preset ? GAME_SENSITIVITY_PROFILE_BY_ID[preset.gameId] : null
  const cm360 = preset ? calculatePresetCm360(preset) : null
  return <section className="xl-section xl-progress" aria-labelledby="home-progress-title">
    <div className="xl-wrap">
      <SectionHead id="home-progress-title" kicker={copy.progressKicker} title={copy.progressTitle} />
      <div className="xl-progress-grid">
        {training && <ProgressCard label={copy.lastTraining} title={exerciseName(training.exercise)} description={relativeDate(training.completedAt, copy)} icon={Play} cta={copy.resumeTraining} onClick={() => onNavigate('warmup', { warmupEntry: training.exercise })}
          rows={[[copy.accuracy, formatPercent(training.accuracy)], [copy.reaction, formatMs(training.reactionTimeMs)], ['Score', String(training.score)]]} />}
        {preset && <ProgressCard label={copy.preset} title={preset.name || presetGame?.shortName || presetGame?.name || 'Preset'} description={`${presetGame?.name ?? preset.gameId}${cm360 ? ` · ${cm360.toFixed(1)} cm/360` : ''}`} icon={Target} cta={copy.viewPresets} onClick={() => onNavigate('profile')}
          rows={[[copy.dpi, String(preset.dpi)], [copy.sens, formatSensitivity(preset.sensitivity)], [copy.edpi, String(Math.round(preset.dpi * preset.sensitivity))]]} />}
        {routine && <ProgressCard label={copy.routine} title={routine.name} description={routine.items.map(item => exerciseName(item.modeId)).slice(0, 3).join(' · ')} icon={History} cta={copy.viewRoutine} onClick={() => onNavigate('routine')}
          rows={[[copy.duration, formatRoutineDuration(getRoutineTotalSeconds(routine.items))], [copy.exercises, String(routine.items.length)]]} />}
      </div>
    </div>
  </section>
}

/* ---------- final CTA ---------- */

function HomeFinal({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  return <section className="xl-final" aria-labelledby="home-final-title" data-light-surface>
    <div className="xl-final-glow" aria-hidden="true" />
    <div className="xl-final-reticle" aria-hidden="true"><i /><i /></div>
    <Reveal className="xl-wrap xl-final-inner">
      <span className="xl-kicker">{copy.finalKicker}</span>
      <h2 id="home-final-title">{copy.finalTitle[0]} <span className="xl-accent">{copy.finalTitle[1]}</span></h2>
      <p>{copy.finalDescription}</p>
      <div className="xl-hero-actions">
        <button type="button" className="xl-btn xl-btn-primary xl-btn-lg" onClick={() => onNavigate('warmup')}>{copy.primaryCta}<ArrowRight size={18} /></button>
        <button type="button" className="xl-btn xl-btn-outline xl-btn-lg" onClick={() => onNavigate('calibration')}>{copy.finalSecondary}<SlidersHorizontal size={17} /></button>
      </div>
    </Reveal>
  </section>
}

/* ---------- page ---------- */

export function Home({ onNavigate }: Props) {
  const homeRef = useRef<HTMLElement>(null)
  useHomeLighting(homeRef)
  const { locale } = useI18n()
  const copy = homeCopy[locale as Locale]
  const profile = usePlayerProfile()
  const routines = useRoutineState()
  const sessions = useSessionState()

  const summary = useMemo(() => {
    const latest = sessions.status === 'ready' ? sessions.items.find(session => session.status === 'completed') : null
    const result = latest ? sessionSummary(latest) : null
    return {
      training: result && latest ? { ...result, exercise: latest.exerciseId } : null,
      preset: profile.presets.find(preset => preset.isPrimary) ?? profile.presets[0] ?? null,
      routine: routines.status === 'ready' ? routines.items[0] ?? null : null,
    }
  }, [profile.presets, routines, sessions])

  return <section ref={homeRef} className="xensi-landing xensi-premium-home" data-page-motion>
    <HomeHero copy={copy} onNavigate={onNavigate} />
    <HomeProgress copy={copy} training={summary.training} preset={summary.preset} routine={summary.routine} onNavigate={onNavigate} />
    <HomeLoop copy={copy} onNavigate={onNavigate} />
    <HomeTraining copy={copy} onNavigate={onNavigate} />
    <HomeTools copy={copy} onNavigate={onNavigate} />
    <HomeAnalysis copy={copy} onNavigate={onNavigate} />
    <HomeFinal copy={copy} onNavigate={onNavigate} />
  </section>
}
