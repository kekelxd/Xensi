import { useMemo } from 'react'
import { readCalibrationHistory } from './calibration'
import { GAMES } from './games'
import { useI18n, type Locale } from './i18n'
import type { AnalysisSection } from './AppNavigation'
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

export function CalibrationAnalysis({ section }: { section: AnalysisSection }) {
  const { locale } = useI18n(), text = copy[locale]
  const entries = useMemo(() => GAMES.flatMap(game => readCalibrationHistory(localStorage, game.id).map((session, i, history) => ({ game, session, previous: history[i + 1] }))).sort((a,b) => b.session.completedAt.localeCompare(a.session.completedAt)), [])
  const format = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(v)
  if (section === 'methodology') return <Methodology locale={locale} />
  return <section className="analysis-workspace"><header><h1>{text.calibration}</h1></header><div className="analysis-history-grid"><article className="analysis-panel"><h2>{text.calibration}</h2>{entries.length ? entries.slice(0,12).map(({game,session,previous}) => <div className="analysis-history-row" key={session.id}><span><b>{game.shortLabel}</b><small>{new Intl.DateTimeFormat(locale,{dateStyle:'short',timeStyle:'short'}).format(new Date(session.completedAt))}</small></span><strong>{format(session.sensitivity)}</strong><em>{previous && previous.sensitivity !== session.sensitivity ? `${format(previous.sensitivity)} → ${format(session.sensitivity)}` : `${format(session.confidenceScore)}%`}</em></div>) : <p>{text.emptyText}</p>}</article></div></section>
}
