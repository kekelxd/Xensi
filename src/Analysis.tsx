import { useMemo, useState } from 'react'
import { Activity, CalendarDays, Crosshair, MousePointer2, RotateCcw } from 'lucide-react'
import { readCalibrationHistory, type CalibrationSessionSummary } from './calibration'
import { GAME_BY_ID, GAMES, type GameConfig } from './games'
import { PersonalBestPanel } from './PersonalBestPanel'
import { EXERCISES, type WarmupExerciseDefinition } from './warmupExercises'
import { type WarmupSessionSummary } from './warmupTelemetry'
import { useSessionState } from './sessionRepository'
import { sessionSummary, type TrainingSession, type SessionStatus } from './trainingSession'
import { useI18n, type Locale } from './i18n'
import type { AnalysisSection } from './AppNavigation'
import type { GameSensitivityProfileId } from './gameSensitivityProfiles'

type Props = {
  section: AnalysisSection
  onStartTraining?: () => void
}

type PeriodKey = '7d' | '30d' | '90d' | 'all'
type MetricKey = 'accuracy' | 'tracking' | 'reaction' | 'consistency'

type AnalysisPoint = {
  id: string
  source: 'warmup' | 'calibration'
  metric: MetricKey
  value: number
  completedAt: string | null
  mode: string
  gameId?: GameSensitivityProfileId
  sensitivity?: number
  dpi?: number
  difficulty?: string
  previousSensitivity?: number
}

type RecentSession = {
  id: string
  completedAt: string | null
  title: string
  metricLine: string
  presetLine: string | null
}

