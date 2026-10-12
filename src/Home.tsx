import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Gamepad2, Gauge, History, MonitorUp, Mouse, MousePointer2, Play, SlidersHorizontal, Target, Users, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GAME_SENSITIVITY_PROFILES, GAME_SENSITIVITY_PROFILE_BY_ID } from './gameSensitivityProfiles'
import { calculateCm360, convertSensitivity } from './sensitivityConversionEngine'
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
import './home/radar.css'

export type HomeDestination = AppView
type Navigate = (destination: HomeDestination, options?: { warmupEntry?: WarmupExercise | null }) => void
type Props = { onNavigate: Navigate }

const CATEGORY_KEYS: Record<ExerciseCategory, 'warmup.category.precision' | 'warmup.category.tracking' | 'warmup.category.reaction' | 'spatial.category'> = {
  precision: 'warmup.category.precision', tracking: 'warmup.category.tracking', reaction: 'warmup.category.reaction', audio: 'spatial.category',
}
const exerciseName = (id: WarmupExercise) => EXERCISES.find(item => item.id === id)?.name ?? id
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

// Bearings (clockwise from north) shared by the hero radar and the corner instrument.
// Calibrator and converter share one section, so both point at the tools act.
const MODULES = [
  { deg: 62, side: 'r', target: 'xr-minigames' },
  { deg: 100, side: 'r', target: 'xr-tools', part: 'calib' },
  { deg: 138, side: 'r', target: 'xr-tools', part: 'conv' },
  { deg: 222, side: 'l', target: 'xr-setup' },
  { deg: 290, side: 'l', target: 'xr-squad' },
] as const
const polar = (deg: number, radius: number): CSSProperties => {
  const angle = deg * Math.PI / 180
  return { '--bx': `${(50 + radius * Math.sin(angle) * 100).toFixed(2)}%`, '--by': `${(50 - radius * Math.cos(angle) * 100).toFixed(2)}%` } as CSSProperties
}

/* ---------- minigame previews: each loops its own mechanic ---------- */

const STRIP_ORDER: WarmupExercise[] = ['gridshot', 'tracking', 'switch', 'flick', 'micro_flick', 'reflex', 'strafetrack', 'sniper-reaction', 'spatial_hunt']
const dot = (x: string, y: string, delay?: string) => <i className="d" style={{ '--x': x, '--y': y, '--dl': delay } as CSSProperties} />
const PREVIEWS: Record<WarmupExercise, { kind: string; body: ReactNode }> = {
  gridshot: { kind: 'gridshot', body: <>{dot('30%', '34%')}{dot('62%', '26%', '.8s')}{dot('47%', '58%', '1.6s')}</> },
  tracking: { kind: 'tracking', body: <><i className="orbit" /><i className="d" /><i className="x" /></> },
  switch: { kind: 'switch', body: <><i className="d a" /><i className="d b" /><i className="x" /></> },
  flick: { kind: 'flick', body: <>{dot('22%', '26%')}{dot('74%', '36%', '.6s')}{dot('40%', '64%', '1.2s')}{dot('66%', '70%', '1.8s')}<i className="x" /></> },
  micro_flick: { kind: 'micro', body: <><i className="zone" />{dot('46%', '44%')}{dot('55%', '49%', '.45s')}{dot('50%', '38%', '.9s')}<i className="x" /></> },
  reflex: { kind: 'reflex', body: <><i className="ring" /><i className="d" /></> },
  strafetrack: { kind: 'strafe', body: <><i className="rail" /><i className="d" /><i className="x" /></> },
  'sniper-reaction': { kind: 'sniper', body: <><i className="gap" /><i className="d" /><i className="scope" /></> },
  spatial_hunt: { kind: 'spatial', body: <><i className="w" /><i className="w" style={{ '--dl': '.9s' } as CSSProperties} /><i className="w" style={{ '--dl': '1.8s' } as CSSProperties} /><i className="src" /></> },
}

/* ---------- sections ---------- */

