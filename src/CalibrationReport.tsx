import { AnimatedMetric } from './design/AnimatedMetric'
import { Activity, BrainCircuit, CheckCircle2, History, Target, TrendingUp, TriangleAlert } from 'lucide-react'
import { type CalibrationReport, type CalibrationSessionSummary } from './calibration'
import type { GameConfig } from './games'
import { formatSensitivity, normalizeSensitivity } from './sensitivity'
import { useI18n, type TranslationKey } from './i18n'

type Props = {
  report: CalibrationReport
  previous: CalibrationSessionSummary | null
  history: CalibrationSessionSummary[]
  game: GameConfig
  baseSensitivity: number
  recommendedSensitivity: number
  recommendedRangeMin: number
  recommendedRangeMax: number
  canRefine: boolean
  isRefinement: boolean
  onRefine: () => void
  onRedo: () => void
  onClose: () => void
}

const format = (value: number, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '0'
const signed = (value: number, suffix = '') => `${value > 0 ? '+' : ''}${format(value, 1)}${suffix}`

const REASON_KEYS: Record<CalibrationReport['reason'], TranslationKey> = {
  confirmed: 'calibration.reasonConfirmed',
  'close-candidates': 'calibration.reasonCloseCandidates',
  'split-candidates': 'calibration.reasonSplitCandidates',
  'low-consistency': 'calibration.reasonLowConsistency',
  'low-signal': 'calibration.reasonLowSignal',
  incomplete: 'calibration.reasonIncomplete',
  'validation-reversed': 'calibration.reasonValidationReversed',
  'validation-split': 'calibration.reasonValidationSplit',
}

const DIRECTION_KEYS: Record<CalibrationReport['direction'], TranslationKey> = {
  lower: 'calibration.directionLower',
  higher: 'calibration.directionHigher',
  'near-base': 'calibration.directionNearBase',
}

const HERO_LABEL_KEYS: Record<CalibrationReport['resultKind'], TranslationKey> = {
  recommended: 'calibration.confirmedValue',
  range: 'calibration.startingPoint',
  inconclusive: 'calibration.bestObserved',
  invalid: 'calibration.bestObserved',
}

const VALIDATION_LABEL_KEYS: Record<CalibrationReport['validationStatus'], TranslationKey> = {
  confirmed: 'calibration.validationStatusConfirmed',
  split: 'calibration.validationStatusSplit',
  reversed: 'calibration.validationStatusReversed',
  unavailable: 'calibration.validationStatusUnavailable',
}

function getConclusionKey(report: CalibrationReport): TranslationKey {
  if (report.reason === 'confirmed') return 'calibration.conclusionConfirmed'
  if (report.reason === 'close-candidates') return 'calibration.conclusionRange'
  if (report.reason === 'split-candidates') return 'calibration.conclusionSplit'
  if (report.reason === 'validation-reversed') return 'calibration.conclusionValidationReversed'
  if (report.reason === 'validation-split') return 'calibration.conclusionValidationSplit'
  if (report.reason === 'low-consistency') return 'calibration.conclusionLowConsistency'
  if (report.reason === 'incomplete') return 'calibration.conclusionIncomplete'
  return 'calibration.conclusionLowSignal'
}

export function CalibrationReportView({
  report,
  previous,
  history,
  game,
  baseSensitivity,
  recommendedSensitivity,
  recommendedRangeMin,
  recommendedRangeMax,
  canRefine,
  isRefinement,
  onRefine,
  onRedo,
  onClose,
}: Props) {
  const { t } = useI18n()
  const baseline = report.baselineResult
  const confidenceKey = `calibration.confidence${report.confidence[0].toUpperCase()}${report.confidence.slice(1)}` as TranslationKey
  const StatusIcon = report.resultKind === 'inconclusive' || report.resultKind === 'invalid' ? TriangleAlert : CheckCircle2
  const sortedByScore = [...report.candidateResults].sort((left, right) => right.score - left.score)
  const secondResult = sortedByScore[1] ?? report.bestResult
  const canUseResult = report.resultKind === 'recommended' || report.resultKind === 'range'
  const zoneIsRange = report.zoneResults.length > 1
  const rangeText = zoneIsRange
    ? `${formatSensitivity(recommendedRangeMin, 6)} – ${formatSensitivity(recommendedRangeMax, 6)}`
    : report.resultKind === 'recommended'
      ? formatSensitivity(recommendedSensitivity, 6)
      : t('calibration.refinementRequired')
  const zoneHint = zoneIsRange
    ? t('calibration.zoneHint')
    : report.resultKind === 'recommended'
      ? t('calibration.singlePointHint')
      : t('calibration.noContinuousZoneHint')
  const refinementValues = report.refinementMultipliers
    .map((multiplier) => normalizeSensitivity(baseSensitivity * multiplier, game))
    .map((sensitivity) => formatSensitivity(sensitivity, 6))
    .join(' · ')
  const directionText = t(DIRECTION_KEYS[report.direction], {
    percent: format(Math.abs(report.changePercent), 0),
    base: formatSensitivity(baseSensitivity, 6),
  })
  const validationWinner = report.validationWinner
    ? formatSensitivity(report.validationWinner.sensitivity, 6)
    : null
  const validationRecord = report.validationStatus === 'unavailable'
    ? '—'
    : report.validationStatus === 'split'
      ? `${report.validationConfirmedRounds}–${report.validationAlternativeRounds}${report.validationTiedRounds > 0 ? ` · ${report.validationTiedRounds} ${t('calibration.validationTieShort')}` : ''}`
      : `${report.validationConfirmedRounds}/${report.validationTotalRounds}`
  const validationText = report.validationStatus === 'unavailable'
    ? t('calibration.validationUnavailable')
    : report.validationStatus === 'confirmed'
      ? t('calibration.validationConfirmedCount', {
          confirmed: report.validationConfirmedRounds,
          total: report.validationTotalRounds,
          value: validationWinner ?? formatSensitivity(report.bestResult.sensitivity, 6),
        })
      : report.validationStatus === 'split'
        ? validationWinner
          ? t('calibration.validationSplitCount', {
              confirmed: report.validationConfirmedRounds,
              alternative: report.validationAlternativeRounds,
              ties: report.validationTiedRounds,
              total: report.validationTotalRounds,
              value: validationWinner,
              gap: format(report.validationScoreGap ?? 0),
            })
          : t('calibration.validationSplitTieCount', {
              confirmed: report.validationConfirmedRounds,
              alternative: report.validationAlternativeRounds,
              ties: report.validationTiedRounds,
              total: report.validationTotalRounds,
            })
        : t('calibration.validationReversedCount', {
            alternative: report.validationAlternativeRounds,
            total: report.validationTotalRounds,
            value: validationWinner ?? formatSensitivity(report.bestResult.sensitivity, 6),
          })
  const conclusionText = t(getConclusionKey(report), {
    best: formatSensitivity(report.bestResult.sensitivity, 6),
    second: formatSensitivity(secondResult.sensitivity, 6),
    bestScore: format(report.bestResult.score),
    secondScore: format(secondResult.score),
    gap: format(report.scoreGap),
    zoneMin: formatSensitivity(recommendedRangeMin, 6),
    zoneMax: formatSensitivity(recommendedRangeMax, 6),
    base: formatSensitivity(baseSensitivity, 6),
    repeatability: format(report.repeatabilityScore, 0),
    blockAgreement: format(report.blockAgreementScore, 0),
    validationWinner: validationWinner ?? formatSensitivity(report.bestResult.sensitivity, 6),
    validationRecord,
  })
  const physicalHistory = history.filter((session) => session.cmPer360 !== null)
  const averageCmPer360 = physicalHistory.length
    ? physicalHistory.reduce((sum, session) => sum + (session.cmPer360 ?? 0), 0) / physicalHistory.length
    : null

  return (
    <>
      <div className={`calibration-result-status result-${report.resultKind}`}>
        <StatusIcon size={16} />
        <span>{t(REASON_KEYS[report.reason])}</span>
      </div>

      <div className="calibration-result-hero">
        <div>
          <span>{t(HERO_LABEL_KEYS[report.resultKind])} · {game.label}</span>
          <strong>{formatSensitivity(recommendedSensitivity, 6)}</strong>
          <small>{directionText}</small>
        </div>
        <div className={`calibration-confidence confidence-${report.confidence}`}>
          <span>{t('calibration.recommendationStrength')}</span>
          <strong>{report.recommendationStrengthScore}%</strong>
          <small>{t(confidenceKey)}</small>
        </div>
      </div>

      <section className="calibration-action-panel">
        <div className="report-section-heading"><div><Target size={16} /><span>{t('calibration.whatToDoNow')}</span></div></div>
        <div className="calibration-action-grid">
          <div>
            <span>{t('calibration.directionIndicated')}</span>
            <strong>{signed(report.changePercent, '%')}</strong>
            <small>{directionText}</small>
          </div>
          <div>
            <span>{t('calibration.adjustmentZone')}</span>
            <strong>{rangeText}</strong>
            <small>{zoneHint}</small>
          </div>
          <div>
            <span>{canRefine ? t('calibration.nextTest') : t('calibration.refinementStatus')}</span>
            <strong>{canRefine ? refinementValues : t(isRefinement ? 'calibration.refinementCompleted' : 'calibration.refinementNotNeeded')}</strong>
            <small>{canRefine ? t('calibration.nextTestHint') : t(isRefinement ? 'calibration.refinementCompletedHint' : 'calibration.refinementNotNeededHint')}</small>
          </div>
          <div className={`validation-summary validation-${report.validationStatus}`}>
            <span>{t('calibration.finalValidation')}</span>
            <strong>{validationRecord}</strong>
            <small><b>{t(VALIDATION_LABEL_KEYS[report.validationStatus])}</b> · {validationText}</small>
          </div>
        </div>
      </section>

      <div className="calibration-report-dashboard">
        <section className="calibration-explanation">
          <div className="report-section-heading"><div><BrainCircuit size={16} /><span>{t('calibration.whyTitle')}</span></div></div>
          <p>{conclusionText}</p>
          <div className="calibration-reason-grid">
            <div><span>{t('common.accuracy')}</span><strong>{format(report.bestResult.accuracy)}%</strong><small>{signed(report.bestResult.accuracy - baseline.accuracy, ' pp')} {t('calibration.vsBaseClear')}</small></div>
            <div><span>{t('common.meanError')}</span><strong>{format(report.bestResult.meanError)}px</strong><small>{signed(report.bestResult.meanError - baseline.meanError, ' px')} {t('calibration.vsBaseClear')}</small></div>
            <div><span>{t('common.score')}</span><strong><AnimatedMetric value={report.bestResult.score} format={value => format(value ?? report.bestResult.score)} /></strong><small>{t('calibration.scoreGapHint', { gap: format(report.scoreGap) })}</small></div>
            <div><span>{t('calibration.playerConsistency')}</span><strong>{format(report.playerConsistencyScore)}%</strong><small>{t('calibration.playerConsistencyHint')}</small></div>
          </div>
        </section>

        <section className="calibration-formula">
          <div className="report-section-heading"><div><Activity size={16} /><span>{t('calibration.howCalculated')}</span></div></div>
          <div className="formula-line"><span>52%</span><strong>{t('common.accuracy')}</strong></div>
          <div className="formula-line"><span>33%</span><strong>{t('calibration.errorControl')}</strong></div>
          <div className="formula-line"><span>15%</span><strong>{t('common.smoothness')}</strong></div>
          <div className="formula-line penalty"><span>−</span><strong>{t('calibration.overshootPenalty')}</strong></div>
          <p>{t('calibration.formulaExplanationPhysical')}</p>
          <small>{t('calibration.strengthExplanation')}</small>
        </section>

        <section className="calibration-tested-values">
          <div className="report-section-heading"><div><TrendingUp size={16} /><span>{t('calibration.testedValuesEvidence')}</span></div><small>{t('calibration.testedValuesHint')}</small></div>
          <div className="sensitivity-table sensitivity-table-v3">
            <div className="sensitivity-table-head"><span>{t('common.sensitivity')}</span><span>{t('common.accuracy')}</span><span>{t('common.meanError')}</span><span>{t('calibration.repeatability')}</span><span>{t('calibration.validationColumn')}</span><span>{t('common.score')}</span></div>
            {report.candidateResults.map((testedValue) => {
              const competitive = report.competitiveResults.some((item) => item.candidateId === testedValue.candidateId)
              const inZone = report.zoneResults.some((item) => item.candidateId === testedValue.candidateId)
              const best = testedValue.candidateId === report.bestResult.candidateId
              const className = best ? 'best' : inZone ? 'zone' : competitive ? 'competitive' : ''
              return (
                <div key={testedValue.candidateId} className={className}>
                  <span>
                    <b>{formatSensitivity(testedValue.sensitivity, 6)}</b>
                    <small>{format(testedValue.multiplier, 2)}× · {t('calibration.roundCountCompact', { measurements: testedValue.measurementRounds.length, validation: testedValue.validationRounds.length })}</small>
                  </span>
                  <span>{format(testedValue.accuracy)}%</span>
                  <span>{format(testedValue.meanError)}px</span>
                  <span>{format(testedValue.repeatability)}%</span>
                  <span>{testedValue.validationScore === null ? '—' : format(testedValue.validationScore)}</span>
                  <span><i><em style={{ width: `${testedValue.score}%` }} /></i><b>{format(testedValue.score)}</b></span>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section className="calibration-quality">
        <div><span>{t('calibration.collectionQuality')}</span><strong>{format(report.collectionQualityScore)}%</strong><small>{t('calibration.collectionQualityHint')}</small></div>
        <div><span>{t('calibration.playerConsistency')}</span><strong>{format(report.playerConsistencyScore)}%</strong><small>{t('calibration.playerConsistencyHint')}</small></div>
        <div><span>{t('calibration.recommendationStrength')}</span><strong>{format(report.recommendationStrengthScore)}%</strong><small>{t('calibration.recommendationStrengthHint')}</small></div>
        <div><span>{t('calibration.completedRounds')}</span><strong>{report.validRoundCount}/{report.expectedRoundCount}</strong><small>{t('calibration.completedRoundsHint')}</small></div>
      </section>

      {previous ? (
        <section className="calibration-previous calibration-previous-compact">
          <div className="report-section-heading"><div><TrendingUp size={16} /><span>{t('calibration.previousSession')}</span></div></div>
          <div>
            <span>{t('common.sensitivity')} <strong>{signed(recommendedSensitivity - previous.sensitivity)}</strong></span>
            <span>{t('common.score')} <strong>{signed(report.score - previous.score)}</strong></span>
            <span>{t('common.accuracy')} <strong>{signed(report.accuracy - previous.accuracy, ' pp')}</strong></span>
            <span>{t('common.meanError')} <strong>{signed(report.meanError - previous.meanError, ' px')}</strong></span>
          </div>
        </section>
      ) : null}

      <section className="calibration-history">
        <div className="report-section-heading"><div><History size={16} /><span>{t('calibration.historyTitle')}</span></div><small>{t('calibration.historyCount', { count: history.length })}</small></div>
        {history.length ? (
          <div className="calibration-history-list">
            {history.slice(0, 5).map((session) => (
              <div key={session.id}>
                <span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(new Date(session.completedAt))}</span>
                <strong>{formatSensitivity(session.sensitivity, 6)}</strong>
                <small>{session.cmPer360 === null ? t('calibration.cmPer360Unavailable') : `${format(session.cmPer360, 2)} cm/360°`}</small>
                <b>{format(session.recommendationStrengthScore, 0)}%</b>
              </div>
            ))}
          </div>
        ) : <p>{t('calibration.historyEmpty')}</p>}
        {averageCmPer360 !== null && <small className="calibration-history-note">{t('calibration.historyPhysicalAverage', { value: format(averageCmPer360, 2) })}</small>}
      </section>

      <small className="disclaimer">{t('calibration.disclaimerV3')}</small>
      <div className="calibration-result-actions">
        <button className="secondary-button" onClick={onRedo}>{t('calibration.redo')}</button>
        {canRefine
          ? <button className="primary-button" onClick={onRefine}>{t('calibration.refineFinal')}</button>
          : <button className="primary-button" onClick={onClose}>{t(canUseResult ? 'calibration.finish' : 'calibration.closeReport')}</button>}
      </div>
    </>
  )
}