const copy = {
  pt: {
    title: 'Análise',
    subtitle: 'Veja como sua mira evolui e quais configurações estavam em uso em cada sessão.',
    sessions: 'Sessões recentes',
    evolution: 'Evolução',
    calibration: 'Histórico de calibração',
    compare: 'Comparação de períodos',
    precision: 'Precisão',
    tracking: 'Tracking',
    reaction: 'Reação',
    consistency: 'Consistência',
    emptyTitle: 'Ainda não há dados suficientes',
    emptyText: 'Complete mais sessões para começar a visualizar sua evolução.',
    startTraining: 'Começar treino',
    waiting: 'Aguardando mais sessões',
    previous: 'Período anterior',
    all: 'Tudo',
    lastPeriod: 'Últimos {period}',
    previousPeriod: '{period} anteriores',
    wholeHistory: 'Todo histórico',
    noPreviousPeriod: 'sem período anterior equivalente',
    fullHistory: 'Ver histórico completo',
    personalBests: 'Recordes pessoais',
    noBaseline: 'Sem baseline válido',
    noDate: 'Data não salva',
    methodTitle: 'Como funciona a calibração',
    methodSubtitle: 'O XENSI compara diferentes sensibilidades usando condições equivalentes e métricas consistentes. O resultado é uma recomendação baseada no desempenho observado durante o teste.',
    methodFlowTitle: 'Como o teste funciona',
    methodStepOne: 'Define a faixa',
    methodStepOneText: 'A partir da sensibilidade informada, o calibrador cria candidatos próximos ao valor base, respeitando os passos configuráveis do jogo.',
    methodStepTwo: 'Compara execuções',
    methodStepTwoText: 'Os candidatos são testados em blocos. A ordem muda de forma controlada e cada bloco usa uma trajetória determinada por seed para reduzir variação externa.',
    methodStepThree: 'Mede o desempenho',
    methodStepThreeText: 'Cada rodada registra amostras da distância até o alvo, mudanças de velocidade, overshoots, qualidade da coleta e quantidade de dados válidos.',
    methodStepFour: 'Valida finalistas',
    methodStepFourText: 'Depois da comparação inicial, os melhores candidatos avançam para rodadas de validação lado a lado.',
    methodStepFive: 'Refina quando necessário',
    methodStepFiveText: 'Quando o resultado permite nova busca, o XENSI pode testar uma faixa mais estreita ao redor do melhor candidato observado.',
    methodMetricsTitle: 'O que o XENSI mede',
    methodMetricAccuracy: 'Precisão',
    methodMetricAccuracyText: 'Percentual de amostras em que a mira permaneceu dentro do raio do alvo.',
    methodMetricMeanError: 'Erro médio',
    methodMetricMeanErrorText: 'Distância média entre a mira e o alvo durante a rodada.',
    methodMetricSmoothness: 'Suavidade',
    methodMetricSmoothnessText: 'Estabilidade do movimento, calculada a partir da variação de velocidade entre amostras.',
    methodMetricOvershoot: 'Overshoot',
    methodMetricOvershootText: 'Quantidade de vezes em que a mira passa de uma posição próxima ao alvo para uma distância alta logo depois.',
    methodMetricQuality: 'Qualidade da coleta',
    methodMetricQualityText: 'Pontuação baseada em amostras suficientes, estabilidade de frames, ausência de resize e interrupções de pointer lock.',
    methodMetricConsistency: 'Consistência',
    methodMetricConsistencyText: 'Repetibilidade do desempenho entre rodadas e concordância entre blocos de comparação.',
    methodDecisionTitle: 'Como o XENSI chega à recomendação',
    methodDecisionText: 'O relatório agrega as rodadas válidas por candidato, compara score, repetibilidade e concordância entre blocos. A validação final compara dois finalistas; se a validação contradiz a medição ou se candidatos separados ficam muito próximos, o resultado pode ser inconclusivo. A recomendação final usa um valor realmente testado, não uma promessa matemática isolada.',
    methodInterpretTitle: 'Como interpretar o resultado',
    methodInterpretRecommendation: 'Sensibilidade recomendada',
    methodInterpretRecommendationText: 'O candidato que teve melhor desempenho após comparação e validação, quando os dados sustentam uma escolha.',
    methodInterpretRange: 'Faixa recomendada',
    methodInterpretRangeText: 'Quando candidatos vizinhos ficam muito próximos e repetíveis, o resultado pode ser apresentado como faixa estreita.',
    methodInterpretStrength: 'Força da recomendação',
    methodInterpretStrengthText: 'Combina separação entre candidatos, validação, concordância entre blocos e repetibilidade.',
    methodInterpretInconclusive: 'Resultado inconclusivo',
    methodInterpretInconclusiveText: 'Pode ocorrer por baixa qualidade de coleta, baixa consistência, pouco sinal entre candidatos ou validação dividida/revertida.',
    methodLimitsTitle: 'Limitações',
    methodLimitsTextOne: 'O resultado representa seu desempenho dentro das condições avaliadas pelo XENSI. Sensação no jogo, FOV, mecânicas específicas, equipamento e adaptação do jogador podem influenciar o resultado final.',
    methodLimitsTextTwo: 'Use a recomendação como ponto de referência e valide a sensibilidade dentro do jogo antes de manter uma mudança.',
  },
  en: {
    title: 'Analysis',
    subtitle: 'See how your aim is changing and which settings were used in each session.',
    sessions: 'Recent sessions',
    evolution: 'Progress',
    calibration: 'Calibration history',
    compare: 'Period comparison',
    precision: 'Accuracy',
    tracking: 'Tracking',
    reaction: 'Reaction',
    consistency: 'Consistency',
    emptyTitle: 'Not enough data yet',
    emptyText: 'Complete more sessions to start visualizing your progress.',
    startTraining: 'Start training',
    waiting: 'Waiting for more sessions',
    previous: 'Previous period',
    all: 'All',
    lastPeriod: 'Last {period}',
    previousPeriod: 'Previous {period}',
    wholeHistory: 'All history',
    noPreviousPeriod: 'no equivalent previous period',
    fullHistory: 'View full history',
    personalBests: 'Personal bests',
    noBaseline: 'No valid baseline',
    noDate: 'Date not saved',
    methodTitle: 'How calibration works',
    methodSubtitle: 'XENSI compares different sensitivities under equivalent conditions using consistent metrics. The result is a recommendation based on the performance observed during the test.',
    methodFlowTitle: 'How the test works',
    methodStepOne: 'Defines the range',
    methodStepOneText: 'Starting from the sensitivity you enter, the calibrator creates nearby candidates while respecting the configurable steps for the selected game.',
    methodStepTwo: 'Compares runs',
    methodStepTwoText: 'Candidates are tested in blocks. The order changes in a controlled way and each block uses a seeded trajectory to reduce external variation.',
    methodStepThree: 'Measures performance',
    methodStepThreeText: 'Each round records samples of distance to target, speed changes, overshoots, collection quality, and valid data volume.',
    methodStepFour: 'Validates finalists',
    methodStepFourText: 'After the initial comparison, the strongest candidates move into side-by-side validation rounds.',
    methodStepFive: 'Refines when needed',
    methodStepFiveText: 'When the result supports another pass, XENSI can test a narrower range around the best observed candidate.',
    methodMetricsTitle: 'What XENSI measures',
    methodMetricAccuracy: 'Accuracy',
    methodMetricAccuracyText: 'Percentage of samples where the crosshair stayed inside the target radius.',
    methodMetricMeanError: 'Mean error',
    methodMetricMeanErrorText: 'Average distance between the crosshair and the target during the round.',
    methodMetricSmoothness: 'Smoothness',
    methodMetricSmoothnessText: 'Movement stability, calculated from speed variation between samples.',
    methodMetricOvershoot: 'Overshoot',
    methodMetricOvershootText: 'How often the crosshair moves from close to the target to a high distance shortly afterward.',
    methodMetricQuality: 'Collection quality',
    methodMetricQualityText: 'Score based on enough samples, frame stability, no resize events, and no pointer-lock interruptions.',
    methodMetricConsistency: 'Consistency',
    methodMetricConsistencyText: 'Repeatability across rounds and agreement between comparison blocks.',
    methodDecisionTitle: 'How XENSI reaches the recommendation',
    methodDecisionText: 'The report aggregates valid rounds per candidate, then compares score, repeatability, and block agreement. Final validation compares two finalists; if validation contradicts measurement or separated candidates remain too close, the result can be inconclusive. The final recommendation uses a value that was actually tested, not an isolated mathematical promise.',
    methodInterpretTitle: 'How to interpret the result',
    methodInterpretRecommendation: 'Recommended sensitivity',
    methodInterpretRecommendationText: 'The candidate with the strongest performance after comparison and validation, when the data supports a choice.',
    methodInterpretRange: 'Recommended range',
    methodInterpretRangeText: 'When neighboring candidates are close and repeatable, the result may be shown as a narrow range.',
    methodInterpretStrength: 'Recommendation strength',
    methodInterpretStrengthText: 'Combines candidate separation, validation, block agreement, and repeatability.',
    methodInterpretInconclusive: 'Inconclusive result',
    methodInterpretInconclusiveText: 'Can happen because of low collection quality, low consistency, weak signal between candidates, or split/reversed validation.',
    methodLimitsTitle: 'Limitations',
    methodLimitsTextOne: 'The result represents your performance under the conditions evaluated by XENSI. In-game feel, FOV, specific mechanics, equipment, and player adaptation can influence the final outcome.',
    methodLimitsTextTwo: 'Use the recommendation as a reference point and validate the sensitivity inside the game before keeping a change.',
  },
  es: {
    title: 'Análisis',
    subtitle: 'Observa cómo cambia tu mira y qué configuraciones se usaron en cada sesión.',
    sessions: 'Sesiones recientes',
    evolution: 'Evolución',
    calibration: 'Historial de calibración',
    compare: 'Comparación de períodos',
    precision: 'Precisión',
    tracking: 'Tracking',
    reaction: 'Reacción',
    consistency: 'Consistencia',
    emptyTitle: 'Aún no hay datos suficientes',
    emptyText: 'Completa más sesiones para empezar a visualizar tu evolución.',
    startTraining: 'Comenzar entrenamiento',
    waiting: 'Esperando más sesiones',
    previous: 'Período anterior',
    all: 'Todo',
    lastPeriod: 'Últimos {period}',
    previousPeriod: '{period} anteriores',
    wholeHistory: 'Todo el historial',
    noPreviousPeriod: 'sin período anterior equivalente',
    fullHistory: 'Ver historial completo',
    personalBests: 'Récords personales',
    noBaseline: 'Sin baseline válido',
    noDate: 'Fecha no guardada',
    methodTitle: 'Cómo funciona la calibración',
    methodSubtitle: 'XENSI compara diferentes sensibilidades bajo condiciones equivalentes usando métricas consistentes. El resultado es una recomendación basada en el rendimiento observado durante la prueba.',
    methodFlowTitle: 'Cómo funciona la prueba',
    methodStepOne: 'Define el rango',
    methodStepOneText: 'A partir de la sensibilidad informada, el calibrador crea candidatos cercanos al valor base y respeta los pasos configurables del juego.',
    methodStepTwo: 'Compara ejecuciones',
    methodStepTwoText: 'Los candidatos se prueban en bloques. El orden cambia de forma controlada y cada bloque usa una trayectoria determinada por seed para reducir variación externa.',
    methodStepThree: 'Mide el rendimiento',
    methodStepThreeText: 'Cada ronda registra muestras de distancia al objetivo, cambios de velocidad, overshoots, calidad de captura y cantidad de datos válidos.',
    methodStepFour: 'Valida finalistas',
    methodStepFourText: 'Después de la comparación inicial, los candidatos más fuertes avanzan a rondas de validación lado a lado.',
    methodStepFive: 'Refina cuando hace falta',
    methodStepFiveText: 'Cuando el resultado permite otra pasada, XENSI puede probar un rango más estrecho alrededor del mejor candidato observado.',
    methodMetricsTitle: 'Qué mide XENSI',
    methodMetricAccuracy: 'Precisión',
    methodMetricAccuracyText: 'Porcentaje de muestras en las que la mira permaneció dentro del radio del objetivo.',
    methodMetricMeanError: 'Error medio',
    methodMetricMeanErrorText: 'Distancia media entre la mira y el objetivo durante la ronda.',
    methodMetricSmoothness: 'Suavidad',
    methodMetricSmoothnessText: 'Estabilidad del movimiento, calculada a partir de la variación de velocidad entre muestras.',
    methodMetricOvershoot: 'Overshoot',
    methodMetricOvershootText: 'Cuántas veces la mira pasa de estar cerca del objetivo a una distancia alta poco después.',
    methodMetricQuality: 'Calidad de captura',
    methodMetricQualityText: 'Puntuación basada en muestras suficientes, estabilidad de frames, ausencia de resize e interrupciones del pointer lock.',
    methodMetricConsistency: 'Consistencia',
    methodMetricConsistencyText: 'Repetibilidad entre rondas y concordancia entre bloques de comparación.',
    methodDecisionTitle: 'Cómo XENSI llega a la recomendación',
    methodDecisionText: 'El reporte agrega las rondas válidas por candidato y compara score, repetibilidad y concordancia entre bloques. La validación final compara dos finalistas; si contradice la medición o candidatos separados quedan muy cerca, el resultado puede ser inconcluso. La recomendación final usa un valor realmente probado.',
    methodInterpretTitle: 'Cómo interpretar el resultado',
    methodInterpretRecommendation: 'Sensibilidad recomendada',
    methodInterpretRecommendationText: 'El candidato con mejor rendimiento después de comparación y validación, cuando los datos sustentan una elección.',
    methodInterpretRange: 'Rango recomendado',
    methodInterpretRangeText: 'Cuando candidatos vecinos quedan muy cerca y son repetibles, el resultado puede mostrarse como rango estrecho.',
    methodInterpretStrength: 'Fuerza de la recomendación',
    methodInterpretStrengthText: 'Combina separación entre candidatos, validación, concordancia entre bloques y repetibilidad.',
    methodInterpretInconclusive: 'Resultado inconcluso',
    methodInterpretInconclusiveText: 'Puede ocurrir por baja calidad de captura, baja consistencia, poca señal entre candidatos o validación dividida/revertida.',
    methodLimitsTitle: 'Limitaciones',
    methodLimitsTextOne: 'El resultado representa tu rendimiento dentro de las condiciones evaluadas por XENSI. Sensación en el juego, FOV, mecánicas específicas, equipo y adaptación del jugador pueden influir en el resultado final.',
    methodLimitsTextTwo: 'Usa la recomendación como punto de referencia y valida la sensibilidad dentro del juego antes de mantener un cambio.',
  },
} satisfies Record<Locale, Record<string, string>>

