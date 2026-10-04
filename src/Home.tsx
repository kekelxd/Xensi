import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from 'react'
import {
  ArrowRight,
  BarChart3,
  Crosshair,
  Gamepad2,
  History,
  Monitor,
  Mouse,
  Play,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { AlphaFeedbackModal } from './AlphaFeedbackModal'
import { readCalibrationHistory, type CalibrationSessionSummary } from './calibration'
import { GAMES, type GameConfig } from './games'
import { GAME_SENSITIVITY_PROFILE_BY_ID } from './gameSensitivityProfiles'
import { useI18n, type Locale } from './i18n'
import {
  formatRoutineDuration,
  getRoutineTotalSeconds,
  readRoutineLibrary,
  type CustomRoutine,
} from './routineConfig'
import {
  calculatePresetCm360,
  type SensitivityPreset,
} from './playerProfileStore'
import { usePlayerProfile } from './useSensitivityPreset'
import { useRoutineState } from './useRoutineState'
import { SiteFooter } from './SiteFooter'
import { type WarmupSessionSummary } from './warmupTelemetry'
import { useSessionState } from './sessionRepository'
import { sessionSummary } from './trainingSession'
import type { WarmupExercise } from './warmupConfig'
import type { AppView } from './routes'

export type HomeDestination = AppView
type Props = { onNavigate: (destination: HomeDestination) => void }


const exerciseNames: Record<WarmupExercise, string> = {
  switch: 'Target Switch',
  tracking: 'Tracking',
  flick: 'Target Shooting',
  reflex: 'Reflex',
  gridshot: 'Gridshot',
  strafetrack: 'Strafetrack',
  'sniper-reaction': 'Sniper Reaction',
  micro_flick: 'Micro Flick',
}

const copy = {
  pt: {
    heroTitleOne: 'Treine melhor.',
    heroTitleTwo: 'Jogue diferente.',
    heroDescription: 'Ferramentas, treinos e análises para você entender seu controle, evoluir sua mira e extrair o máximo da sua performance.',
    primaryCta: 'Começar agora',
    secondaryCta: 'Testar meu setup',
    pathKicker: 'ESCOLHA SEU CAMINHO',
    pathTitle: 'Dois focos. Uma evolução.',
    pathAside: 'Treine sua mira ou valide seu setup. O XENSI te dá o controle em todas as frentes.',
    trainingTitle: 'Treino e Performance',
    trainingDescription: 'Construa consistência com sessões curtas, calibre sua sensibilidade e acompanhe o que está melhorando.',
    trainingItems: ['Treinar', 'Calibrar', 'Converter', 'Análise'],
    trainingItemDescriptions: ['Minigames focados', 'Ajuste sua sensibilidade', 'Conversões precisas', 'Acompanhe seu progresso'],
    trainingCta: 'Explorar treinos',
    setupTitle: 'Diagnóstico do Setup',
    setupDescription: 'Cheque mouse, teclado, tela e controle antes de entrar em partida. Menos dúvida, mais confiança.',
    setupItems: ['Polling Rate', 'Input Diagnostics', 'Refresh Rate', 'Drift do Controle'],
    setupItemDescriptions: ['Teste em tempo real', 'Analise seu controle', 'Verifique seu monitor', 'Identifique inconsistências'],
    setupCta: 'Explorar diagnósticos',
    progressKicker: 'SEU PROGRESSO',
    progressTitle: 'Continue de onde parou.',
    lastTraining: 'ÚLTIMO TREINO',
    lastTrainingEmpty: 'Complete um treino para continuar daqui.',
    preset: 'PRESET ATIVO',
    presetEmpty: 'Adicione um preset no perfil para ver sua referência principal.',
    routine: 'ROTINA SALVA',
    routineEmpty: 'Salve uma rotina para retomar sua playlist com um clique.',
    resumeTraining: 'Retomar treino',
    viewPresets: 'Ver presets',
    viewRoutine: 'Ver rotina completa',
    noDate: 'Data não salva',
    today: 'hoje',
    daysAgo: 'há {days} dias',
    accuracy: 'Precisão',
    reaction: 'Reação',
    duration: 'Duração',
    dpi: 'DPI',
    sens: 'Sensi',
    edpi: 'eDPI',
    exercises: 'exercícios',
    ecosystemTitle: 'Mais que ferramentas. Um ecossistema.',
    ecosystemDescription: 'O XENSI conecta treino, calibração, conversão, análise e diagnóstico para transformar dados soltos em decisões melhores antes de jogar.',
    ecosystemCta: 'Conheça o XENSI',
    pillars: [
      ['Evolução real', 'Métricas que mostram precisão, controle e consistência.'],
      ['Interface limpa', 'Fluxos diretos para treinar, medir e decidir rápido.'],
      ['Para todos os níveis', 'Útil para quem está começando e para quem já compete.'],
      ['Sempre em desenvolvimento', 'O produto cresce com novas rotinas, diagnósticos e análises.'],
    ],
  },
  en: {
    heroTitleOne: 'Train better.',
    heroTitleTwo: 'Play different.',
    heroDescription: 'Tools, training, and analysis to understand your control, improve your aim, and extract more from your performance.',
    primaryCta: 'Start now',
    secondaryCta: 'Test my setup',
    pathKicker: 'CHOOSE YOUR PATH',
    pathTitle: 'Two focuses. One evolution.',
    pathAside: 'Train your aim or validate your setup. XENSI gives you control across every front.',
    trainingTitle: 'Training and Performance',
    trainingDescription: 'Build consistency with short sessions, calibrate sensitivity, and track what is improving.',
    trainingItems: ['Train', 'Calibrate', 'Convert', 'Analysis'],
    trainingItemDescriptions: ['Focused minigames', 'Tune your sensitivity', 'Precise conversions', 'Track your progress'],
    trainingCta: 'Explore training',
    setupTitle: 'Setup Diagnostics',
    setupDescription: 'Check mouse, keyboard, display, and controller before queueing. Less doubt, more confidence.',
    setupItems: ['Polling Rate', 'Input Diagnostics', 'Refresh Rate', 'Controller Drift'],
    setupItemDescriptions: ['Real-time test', 'Analyze your control', 'Check your display', 'Identify inconsistencies'],
    setupCta: 'Explore diagnostics',
    progressKicker: 'YOUR PROGRESS',
    progressTitle: 'Continue where you left off.',
    lastTraining: 'LAST TRAINING',
    lastTrainingEmpty: 'Finish a training session to continue from here.',
    preset: 'ACTIVE PRESET',
    presetEmpty: 'Add a profile preset to show your main reference.',
    routine: 'SAVED ROUTINE',
    routineEmpty: 'Save a routine to resume your playlist in one click.',
    resumeTraining: 'Resume training',
    viewPresets: 'View presets',
    viewRoutine: 'View full routine',
    noDate: 'Date not saved',
    today: 'today',
    daysAgo: '{days} days ago',
    accuracy: 'Accuracy',
    reaction: 'Reaction',
    duration: 'Duration',
    dpi: 'DPI',
    sens: 'Sens',
    edpi: 'eDPI',
    exercises: 'exercises',
    ecosystemTitle: 'More than tools. An ecosystem.',
    ecosystemDescription: 'XENSI connects training, calibration, conversion, analysis, and diagnostics to turn scattered data into better decisions before playing.',
    ecosystemCta: 'Meet XENSI',
    pillars: [
      ['Real progress', 'Metrics that show accuracy, control, and consistency.'],
      ['Clean interface', 'Direct flows to train, measure, and decide quickly.'],
      ['For every level', 'Useful for beginners and competitive players.'],
      ['Always evolving', 'The product grows with new routines, diagnostics, and analysis.'],
    ],
  },
  es: {
    heroTitleOne: 'Entrena mejor.',
    heroTitleTwo: 'Juega diferente.',
    heroDescription: 'Herramientas, entrenamientos y análisis para entender tu control, mejorar tu mira y sacar más de tu rendimiento.',
    primaryCta: 'Empezar ahora',
    secondaryCta: 'Probar mi setup',
    pathKicker: 'ELIGE TU CAMINO',
    pathTitle: 'Dos focos. Una evolución.',
    pathAside: 'Entrena tu mira o valida tu setup. XENSI te da control en todos los frentes.',
    trainingTitle: 'Entrenamiento y Rendimiento',
    trainingDescription: 'Construye consistencia con sesiones cortas, calibra sensibilidad y revisa qué está mejorando.',
    trainingItems: ['Entrenar', 'Calibrar', 'Convertir', 'Análisis'],
    trainingItemDescriptions: ['Minijuegos enfocados', 'Ajusta tu sensibilidad', 'Conversiones precisas', 'Sigue tu progreso'],
    trainingCta: 'Explorar entrenos',
    setupTitle: 'Diagnóstico del Setup',
    setupDescription: 'Revisa mouse, teclado, pantalla y control antes de jugar. Menos duda, más confianza.',
    setupItems: ['Polling Rate', 'Input Diagnostics', 'Refresh Rate', 'Drift del Control'],
    setupItemDescriptions: ['Prueba en tiempo real', 'Analiza tu control', 'Verifica tu monitor', 'Identifica inconsistencias'],
    setupCta: 'Explorar diagnósticos',
    progressKicker: 'TU PROGRESO',
    progressTitle: 'Continúa donde paraste.',
    lastTraining: 'ÚLTIMO ENTRENO',
    lastTrainingEmpty: 'Completa un entrenamiento para continuar desde aquí.',
    preset: 'PRESET ACTIVO',
    presetEmpty: 'Añade un preset al perfil para ver tu referencia principal.',
    routine: 'RUTINA GUARDADA',
    routineEmpty: 'Guarda una rutina para retomar tu playlist con un clic.',
    resumeTraining: 'Retomar entreno',
    viewPresets: 'Ver presets',
    viewRoutine: 'Ver rutina completa',
    noDate: 'Fecha no guardada',
    today: 'hoy',
    daysAgo: 'hace {days} días',
    accuracy: 'Precisión',
    reaction: 'Reacción',
    duration: 'Duración',
    dpi: 'DPI',
    sens: 'Sensi',
    edpi: 'eDPI',
    exercises: 'ejercicios',
    ecosystemTitle: 'Más que herramientas. Un ecosistema.',
    ecosystemDescription: 'XENSI conecta entrenamiento, calibración, conversión, análisis y diagnóstico para convertir datos sueltos en mejores decisiones antes de jugar.',
    ecosystemCta: 'Conoce XENSI',
    pillars: [
      ['Evolución real', 'Métricas que muestran precisión, control y consistencia.'],
      ['Interfaz limpia', 'Flujos directos para entrenar, medir y decidir rápido.'],
      ['Para todos los niveles', 'Útil para quien empieza y para quien compite.'],
      ['Siempre en desarrollo', 'El producto crece con nuevas rutinas, diagnósticos y análisis.'],
    ],
  },
} as const

type CalibrationWithGame = CalibrationSessionSummary & { game: GameConfig }
type LastTraining = WarmupSessionSummary & { exercise: WarmupExercise }
type HomeSummary = {
  latestTraining: LastTraining | null
  latestCalibration: CalibrationWithGame | null
  activePreset: SensitivityPreset | null
  savedRoutine: CustomRoutine | null
}

function readHomeSummary(storage: Storage, presets: SensitivityPreset[]): HomeSummary {
  const calibrations = GAMES.flatMap((game) => readCalibrationHistory(storage, game.id).map((session) => ({ ...session, game })))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
  const activePreset = presets.find(preset => preset.isPrimary) ?? presets[0] ?? null
  const savedRoutine = readRoutineLibrary(storage, activePreset?.gameId ?? 'cs2')[0] ?? null
  return {
    latestTraining: null,
    latestCalibration: calibrations[0] ?? null,
    activePreset,
    savedRoutine,
  }
}

function relativeDate(value: string | undefined, locale: Locale) {
  const current = copy[locale]
  if (!value) return current.noDate
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000))
  return days === 0 ? current.today : current.daysAgo.replace('{days}', String(days))
}