function HomeHero({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  const games = GAME_SENSITIVITY_PROFILES
  const shown = games.slice(0, 6)
  return <section className="xr-hero" data-xr-hero aria-labelledby="home-title">
    <div className="xr-stage">
      <div className="xr-bg" aria-hidden="true">
        <div className="xr-dots" data-xr-dots />
        <div className="xr-radar" data-xr-radar>
          <span className="xr-ring" /><span className="xr-ring" /><span className="xr-ring" /><span className="xr-ring" />
          <span className="xr-axis" /><span className="xr-axis is-v" />
          <div className="xr-sweep" data-xr-sweep />
          {MODULES.map((module, index) => <span key={module.deg} className="xr-blip" data-side={module.side} data-deg={module.deg} style={polar(module.deg, .32)}>
            <i /><span><b>{copy.blips[index][0]}</b>{fill(copy.blips[index][1], { count: EXERCISES.length })}</span>
          </span>)}
        </div>
        <div className="xr-glow" />
        <div className="xr-glints" data-xr-glints><i style={{ left: '8%', top: '62%' }} /><i style={{ left: '78%', top: '12%' }} /></div>
        <div className="xr-grain" />
      </div>
      <div className="xr-wrap xr-copy" data-xr-copy>
        <h1 id="home-title"><span>{copy.heroTitleOne}</span><span>{copy.heroTitleTwo} <span className="xr-red">{copy.heroTitleAccent}</span></span></h1>
        <p className="xr-lead">{copy.heroDescription}</p>
        <div className="xr-ctas">
          <Button size="lg" className="xr-btn-primary h-[54px] rounded-[10px] px-[26px] text-base" onClick={() => onNavigate('warmup')}>{copy.primaryCta}<ArrowRight /></Button>
          <Button size="lg" variant="outline" className="h-[54px] rounded-[10px] px-[26px] text-base" onClick={() => onNavigate('calibration')}><SlidersHorizontal />{copy.secondaryCta}</Button>
          <p className="xr-note">{copy.heroNoAccount}</p>
        </div>
      </div>
      <div className="xr-games" data-xr-games>
        <div className="xr-wrap"><small>{copy.gamesLabel}</small>
          <ul>{shown.map(game => <li key={game.id}>{game.name}</li>)}{games.length > shown.length && <li>{fill(copy.gamesMore, { count: games.length - shown.length })}</li>}</ul>
        </div>
      </div>
    </div>
  </section>
}

function HomeMinigames({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  const { t } = useI18n()
  const items = STRIP_ORDER.map(id => EXERCISES.find(item => item.id === id)).filter(item => item !== undefined)
  return <section className="xr-chapter" aria-labelledby="home-essence-title">
    <div className="xr-wrap">
      <div className="xr-head" data-xr-in>
        <h2 id="home-essence-title">{copy.essenceTitle[0]} <span className="xr-red">{copy.essenceTitle[1]}</span></h2>
        <p>{copy.essenceDescription}</p>
      </div>
      <div className="xr-mg" id="xr-minigames" role="list" data-xr-mg data-xr-stagger style={{ '--xr-step': '60ms' } as CSSProperties}>
        {items.map((exercise, index) => {
          const preview = PREVIEWS[exercise.id]
          return <button key={exercise.id} type="button" role="listitem" className={`xr-mg-slice${index === 0 ? ' is-open' : ''}`} style={{ '--i': index } as CSSProperties} data-exercise={exercise.id}
            aria-label={`${copy.play} ${exercise.name}`} onClick={() => onNavigate('warmup', { warmupEntry: exercise.id })}>
            <span className={`xr-pv xr-pv-${preview.kind}`} aria-hidden="true">{preview.body}</span>
            <span className="xr-mg-name" aria-hidden="true">{exercise.name}</span>
            <span className="xr-mg-info">
              <small>{t(CATEGORY_KEYS[exercise.category])}</small>
              <b>{exercise.name}</b>
              <p>{t(exercise.description)}</p>
              <span className="xr-mg-go">{copy.play}<ArrowRight size={15} /></span>
            </span>
          </button>
        })}
      </div>
      <div className="xr-mg-foot"><span>{fill(copy.minigamesFoot, { count: EXERCISES.length })}</span><button type="button" className="xr-link" onClick={() => onNavigate('routine')}>{copy.routineCta}<ArrowRight size={17} /></button></div>
    </div>
  </section>
}

const RULER = { candidates: [.38, .42, .46, .50, .55], finalists: [.44, .48], pick: .46 }
const EXAMPLE = { from: 'cs2', to: 'valorant', sensitivity: .5, dpi: 1600 } as const

function HomeTools({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  const { locale } = useI18n()
  const source = GAME_SENSITIVITY_PROFILE_BY_ID[EXAMPLE.from], target = GAME_SENSITIVITY_PROFILE_BY_ID[EXAMPLE.to]
  // The example comes from the audited conversion engine, never from a hardcoded figure.
  const converted = convertSensitivity(EXAMPLE.sensitivity, source, target, EXAMPLE.dpi, EXAMPLE.dpi)?.configurableSensitivity ?? null
  const cm360 = calculateCm360(source, EXAMPLE.sensitivity, EXAMPLE.dpi)
  // Same formatting as the converter: up to three decimals, trailing zeros trimmed.
  const toText = converted === null ? '' : converted >= 10 ? converted.toFixed(2) : converted.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  const toDecimals = toText.split('.')[1]?.length ?? 0
  const cm = cm360 === null ? '' : cm360.toLocaleString(locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  return <section className="xr-tools" id="xr-tools" data-xr-tools aria-label={`${copy.calibTitle} ${copy.convTitle}`}>
    <div className="xr-tools-stage">
      <div className="xr-wrap">
        <div className="xr-tools-grid">
          <article className="xr-tool">
            <h3>{copy.calibTitle}</h3>
            <p>{copy.calibDescription}</p>
            <figure className="xr-ruler" data-xr-ruler data-stage="0" aria-label={copy.calibFigure}>
              <div className="xr-ruler-axis">
                {RULER.candidates.map(value => <i key={`c${value}`} className="c" style={{ '--v': value } as CSSProperties} />)}
                {RULER.finalists.map(value => <i key={`f${value}`} className="f" style={{ '--v': value } as CSSProperties} />)}
                <span className="xr-pick" style={{ '--v': RULER.pick } as CSSProperties}><b>{RULER.pick.toFixed(2)}</b><small>{copy.calibConfidence}</small></span>
              </div>
              <div className="xr-scale" aria-hidden="true"><span>0.30</span><span>0.45</span><span>0.60</span></div>
              <ol className="xr-steps">{copy.calibSteps.map(step => <li key={step}>{step}</li>)}</ol>
            </figure>
            <button type="button" className="xr-link" onClick={() => onNavigate('calibration')}>{copy.calibCta}<ArrowRight size={17} /></button>
          </article>
          <article className="xr-tool">
            <h3>{copy.convTitle}</h3>
            <p>{copy.convDescription}</p>
            {converted !== null && <>
              <div className="xr-equation" role="img" aria-label={fill(copy.convAria, { from: EXAMPLE.sensitivity, source: source.name, to: toText, target: target.name, dpi: EXAMPLE.dpi })}>
                <div><small>{source.name}</small><b data-xr-num={EXAMPLE.sensitivity} data-dec="2">{EXAMPLE.sensitivity.toFixed(2)}</b></div>
                <span className="xr-eq-arrow" aria-hidden="true" />
                <div className="is-to"><small>{target.name}</small><b data-xr-num={converted} data-dec={toDecimals}>{toText}</b></div>
              </div>
              <p className="xr-eq-note">{fill(copy.convNote, { dpi: EXAMPLE.dpi, cm })}</p>
            </>}
            <button type="button" className="xr-link" onClick={() => onNavigate('converter')}>{copy.convCta}<ArrowRight size={17} /></button>
          </article>
        </div>
      </div>
    </div>
  </section>
}

function HomeManifesto({ copy }: { copy: HomeCopy }) {
  return <section className="xr-mani" data-xr-mani aria-label="XENSI">
    <div className="xr-wrap"><p>{copy.manifesto[0]} <span className="xr-red">{copy.manifesto[1]}</span></p></div>
  </section>
}

const SETUP_ICONS: LucideIcon[] = [MousePointer2, Mouse, MonitorUp, Gamepad2]
const SAMPLE_ROOMS = [
  { avatar: 'neon-wolf-comms', slots: [true, true, true, false, false] },
  { avatar: 'neon-owl-scout', slots: [true, true, true, true, false] },
  { avatar: 'neon-tiger-pounce', slots: [true, false, false] },
]
const avatarUrl = (name: string) => `${import.meta.env.BASE_URL}avatars/individual/${name}.png`

function HomeDoors({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  return <section className="xr-chapter" aria-labelledby="home-doors-title">
    <div className="xr-wrap">
      <div className="xr-head" data-xr-in>
        <h2 id="home-doors-title">{copy.doorsTitle[0]} <span className="xr-red">{copy.doorsTitle[1]}</span></h2>
        <p>{copy.doorsDescription}</p>
      </div>
      <div className="xr-doors" data-xr-stagger style={{ '--xr-step': '90ms' } as CSSProperties}>
        <div className="xr-door" id="xr-setup" data-xr-door style={{ '--i': 0 } as CSSProperties}>
          <div className="xr-door-copy">
            <span className="xr-door-icon"><Gauge size={22} /></span>
            <h3>{copy.setupTitle}</h3>
            <p>{copy.setupText}</p>
            <button type="button" className="xr-link" onClick={() => onNavigate('diagnostics')}>{copy.setupCta}<ArrowRight size={17} /></button>
          </div>
          <ul className="xr-list">{copy.setupChecks.map(([title, text], index) => {
            const Icon = SETUP_ICONS[index]
            return <li key={title} style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}><span className="ci"><Icon size={17} /></span><span><b>{title}</b><small>{text}</small></span></li>
          })}</ul>
        </div>
        <div className="xr-door" id="xr-squad" data-xr-door style={{ '--i': 1 } as CSSProperties}>
          <div className="xr-door-copy">
            <span className="xr-door-icon"><Users size={22} /></span>
            <h3>{copy.squadTitle} <span className="xr-new">{copy.squadNew}</span></h3>
            <p>{copy.squadText}</p>
            <button type="button" className="xr-link" onClick={() => onNavigate('squad')}>{copy.squadCta}<ArrowRight size={17} /></button>
          </div>
          <div>
            <ul className="xr-list">{copy.squadRooms.map(([title, text], index) => <li key={title}>
              <img src={avatarUrl(SAMPLE_ROOMS[index].avatar)} alt="" />
              <span><b>{title}</b><small>{text}</small></span>
              <span className="xr-slots" aria-hidden="true">{SAMPLE_ROOMS[index].slots.map((taken, slot) => <i key={slot} className={taken ? '' : 'is-free'} />)}</span>
            </li>)}</ul>
            <p className="xr-example">{copy.squadExample}</p>
          </div>
        </div>
      </div>
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

function ProgressItem({ label, title, description, rows, cta, icon: Icon, onClick }: { label: string; title: string; description: string; rows: Array<[string, string]>; cta: string; icon: LucideIcon; onClick: () => void }) {
  return <article className="xr-progress-item">
    <span><Icon size={15} />{label}</span>
    <h3>{title}</h3>
    <p>{description}</p>
    {rows.length > 0 && <dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>}
    <button type="button" className="xr-link" onClick={onClick}>{cta}<ArrowRight size={15} /></button>
  </article>
}

function HomeProgress({ copy, training, preset, routine, onNavigate }: { copy: HomeCopy; training: LastTraining | null; preset: SensitivityPreset | null; routine: CustomRoutine | null; onNavigate: Navigate }) {
  if (!training && !preset && !routine) return null
  const presetGame = preset ? GAME_SENSITIVITY_PROFILE_BY_ID[preset.gameId] : null
  const cm360 = preset ? calculatePresetCm360(preset) : null
  return <section className="xr-chapter xr-progress" aria-labelledby="home-progress-title">
    <div className="xr-wrap">
      <div className="xr-head" data-xr-in><h2 id="home-progress-title">{copy.progressTitle[0]} <span className="xr-red">{copy.progressTitle[1]}</span></h2></div>
      <div className="xr-progress-grid">
        {training && <ProgressItem label={copy.lastTraining} title={exerciseName(training.exercise)} description={relativeDate(training.completedAt, copy)} icon={Play} cta={copy.resumeTraining} onClick={() => onNavigate('warmup', { warmupEntry: training.exercise })}
          rows={[[copy.accuracy, formatPercent(training.accuracy)], [copy.reaction, formatMs(training.reactionTimeMs)], ['Score', String(training.score)]]} />}
        {preset && <ProgressItem label={copy.preset} title={preset.name || presetGame?.shortName || presetGame?.name || 'Preset'} description={`${presetGame?.name ?? preset.gameId}${cm360 ? ` · ${cm360.toFixed(1)} cm/360` : ''}`} icon={Target} cta={copy.viewPresets} onClick={() => onNavigate('profile')}
          rows={[[copy.dpi, String(preset.dpi)], [copy.sens, formatSensitivity(preset.sensitivity)], [copy.edpi, String(Math.round(preset.dpi * preset.sensitivity))]]} />}
        {routine && <ProgressItem label={copy.routine} title={routine.name} description={routine.items.map(item => exerciseName(item.modeId)).slice(0, 3).join(' · ')} icon={History} cta={copy.viewRoutine} onClick={() => onNavigate('routine')}
          rows={[[copy.duration, formatRoutineDuration(getRoutineTotalSeconds(routine.items))], [copy.exercises, String(routine.items.length)]]} />}
      </div>
    </div>
  </section>
}

function HomeFinal({ copy, onNavigate }: { copy: HomeCopy; onNavigate: Navigate }) {
  return <section className="xr-final" data-xr-final aria-labelledby="home-final-title">
    <div className="xr-final-radar" data-xr-final-radar aria-hidden="true">
      <span className="xr-ring" /><span className="xr-ring" /><span className="xr-ring" /><span className="xr-ring" />
      <div className="xr-sweep" data-xr-final-sweep />
    </div>
    <div className="xr-wrap" data-xr-in>
      <h2 id="home-final-title">{copy.finalTitle[0]}<span>{copy.finalTitle[1]}</span></h2>
      <p>{copy.finalDescription}</p>
      <div className="xr-ctas">
        <Button size="lg" className="xr-btn-primary h-[54px] rounded-[10px] px-[26px] text-base" onClick={() => onNavigate('warmup')}>{copy.primaryCta}<ArrowRight /></Button>
        <Button size="lg" variant="outline" className="h-[54px] rounded-[10px] px-[26px] text-base" onClick={() => onNavigate('calibration')}><SlidersHorizontal />{copy.secondaryCta}</Button>
      </div>
    </div>
  </section>
}

function Instrument({ copy }: { copy: HomeCopy }) {
  return createPortal(<nav className="xr-instrument" aria-label={copy.instrumentLabel} data-xr-instrument>
    <span className="xr-iring" style={{ width: '100%', height: '100%' }} /><span className="xr-iring" style={{ width: '64%', height: '64%' }} /><span className="xr-iring" style={{ width: '30%', height: '30%' }} />
    <span className="xr-isweep" data-xr-isweep />
    {MODULES.map((module, index) => <button key={module.deg} type="button" aria-label={copy.blips[index][0]} data-target={module.target} data-part={'part' in module ? module.part : undefined} style={polar(module.deg, .36)} />)}
    <span className="xr-tip" data-xr-tip />
  </nav>, document.body)
}

/* ---------- scroll choreography: one rAF loop, direct style writes, no React state per frame ---------- */

function useRadarScroll(rootRef: RefObject<HTMLDivElement | null>, reduced: boolean) {
  useEffect(() => {
    const root = rootRef.current
    const found = document.querySelector<HTMLElement>('[data-xr-instrument]')
    if (!root || !found) return
    const inst: HTMLElement = found
    const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!
    const hero = q('[data-xr-hero]'), stage = hero.firstElementChild as HTMLElement, radar = q('[data-xr-radar]'), sweep = q('[data-xr-sweep]')
    const dots = q('[data-xr-dots]'), glints = q('[data-xr-glints]'), copyEl = q('[data-xr-copy]'), games = q('[data-xr-games]')
    const blips = [...root.querySelectorAll<HTMLElement>('.xr-blip')]
    const tools = q('[data-xr-tools]'), ruler = q('[data-xr-ruler]'), nums = [...root.querySelectorAll<HTMLElement>('[data-xr-num]')]
    const mani = q('[data-xr-mani]'), mg = q('[data-xr-mg]'), finalSec = q('[data-xr-final]'), finalRadar = q('[data-xr-final-radar]'), finalSweep = q('[data-xr-final-sweep]')
    const instSweep = inst.querySelector<HTMLElement>('[data-xr-isweep]')!, tip = inst.querySelector<HTMLElement>('[data-xr-tip]')!
    const instButtons = [...inst.querySelectorAll<HTMLButtonElement>('button')]
    const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x
    const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x) }
    const pinned = (el: HTMLElement) => { const r = el.getBoundingClientRect(), span = r.height - innerHeight; return span > 40 ? clamp01(-r.top / span) : null }
    const entering = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return clamp01((innerHeight - r.top) / (innerHeight + r.height)) }

    // The hero slides up behind the floating navbar; measure how far.
    const measurePull = () => root.style.setProperty('--xr-pull', `${Math.max(0, root.getBoundingClientRect().top + scrollY)}px`)
    measurePull()
    addEventListener('resize', measurePull)

    // One-shot entrance for headings, the minigame strip and the doors.
    const io = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target) } }), { threshold: .2 })
    root.querySelectorAll('[data-xr-in], [data-xr-stagger]').forEach(el => io.observe(el))

    // Minigame strip: one panel open at a time; previews only animate while visible.
    const slices = [...mg.querySelectorAll<HTMLElement>('.xr-mg-slice')]
    const openSlice = (event: Event) => slices.forEach(slice => slice.classList.toggle('is-open', slice === event.currentTarget))
    slices.forEach(slice => { slice.addEventListener('pointerenter', openSlice); slice.addEventListener('focus', openSlice) })
    mg.setAttribute('data-paused', '')
    const mgIo = new IntersectionObserver(([entry]) => entry.isIntersecting ? mg.removeAttribute('data-paused') : mg.setAttribute('data-paused', ''))
    mgIo.observe(mg)

    // Doors lean toward the pointer with a red spotlight.
    const doors = [...root.querySelectorAll<HTMLElement>('[data-xr-door]')]
    const tilt = (event: PointerEvent) => {
      const door = event.currentTarget as HTMLElement, r = door.getBoundingClientRect(), x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height
      door.style.setProperty('--mx', `${x * 100}%`); door.style.setProperty('--my', `${y * 100}%`)
      if (!reduced) door.style.transform = `perspective(1200px) rotateX(${((.5 - y) * 4).toFixed(2)}deg) rotateY(${((x - .5) * 5).toFixed(2)}deg)`
    }
    const untilt = (event: PointerEvent) => { (event.currentTarget as HTMLElement).style.transform = '' }
    doors.forEach(door => { door.addEventListener('pointermove', tilt); door.addEventListener('pointerleave', untilt) })

    // Instrument blips jump to their section.
    const jump = (event: Event) => document.getElementById((event.currentTarget as HTMLElement).dataset.target!)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    const showTip = (event: Event) => { tip.textContent = (event.currentTarget as HTMLElement).getAttribute('aria-label'); tip.classList.add('is-on') }
    const hideTip = () => tip.classList.remove('is-on')
    instButtons.forEach(button => { button.addEventListener('click', jump); button.addEventListener('pointerenter', showTip); button.addEventListener('focus', showTip); button.addEventListener('pointerleave', hideTip); button.addEventListener('blur', hideTip) })

    const SCAN = .72, HOLD = .76, FOLD_END = .96
    const sections: Record<string, HTMLElement | null> = { 'xr-minigames': mg, 'xr-tools': tools, 'xr-setup': document.getElementById('xr-setup'), 'xr-squad': document.getElementById('xr-squad') }

    function heroFrame(p: number, time: number) {
      // One full sweep across the scan, with a slow ambient drift before the first scroll.
      const ambient = p < .02 ? (time / 1000) * 10 % 360 : 0
      const scan = clamp01(p / SCAN) * 360
      sweep.style.transform = `rotate(${(scan + ambient).toFixed(1)}deg)`
      blips.forEach(blip => blip.classList.toggle('is-lit', scan >= Number(blip.dataset.deg)))
      // Depth: dots drift slowest, the radar plane next, glints in front fastest.
      const fold = smooth((p - HOLD) / (FOLD_END - HOLD))
      dots.style.transform = `translate3d(0, ${(-p * 40).toFixed(1)}px, 0)`
      glints.style.transform = `translate3d(0, ${(-p * 240).toFixed(1)}px, 0)`
      glints.style.opacity = (1 - smooth(fold * 2)).toFixed(3)
      // Fold: shrink geometrically while travelling on a softer curve to where the instrument appears.
      const rw = radar.offsetWidth, ir = inst.getBoundingClientRect()
      const cx = innerWidth / 2, cy = stage.offsetHeight * .48
      const tx = (ir.left + ir.width / 2) - cx, ty = (ir.top + ir.height / 2) - cy, target = ir.width / (rw * .88)
      const shrink = 1 - Math.pow(1 - fold, 3), move = smooth(fold)
      const scale = Math.exp(Math.log(1 + p * .05) * (1 - shrink) + Math.log(target) * shrink)
      radar.style.transform = `translate3d(${(tx * move).toFixed(1)}px, ${(ty * move - p * 70 * (1 - move)).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`
      radar.style.setProperty('--rs', scale.toFixed(4))
      radar.style.setProperty('--label-o', (1 - smooth(fold * 8)).toFixed(3))
      radar.style.opacity = p >= FOLD_END ? '0' : '1'
      radar.classList.toggle('is-folding', fold > 0)
      sweep.style.opacity = (1 - smooth(fold * 2.5)).toFixed(3)
      copyEl.style.opacity = (1 - smooth((p - HOLD) / .1)).toFixed(3)
      copyEl.style.transform = `translate3d(0, ${(-smooth((p - HOLD) / .14) * 50).toFixed(1)}px, 0)`
      games.style.opacity = (1 - smooth((p - HOLD) / .08)).toFixed(3)
      return p >= FOLD_END
    }

    function toolsFrame(p: number) {
      ruler.dataset.stage = p > .62 ? '3' : p > .38 ? '2' : p > .1 ? '1' : '0'
      const k = smooth(p / .55)
      nums.forEach(el => { el.textContent = (Number(el.dataset.xrNum) * k).toFixed(Number(el.dataset.dec)) })
    }

    function frame(time: number) {
      const heroP = pinned(hero)
      const heroDone = reduced || heroP === null ? hero.getBoundingClientRect().bottom < innerHeight * .4 : heroFrame(heroP, time)
      if (!reduced) {
        // Tools: pinned on desktop; on small screens the same advance follows the section entering.
        toolsFrame(pinned(tools) ?? clamp01((entering(tools) - .15) / .5))
        mani.style.setProperty('--wipe', `${(100 - smooth((entering(mani) - .22) / .28) * 100).toFixed(1)}%`)
      }
      const open = reduced ? 1 : smooth((entering(finalSec) - .15) / .4)
      finalRadar.style.setProperty('--fr', (.2 + .8 * open).toFixed(3)); finalRadar.style.setProperty('--fo', open.toFixed(3))
      if (!reduced) finalSweep.style.transform = `rotate(${(scrollY * .12 % 360).toFixed(1)}deg)`
      inst.classList.toggle('is-on', heroDone && finalSec.getBoundingClientRect().top > innerHeight * .65)
      if (!reduced) instSweep.style.transform = `rotate(${(scrollY * .25 % 360).toFixed(1)}deg)`
      // Mark the section under the middle of the viewport (calibrator before converter inside the tools act).
      const mid = innerHeight * .5
      let current: string | null = null
      for (const [id, el] of Object.entries(sections)) { const r = el?.getBoundingClientRect(); if (r && r.top <= mid && r.bottom >= mid) current = id }
      const late = (pinned(tools) ?? 0) > .5
      instButtons.forEach(button => button.setAttribute('aria-current', String(button.dataset.target === current && (current !== 'xr-tools' || (button.dataset.part === 'conv') === late))))
    }

    let raf = 0
    if (reduced) {
      blips.forEach(blip => blip.classList.add('is-lit'))
      ruler.dataset.stage = '3'
      nums.forEach(el => { el.textContent = Number(el.dataset.xrNum).toFixed(Number(el.dataset.dec)) })
      const onScroll = () => frame(0)
      addEventListener('scroll', onScroll, { passive: true }); frame(0)
      return () => {
        removeEventListener('scroll', onScroll); removeEventListener('resize', measurePull); io.disconnect(); mgIo.disconnect()
        slices.forEach(slice => { slice.removeEventListener('pointerenter', openSlice); slice.removeEventListener('focus', openSlice) })
        doors.forEach(door => { door.removeEventListener('pointermove', tilt); door.removeEventListener('pointerleave', untilt) })
      }
    }
    const loop = (time: number) => { frame(time); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf); removeEventListener('resize', measurePull); io.disconnect(); mgIo.disconnect()
      slices.forEach(slice => { slice.removeEventListener('pointerenter', openSlice); slice.removeEventListener('focus', openSlice) })
      doors.forEach(door => { door.removeEventListener('pointermove', tilt); door.removeEventListener('pointerleave', untilt) })
    }
  }, [rootRef, reduced])
}