const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'Tudo', days: null },
]

const METRICS: { key: MetricKey; icon: typeof Crosshair; higherIsBetter: boolean; unit: '%' | 'ms' }[] = [
  { key: 'accuracy', icon: Crosshair, higherIsBetter: true, unit: '%' },
  { key: 'tracking', icon: MousePointer2, higherIsBetter: true, unit: '%' },
  { key: 'reaction', icon: RotateCcw, higherIsBetter: false, unit: 'ms' },
  { key: 'consistency', icon: Activity, higherIsBetter: true, unit: '%' },
]

const format = (value: number, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—'
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const validDate = (value: string | null | undefined) => value && Number.isFinite(new Date(value).getTime()) ? value : null

function periodLabel(period: PeriodKey, locale: Locale) {
  if (period === 'all') return copy[locale].all
  return `${period.replace('d', '')} dias`
}

function metricLabel(metric: MetricKey, locale: Locale) {
  const text = copy[locale]
  return metric === 'accuracy' ? text.precision : metric === 'tracking' ? text.tracking : metric === 'reaction' ? text.reaction : text.consistency
}

function formatValue(metric: MetricKey, value: number) {
  if (metric === 'reaction') return `${format(value)} ms`
  return `${format(value, 1)}%`
}

function formatDelta(metric: MetricKey, delta: number) {
  return metric === 'reaction' ? `${delta > 0 ? '+' : ''}${format(delta)} ms` : `${delta > 0 ? '+' : ''}${format(delta, 1)}%`
}

function formatTrend(metric: MetricKey, current: number | null, previous: number | null, locale: Locale) {
  if (current === null || previous === null) return copy[locale].waiting
  const delta = current - previous
  if (Math.abs(delta) < .01) return copy[locale].noBaseline
  const arrow = delta > 0 ? '↑' : '↓'
  const value = metric === 'reaction' ? `${format(Math.abs(delta))} ms` : `${format(Math.abs(delta), 1)}%`
  return `${arrow} ${value} vs ${copy[locale].previous.toLowerCase()}`
}

function dateLabel(value: string | null, locale: Locale) {
  if (!value) return copy[locale].noDate
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(new Date(value))
}

function dateTimeLabel(value: string | null, locale: Locale) {
  if (!value) return copy[locale].noDate
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function readWarmupEntries(sessions: TrainingSession[]) {
  return EXERCISES.flatMap(exercise => {
    const valid = sessions.filter(s => s.exerciseId === exercise.id && s.status === 'completed')
    const signature = valid[0]?.comparisonSignature
    return valid.filter(s => signature && s.comparisonSignature === signature).map(sessionSummary).filter(s => s !== null).map((session, index) => ({ exercise, session, index }))
  })
}

function getGameLabel(gameId?: GameSensitivityProfileId) {
  return gameId && GAME_BY_ID[gameId as keyof typeof GAME_BY_ID] ? GAME_BY_ID[gameId as keyof typeof GAME_BY_ID].shortLabel : null
}

function warmupToPoints(exercise: WarmupExerciseDefinition, session: WarmupSessionSummary, index: number): AnalysisPoint[] {
  const context = session.sessionContext
  const completedAt = validDate(session.completedAt)
  const base = {
    source: 'warmup' as const,
    completedAt,
    mode: exercise.name,
    gameId: context?.gameId,
    sensitivity: context?.sensitivity,
    dpi: context?.dpi,
    difficulty: context?.configuration?.difficulty,
  }
  const points: AnalysisPoint[] = [{ ...base, id: `${exercise.id}-${index}-accuracy`, metric: 'accuracy', value: session.accuracy }]
  if (exercise.id === 'tracking' || exercise.id === 'strafetrack') points.push({ ...base, id: `${exercise.id}-${index}-tracking`, metric: 'tracking', value: session.accuracy })
  if (session.reactionTimeMs > 0) points.push({ ...base, id: `${exercise.id}-${index}-reaction`, metric: 'reaction', value: session.reactionTimeMs })
  if (session.sniper?.consistency !== null && session.sniper?.consistency !== undefined) points.push({ ...base, id: `${exercise.id}-${index}-consistency`, metric: 'consistency', value: session.sniper.consistency })
  return points
}

function calibrationToPoints(game: GameConfig, session: CalibrationSessionSummary, index: number, previous?: CalibrationSessionSummary): AnalysisPoint[] {
  const base = {
    source: 'calibration' as const,
    completedAt: session.completedAt,
    mode: 'Calibração',
    gameId: game.id,
    sensitivity: session.sensitivity,
    dpi: session.dpi,
    previousSensitivity: previous && Math.abs(previous.sensitivity - session.sensitivity) > .0001 ? previous.sensitivity : undefined,
  }
  return [
    { ...base, id: `${game.id}-${index}-accuracy`, metric: 'accuracy', value: session.accuracy },
    { ...base, id: `${game.id}-${index}-consistency`, metric: 'consistency', value: session.playerConsistencyScore },
  ]
}

function collectAnalysisData(storage: Storage, sessions: TrainingSession[], labels: Record<SessionStatus, string>) {
  const warmupEntries = readWarmupEntries(sessions)
  const calibrationEntries = GAMES.flatMap((game) => {
    const sessions = readCalibrationHistory(storage, game.id)
    return sessions.map((session, index) => ({ game, session, index, previous: sessions[index + 1] }))
  })
  const points = [
    ...warmupEntries.flatMap(({ exercise, session, index }) => warmupToPoints(exercise, session, index)),
    ...calibrationEntries.flatMap(({ game, session, index, previous }) => calibrationToPoints(game, session, index, previous)),
  ].filter(point => Number.isFinite(point.value))
  const recents: RecentSession[] = [
    ...sessions.map(record => ({
      id: record.id,
      completedAt: record.finishedAt,
      title: EXERCISES.find(e => e.id === record.exerciseId)?.name ?? record.exerciseId,
      metricLine: record.status !== 'completed' || !record.metrics ? labels[record.status] :
        `${format(record.metrics.accuracy, 1)}% · ${record.config?.effectiveDifficulty ?? ''}`,
      presetLine: record.context ? `${getGameLabel(record.context.gameId) ?? record.context.gameId} · ${format(record.context.sensitivity, 3)} · ${record.context.dpi} DPI` : null,
    })),
    ...calibrationEntries.map(({ game, session }) => ({
      id: session.id,
      completedAt: session.completedAt,
      title: `${game.shortLabel} · Calibração`,
      metricLine: `${format(session.accuracy, 1)}% · ${format(session.playerConsistencyScore)}% consistência`,
      presetLine: `${game.shortLabel} · ${format(session.sensitivity, 3)} · ${session.dpi} DPI`,
    })),
  ].sort((left, right) => (validDate(right.completedAt) ?? '').localeCompare(validDate(left.completedAt) ?? ''))
  return { points, recents, warmupEntries, calibrationEntries }
}

function filterPeriod<T extends { completedAt: string | null }>(items: T[], period: PeriodKey) {
  const days = PERIODS.find(item => item.key === period)?.days
  if (!days) return items
  const dated = items.filter(item => item.completedAt)
  if (!dated.length) return []
  const latest = Math.max(...dated.map(item => new Date(item.completedAt!).getTime()))
  const start = latest - days * 24 * 60 * 60 * 1000
  return dated.filter(item => new Date(item.completedAt!).getTime() >= start)
}

function previousPeriod<T extends { completedAt: string | null }>(items: T[], period: PeriodKey) {
  const days = PERIODS.find(item => item.key === period)?.days
  if (!days) return []
  const dated = items.filter(item => item.completedAt)
  if (!dated.length) return []
  const latest = Math.max(...dated.map(item => new Date(item.completedAt!).getTime()))
  const currentStart = latest - days * 24 * 60 * 60 * 1000
  const previousStart = currentStart - days * 24 * 60 * 60 * 1000
  return dated.filter(item => {
    const time = new Date(item.completedAt!).getTime()
    return time >= previousStart && time < currentStart
  })
}

function comparisonRange(period: PeriodKey, locale: Locale) {
  const text = copy[locale]
  if (period === 'all') return { current: text.wholeHistory, previous: text.noPreviousPeriod }
  const label = periodLabel(period, locale)
  return { current: text.lastPeriod.replace('{period}', label), previous: text.previousPeriod.replace('{period}', label) }
}

function currentAndPrevious(points: AnalysisPoint[], metric: MetricKey, period: PeriodKey) {
  const metricPoints = points.filter(point => point.metric === metric)
  return {
    current: average(filterPeriod(metricPoints, period).map(point => point.value)),
    previous: average(previousPeriod(metricPoints, period).map(point => point.value)),
  }
}

function chartPoints(points: AnalysisPoint[]) {
  if (points.length < 2) return { line: '', area: '', nodes: [] as { x: number; y: number; point: AnalysisPoint }[] }
  const sorted = [...points].sort((left, right) => (validDate(left.completedAt) ?? '').localeCompare(validDate(right.completedAt) ?? ''))
  const values = sorted.map(point => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const nodes = sorted.map((point, index) => {
    const x = 22 + index * (656 / Math.max(1, sorted.length - 1))
    const y = 250 - ((point.value - min) / Math.max(1, max - min)) * 198
    return { x, y, point }
  })
  const line = nodes.map(node => `${node.x.toFixed(1)},${node.y.toFixed(1)}`).join(' ')
  return { line, area: `22,278 ${line} 678,278`, nodes }
}

function Methodology({ locale }: { locale: Locale }) {
  const text = copy[locale]
  const steps = [
    [text.methodStepOne, text.methodStepOneText],
    [text.methodStepTwo, text.methodStepTwoText],
    [text.methodStepThree, text.methodStepThreeText],
    [text.methodStepFour, text.methodStepFourText],
    [text.methodStepFive, text.methodStepFiveText],
  ]
  const metrics = [
    [text.methodMetricAccuracy, text.methodMetricAccuracyText],
    [text.methodMetricMeanError, text.methodMetricMeanErrorText],
    [text.methodMetricSmoothness, text.methodMetricSmoothnessText],
    [text.methodMetricOvershoot, text.methodMetricOvershootText],
    [text.methodMetricQuality, text.methodMetricQualityText],
    [text.methodMetricConsistency, text.methodMetricConsistencyText],
  ]
  const resultTerms = [
    [text.methodInterpretRecommendation, text.methodInterpretRecommendationText],
    [text.methodInterpretRange, text.methodInterpretRangeText],
    [text.methodInterpretStrength, text.methodInterpretStrengthText],
    [text.methodInterpretInconclusive, text.methodInterpretInconclusiveText],
  ]

  return <section className="analysis-workspace analysis-methodology">
    <header><h1>{text.methodTitle}</h1><p>{text.methodSubtitle}</p></header>
    <div className="analysis-method-document">
      <section className="analysis-method-section">
        <h2>{text.methodFlowTitle}</h2>
        <div className="analysis-method-steps">
          {steps.map(([title, description], index) => <article key={title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </article>)}
        </div>
      </section>

      <section className="analysis-method-section">
        <h2>{text.methodMetricsTitle}</h2>
        <dl className="analysis-method-table">
          {metrics.map(([term, description]) => <div key={term}>
            <dt>{term}</dt>
            <dd>{description}</dd>
          </div>)}
        </dl>
      </section>

      <section className="analysis-method-section analysis-method-narrative">
        <h2>{text.methodDecisionTitle}</h2>
        <p>{text.methodDecisionText}</p>
      </section>

      <section className="analysis-method-section">
        <h2>{text.methodInterpretTitle}</h2>
        <dl className="analysis-method-table">
          {resultTerms.map(([term, description]) => <div key={term}>
            <dt>{term}</dt>
            <dd>{description}</dd>
          </div>)}
        </dl>
      </section>

      <section className="analysis-method-section analysis-method-limits">
        <h2>{text.methodLimitsTitle}</h2>
        <p>{text.methodLimitsTextOne}</p>
        <p>{text.methodLimitsTextTwo}</p>
      </section>
    </div>
  </section>
}

export function Analysis({ section, onStartTraining }: Props) {
  const { locale, t } = useI18n()
  const text = copy[locale]
  const [period, setPeriod] = useState<PeriodKey>('7d')
  const [metric, setMetric] = useState<MetricKey>('accuracy')
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<AnalysisPoint | null>(null)
  const sessions = useSessionState()
  const data = useMemo(() => collectAnalysisData(window.localStorage, sessions.status === 'ready' ? sessions.items : [], {
    completed: t('sessions.completed'), invalid: t('sessions.invalid'), interrupted: t('sessions.interrupted'),
  }), [sessions, t])

  if (section === 'methodology') return <Methodology locale={locale} />

  const showOnlyCalibration = section === 'calibration-history'
  const chartMetricPoints = filterPeriod(data.points.filter(point => point.metric === metric), period)
  const chart = chartPoints(chartMetricPoints)
  const metricStates = METRICS.map((item) => ({ ...item, ...currentAndPrevious(data.points, item.key, period) }))
  const rangeText = comparisonRange(period, locale)

  return <section className="analysis-workspace analysis-dashboard">
    <header>
      <h1>{showOnlyCalibration ? text.calibration : text.title}</h1>
      <p>{text.subtitle}</p>
    </header>

    {!showOnlyCalibration && <>
      <div className="analysis-metric-strip">
        {metricStates.map((item) => {
          const Icon = item.icon
          return <article key={item.key} className="analysis-kpi-card">
            <Icon size={18} />
            <span>{metricLabel(item.key, locale)}</span>
            <strong>{item.current === null ? '—' : formatValue(item.key, item.current)}</strong>
            <small>{formatTrend(item.key, item.current, item.previous, locale)}</small>
          </article>
        })}
      </div>

      <div className="analysis-main-grid analysis-insight-grid">
        <article className="analysis-panel analysis-evolution analysis-evolution-primary">
          <div>
            <h2>{text.evolution}</h2>
            <div className="analysis-control-row" aria-label={text.evolution}>
              {PERIODS.map((item) => <button key={item.key} type="button" className={period === item.key ? 'active' : ''} onClick={() => { setPeriod(item.key); setHoveredPoint(null) }}>{item.key === 'all' ? text.all : item.label}</button>)}
            </div>
          </div>
          <div className="analysis-metric-tabs" role="tablist" aria-label={text.evolution}>
            {METRICS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={metric === item.key} className={metric === item.key ? 'active' : ''} onClick={() => { setMetric(item.key); setHoveredPoint(null) }}>{metricLabel(item.key, locale)}</button>)}
          </div>
          {chartMetricPoints.length >= 2 ? <div className="analysis-chart-wrap">
            <svg viewBox="0 0 700 300" role="img" aria-label={`${text.evolution}: ${metricLabel(metric, locale)}`}>
              <g className="analysis-chart-grid" aria-hidden="true">
                {[0, 1, 2, 3].map((line) => <line key={`h-${line}`} x1="22" x2="678" y1={52 + line * 66} y2={52 + line * 66} />)}
                {[0, 1, 2, 3, 4].map((line) => <line key={`v-${line}`} x1={22 + line * 164} x2={22 + line * 164} y1="36" y2="278" />)}
              </g>
              <polygon className="analysis-area" points={chart.area} />
              <polyline points={chart.line} />
              {chart.nodes.map((node) => <circle key={node.point.id} cx={node.x} cy={node.y} r="5" tabIndex={0} role="button" aria-label={`${dateLabel(node.point.completedAt, locale)} ${node.point.mode} ${formatValue(metric, node.point.value)}`} onMouseEnter={() => setHoveredPoint(node.point)} onMouseLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint(node.point)} onBlur={() => setHoveredPoint(null)} />)}
            </svg>
            {hoveredPoint && <div className="analysis-chart-tooltip" role="status">
              <b>{dateLabel(hoveredPoint.completedAt, locale)}</b>
              <strong>{hoveredPoint.mode}</strong>
              <span>{formatValue(metric, hoveredPoint.value)}</span>
              {hoveredPoint.gameId && <small>{getGameLabel(hoveredPoint.gameId) ?? hoveredPoint.gameId}</small>}
              {hoveredPoint.sensitivity && hoveredPoint.dpi && <small>{format(hoveredPoint.sensitivity, 3)} · {hoveredPoint.dpi} DPI</small>}
              {hoveredPoint.difficulty && <em>{hoveredPoint.difficulty}</em>}
              {hoveredPoint.previousSensitivity && hoveredPoint.sensitivity && <em>{getGameLabel(hoveredPoint.gameId)} {format(hoveredPoint.previousSensitivity, 3)} → {format(hoveredPoint.sensitivity, 3)}</em>}
            </div>}
          </div> : <div className="analysis-chart-empty">
            <strong>{text.emptyTitle}</strong>
            <p>{text.emptyText}</p>
            {onStartTraining && <button type="button" onClick={onStartTraining}>{text.startTraining}</button>}
          </div>}
        </article>

        <article className="analysis-panel analysis-period">
          <div><h2>{text.compare}</h2><CalendarDays size={17} /></div>
          <p className="analysis-period-range">{rangeText.current}<span>vs.</span>{rangeText.previous}</p>
          {metricStates.map((item) => {
            const delta = item.current === null || item.previous === null ? null : item.current - item.previous
            const improved = delta === null ? false : item.higherIsBetter ? delta > 0 : delta < 0
            return <p key={item.key}>
              <span>{metricLabel(item.key, locale)}</span>
              <b>{item.current === null ? '—' : formatValue(item.key, item.current)}</b>
              <em className={delta === null ? '' : improved ? 'positive' : 'negative'}>{delta === null ? text.noBaseline : formatDelta(item.key, delta)}</em>
            </p>
          })}
        </article>
      </div>

      <PersonalBestPanel />

      <article className="analysis-panel analysis-recent-panel">
        <div><h2>{text.sessions}</h2><button type="button" onClick={() => setShowAllRecent((value) => !value)}>{text.fullHistory}</button></div>
        {data.recents.length ? <div className="analysis-session-list">
          {data.recents.slice(0, showAllRecent ? data.recents.length : 5).map((session) => <section key={session.id}>
            <time>{dateTimeLabel(session.completedAt, locale)}</time>
            <strong>{session.title}</strong>
            <span>{session.metricLine}</span>
            {session.presetLine && <small>{session.presetLine}</small>}
          </section>)}
        </div> : <p className="analysis-empty">{text.emptyText}</p>}
      </article>
    </>}

    {showOnlyCalibration && <div className="analysis-history-grid">
      <article className="analysis-panel"><div><h2>{text.calibration}</h2><span>{data.calibrationEntries.length}</span></div>{data.calibrationEntries.length ? data.calibrationEntries.slice(0, 12).map(({ game, session, previous }) => <div className="analysis-history-row" key={session.id}><span><b>{game.shortLabel}</b><small>{dateTimeLabel(session.completedAt, locale)}</small></span><strong>{format(session.sensitivity, 3)}</strong><em>{previous && Math.abs(previous.sensitivity - session.sensitivity) > .0001 ? `${format(previous.sensitivity, 3)} → ${format(session.sensitivity, 3)}` : `${format(session.confidenceScore)}%`}</em></div>) : <p className="analysis-empty">{text.emptyText}</p>}</article>
    </div>}
  </section>
}