function formatPercent(value: number | undefined) {
  return Number.isFinite(value) ? `${Math.round(value ?? 0)}%` : '—'
}

function formatMs(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? `${Math.round(value ?? 0)}ms` : '—'
}

function formatSensitivity(value: number) {
  return value >= 10 ? value.toFixed(2) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return <span className="xensi-home-v3-icon"><Icon size={20} /></span>
}

function HomeHero({ onNavigate }: Props) {
  const { locale } = useI18n()
  const current = copy[locale]

  return <section className="xensi-reference-hero xensi-home-v3-hero" aria-labelledby="home-title">
    <div className="xensi-reference-copy xensi-home-v3-hero-copy">
      <h1 id="home-title"><span>{current.heroTitleOne}</span><span>{current.heroTitleTwo}</span></h1>
      <p>{current.heroDescription}</p>
      <div className="xensi-home-v3-actions">
        <button type="button" className="xensi-home-v3-primary" onClick={() => onNavigate('warmup')}>{current.primaryCta}<ArrowRight size={18} /></button>
        <button type="button" className="xensi-home-v3-secondary" onClick={() => onNavigate('buttons')}>{current.secondaryCta}<Mouse size={17} /></button>
      </div>
    </div>
  </section>
}

function PathCard({
  title,
  description,
  items,
  itemDescriptions,
  cta,
  icon: Icon,
  onClick,
  itemDestinations,
  onItemClick,
  accent,
}: {
  title: string
  description: string
  items: readonly string[]
  itemDescriptions: readonly string[]
  cta: string
  icon: LucideIcon
  onClick: () => void
  itemDestinations?: readonly HomeDestination[]
  onItemClick?: (destination: HomeDestination) => void
  accent: 'coral' | 'mint'
}) {
  const featureIcons = accent === 'coral'
    ? [Target, SlidersHorizontal, RefreshCw, BarChart3]
    : [Mouse, Crosshair, Monitor, Gamepad2]
  return <article className={`xensi-home-v3-path-card is-${accent}`}>
    <div className="xensi-home-v3-path-main">
      <IconBadge icon={Icon} />
      <h3>{title}</h3>
      <p>{description}</p>
      <button type="button" onClick={onClick}>{cta}<ArrowRight size={16} /></button>
    </div>
    <ul className="xensi-home-v3-path-list">
      {items.map((item, index) => {
        const ItemIcon = featureIcons[index]
        const content = <>
          <span>{ItemIcon ? <ItemIcon size={18} /> : null}</span>
          <b>{item}</b>
          <small>{itemDescriptions[index]}</small>
        </>
        const destination = itemDestinations?.[index]
        return <li key={item}>
          {destination
            ? <button type="button" className="xensi-home-v3-path-item-button" onClick={() => onItemClick?.(destination)} data-destination={destination} aria-label={item}>
              {content}
            </button>
            : content}
        </li>
      })}
    </ul>
  </article>
}