/* ---------- page ---------- */

export function Home({ onNavigate }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const reduced = Boolean(useReducedMotion())
  const { locale } = useI18n()
  const copy = homeCopy[locale as Locale]
  const profile = usePlayerProfile()
  const routines = useRoutineState()
  const sessions = useSessionState()
  useRadarScroll(rootRef, reduced)

  const summary = useMemo(() => {
    const latest = sessions.status === 'ready' ? sessions.items.find(session => session.status === 'completed') : null
    const result = latest ? sessionSummary(latest) : null
    return {
      training: result && latest ? { ...result, exercise: latest.exerciseId } : null,
      preset: profile.presets.find(preset => preset.isPrimary) ?? profile.presets[0] ?? null,
      routine: routines.status === 'ready' ? routines.items[0] ?? null : null,
    }
  }, [profile.presets, routines, sessions])

  return <div ref={rootRef} className="xr xensi-radar-home" data-reduced={reduced}>
    <HomeHero copy={copy} onNavigate={onNavigate} />
    <HomeMinigames copy={copy} onNavigate={onNavigate} />
    <HomeTools copy={copy} onNavigate={onNavigate} />
    <HomeManifesto copy={copy} />
    <HomeDoors copy={copy} onNavigate={onNavigate} />
    <HomeProgress copy={copy} training={summary.training} preset={summary.preset} routine={summary.routine} onNavigate={onNavigate} />
    <HomeFinal copy={copy} onNavigate={onNavigate} />
    <Instrument copy={copy} />
  </div>
}