function HomePathways({ onNavigate }: Props) {
  const { locale } = useI18n()
  const current = copy[locale]
  return <section className="xensi-home-v3-section xensi-home-v3-pathways" aria-labelledby="home-path-title">
    <div className="xensi-home-v3-section-head xensi-home-v3-split-head">
      <div>
        <span>{current.pathKicker}</span>
        <h2 id="home-path-title">{current.pathTitle}</h2>
      </div>
      <p>{current.pathAside}</p>
    </div>
    <div className="xensi-home-v3-path-grid">
      <PathCard title={current.trainingTitle} description={current.trainingDescription} items={current.trainingItems} itemDescriptions={current.trainingItemDescriptions} cta={current.trainingCta} icon={Crosshair} accent="coral" onClick={() => onNavigate('warmup')} />
      <PathCard
        title={current.setupTitle}
        description={current.setupDescription}
        items={current.setupItems}
        itemDescriptions={current.setupItemDescriptions}
        cta={current.setupCta}
        icon={Radar}
        accent="mint"
        onClick={() => onNavigate('diagnostics')}
        itemDestinations={['polling', 'buttons', 'refresh-rate', 'controller-drift']}
        onItemClick={onNavigate}
      />
    </div>
  </section>
}

function ProgressCard({
  label,
  title,
  description,
  rows,
  cta,
  icon,
  onClick,
  empty,
}: {
  label: string
  title: string
  description: string
  rows: Array<[string, string]>
  cta: string
  icon: LucideIcon
  onClick: () => void
  empty?: boolean
}) {
  return <article className={`xensi-home-v3-progress-card ${empty ? 'is-empty' : ''}`}>
    <header><IconBadge icon={icon} /><span>{label}</span></header>
    <h3>{title}</h3>
    <p>{description}</p>
    {rows.length > 0 && <dl>
      {rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
    </dl>}
    <button type="button" onClick={onClick}>{cta}<ArrowRight size={15} /></button>
  </article>
}

function buildTrainingRows(training: LastTraining | null, locale: Locale): Array<[string, string]> {
  if (!training) return []
  return [
    [copy[locale].accuracy, formatPercent(training.accuracy)],
    [copy[locale].reaction, formatMs(training.reactionTimeMs)],
    ['Score', String(training.score)],
  ]
}

function buildPresetRows(preset: SensitivityPreset | null, locale: Locale): Array<[string, string]> {
  if (!preset) return []
  return [
    [copy[locale].dpi, String(preset.dpi)],
    [copy[locale].sens, formatSensitivity(preset.sensitivity)],
    [copy[locale].edpi, String(Math.round(preset.dpi * preset.sensitivity))],
  ]
}

function buildRoutineRows(routine: CustomRoutine | null, locale: Locale): Array<[string, string]> {
  if (!routine) return []
  return [
    [copy[locale].duration, formatRoutineDuration(getRoutineTotalSeconds(routine.items))],
    [copy[locale].exercises, String(routine.items.length)],
  ]
}

function HomeProgress({ summary, onNavigate }: { summary: HomeSummary; onNavigate: Props['onNavigate'] }) {
  const { locale } = useI18n()
  const current = copy[locale]
  const presetGame = summary.activePreset ? GAME_SENSITIVITY_PROFILE_BY_ID[summary.activePreset.gameId] : null
  const cm360 = summary.activePreset ? calculatePresetCm360(summary.activePreset) : null

  return <section className="xensi-home-v3-section xensi-home-v3-progress" aria-labelledby="home-progress-title">
    <div className="xensi-home-v3-section-head">
      <span>{current.progressKicker}</span>
      <h2 id="home-progress-title">{current.progressTitle}</h2>
    </div>
    <div className="xensi-home-v3-progress-grid">
      <ProgressCard
        label={current.lastTraining}
        title={summary.latestTraining ? exerciseNames[summary.latestTraining.exercise] : '—'}
        description={summary.latestTraining ? relativeDate(summary.latestTraining.completedAt, locale) : current.lastTrainingEmpty}
        rows={buildTrainingRows(summary.latestTraining, locale)}
        cta={current.resumeTraining}
        icon={Play}
        empty={!summary.latestTraining}
        onClick={() => onNavigate('warmup')}
      />
      <ProgressCard
        label={current.preset}
        title={summary.activePreset ? (summary.activePreset.name || presetGame?.shortName || presetGame?.name || 'Preset') : '—'}
        description={summary.activePreset ? `${presetGame?.name ?? summary.activePreset.gameId}${cm360 ? ` · ${cm360.toFixed(1)} cm/360` : ''}` : current.presetEmpty}
        rows={buildPresetRows(summary.activePreset, locale)}
        cta={current.viewPresets}
        icon={Target}
        empty={!summary.activePreset}
        onClick={() => onNavigate('profile')}
      />
      <ProgressCard
        label={current.routine}
        title={summary.savedRoutine?.name ?? '—'}
        description={summary.savedRoutine ? summary.savedRoutine.items.map((item) => exerciseNames[item.modeId]).slice(0, 3).join(' · ') : current.routineEmpty}
        rows={buildRoutineRows(summary.savedRoutine, locale)}
        cta={current.viewRoutine}
        icon={History}
        empty={!summary.savedRoutine}
        onClick={() => onNavigate('routine')}
      />
    </div>
  </section>
}

function HomeEcosystem({ onNavigate }: Props) {
  const { locale } = useI18n()
  const current = copy[locale]
  const icons: Array<ComponentType<{ size?: number }>> = [BarChart3, Sparkles, Gamepad2, Zap]
  return <section className="xensi-home-v3-section xensi-home-v3-ecosystem" id="ecossistema" aria-labelledby="home-ecosystem-title">
    <div className="xensi-home-v3-ecosystem-copy">
      <h2 id="home-ecosystem-title">{current.ecosystemTitle}</h2>
      <p>{current.ecosystemDescription}</p>
      <button type="button" onClick={() => onNavigate('analysis')}>{current.ecosystemCta}<ArrowRight size={16} /></button>
    </div>
    <div className="xensi-home-v3-pillars">
      {current.pillars.map(([title, description], index) => {
        const Icon = icons[index]
        return <article key={title} style={{ '--item-index': index } as CSSProperties}>
          <Icon size={19} />
          <h3>{title}</h3>
          <p>{description}</p>
        </article>
      })}
    </div>
  </section>
}

export function Home({ onNavigate }: Props) {
  const profile = usePlayerProfile()
  const routines = useRoutineState()
  const sessions = useSessionState()
  const [summary, setSummary] = useState<HomeSummary>(() => readHomeSummary(window.localStorage, profile.presets))
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  useEffect(() => {
    const refresh = () => setSummary(readHomeSummary(window.localStorage, profile.presets))
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('xensi-profile-updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('xensi-profile-updated', refresh)
    }
  }, [profile.presets])

  const stableSummary = useMemo(() => ({ ...summary,
    latestTraining: (() => {
      const latest = sessions.status === 'ready' ? sessions.items.find(s => s.status === 'completed') : null
      const result = latest ? sessionSummary(latest) : null
      return result && latest ? { ...result, exercise: latest.exerciseId } : null
    })(),
    activePreset: profile.presets.find(preset => preset.isPrimary) ?? profile.presets[0] ?? null,
    savedRoutine: routines.status === 'ready' ? routines.items[0] ?? null : null,
  }), [summary, profile.presets, routines, sessions])

  return <main className="xensi-home xensi-reference xensi-home-v3">
    <div className="xensi-home-v3-shell">
      <div className="xensi-home-v3-content">
        <HomeHero onNavigate={onNavigate} />
        <HomePathways onNavigate={onNavigate} />
        <HomeProgress summary={stableSummary} onNavigate={onNavigate} />
        <HomeEcosystem onNavigate={onNavigate} />
      </div>
      <SiteFooter onFeedback={() => setFeedbackOpen(true)} onNavigate={onNavigate} />
    </div>
    <AlphaFeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
  </main>
}
