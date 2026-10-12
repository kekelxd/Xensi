import { AnimatedMetric } from './design/AnimatedMetric'
import type { ReactNode } from 'react'
import { Activity, BrainCircuit, CheckCircle2, History, Target, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react'
import { type CalibrationReport, type CalibrationSessionSummary } from './calibration'
import type { GameConfig } from './games'
import { formatSensitivity, normalizeSensitivity } from './sensitivity'
import { useI18n, type TranslationKey } from './i18n'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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

const eyebrow = 'text-xs font-medium leading-none text-muted-foreground'

function SectionHeading({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="m-0 flex items-center gap-2 font-heading text-base font-semibold text-foreground"><Icon className="size-4 text-primary" aria-hidden="true" />{title}</h3>
    {hint && <small className="text-xs text-subtle">{hint}</small>}
  </div>
}

function Tile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return <div className="grid min-w-0 content-start gap-2 rounded-lg border border-solid border-border bg-black/20 p-3.5">
    <span className={eyebrow}>{label}</span>
    <strong className={cn('font-mono text-base font-medium leading-tight tabular-nums [overflow-wrap:anywhere]', tone ?? 'text-foreground')}>{value}</strong>
    {hint && <small className="text-xs leading-snug text-subtle">{hint}</small>}
  </div>
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

  const strengthTone = report.confidence === 'high' ? 'text-success' : report.confidence === 'exploratory' ? 'text-warning' : 'text-foreground'
  const validationTone = report.validationStatus === 'confirmed' ? 'text-success' : report.validationStatus === 'unavailable' ? 'text-foreground' : report.validationStatus === 'split' ? 'text-warning' : 'text-destructive'
  const tableGrid = 'grid grid-cols-[minmax(130px,1.5fr)_repeat(4,minmax(54px,1fr))_minmax(90px,1.2fr)] items-center gap-3'

  return (
    <div className="grid gap-3.5">
      <Alert variant={StatusIcon === TriangleAlert ? 'warning' : 'success'}>
        <StatusIcon /><span className="col-start-2">{t(REASON_KEYS[report.reason])}</span>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <Card className="content-start gap-2 p-5">
          <span className={eyebrow}>{t(HERO_LABEL_KEYS[report.resultKind])} · {game.label}</span>
          <strong className="font-mono text-[clamp(32px,4vw,44px)] font-medium leading-none tabular-nums text-success">{formatSensitivity(recommendedSensitivity, 6)}</strong>
          <small className="text-xs text-muted-foreground">{directionText}</small>
        </Card>
        <Card accent className="content-start gap-2 p-5">
          <span className={eyebrow}>{t('calibration.recommendationStrength')}</span>
          <strong className={cn('font-mono text-3xl font-medium leading-none tabular-nums', strengthTone)}>{report.recommendationStrengthScore}%</strong>
          <small className="text-xs text-muted-foreground">{t(confidenceKey)}</small>
        </Card>
      </div>

      <Card className="gap-4 p-5">
        <SectionHeading icon={Target} title={t('calibration.whatToDoNow')} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={t('calibration.directionIndicated')} value={signed(report.changePercent, '%')} hint={directionText} />
          <Tile label={t('calibration.adjustmentZone')} value={rangeText} hint={zoneHint} />
          <Tile label={canRefine ? t('calibration.nextTest') : t('calibration.refinementStatus')} value={canRefine ? refinementValues : t(isRefinement ? 'calibration.refinementCompleted' : 'calibration.refinementNotNeeded')} hint={canRefine ? t('calibration.nextTestHint') : t(isRefinement ? 'calibration.refinementCompletedHint' : 'calibration.refinementNotNeededHint')} />
          <Tile label={t('calibration.finalValidation')} value={validationRecord} tone={validationTone} hint={<><b className="font-semibold">{t(VALIDATION_LABEL_KEYS[report.validationStatus])}</b> · {validationText}</>} />
        </div>
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="content-start gap-4 p-5">
          <SectionHeading icon={BrainCircuit} title={t('calibration.whyTitle')} />
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">{conclusionText}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Tile label={t('common.accuracy')} value={`${format(report.bestResult.accuracy)}%`} hint={`${signed(report.bestResult.accuracy - baseline.accuracy, ' pp')} ${t('calibration.vsBaseClear')}`} />
            <Tile label={t('common.meanError')} value={`${format(report.bestResult.meanError)}px`} hint={`${signed(report.bestResult.meanError - baseline.meanError, ' px')} ${t('calibration.vsBaseClear')}`} />
            <Tile label={t('common.score')} value={<AnimatedMetric value={report.bestResult.score} format={value => format(value ?? report.bestResult.score)} />} hint={t('calibration.scoreGapHint', { gap: format(report.scoreGap) })} />
            <Tile label={t('calibration.playerConsistency')} value={`${format(report.playerConsistencyScore)}%`} hint={t('calibration.playerConsistencyHint')} />
          </div>
        </Card>

        <Card className="content-start gap-3 p-5">
          <SectionHeading icon={Activity} title={t('calibration.howCalculated')} />
          <ul className="m-0 grid list-none gap-2 p-0">
            {([['52%', t('common.accuracy'), false], ['33%', t('calibration.errorControl'), false], ['15%', t('common.smoothness'), false], ['−', t('calibration.overshootPenalty'), true]] as const).map(([weight, label, penalty]) => (
              <li key={label} className="grid grid-cols-[48px_1fr] items-center gap-3 text-sm">
                <span className={cn('font-mono tabular-nums', penalty ? 'text-primary' : 'text-success')}>{weight}</span><strong className="font-medium text-foreground">{label}</strong>
              </li>
            ))}
          </ul>
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">{t('calibration.formulaExplanationPhysical')}</p>
          <small className="text-xs leading-relaxed text-subtle">{t('calibration.strengthExplanation')}</small>
        </Card>
      </div>

      <Card className="gap-4 p-5">
        <SectionHeading icon={TrendingUp} title={t('calibration.testedValuesEvidence')} hint={t('calibration.testedValuesHint')} />
        <div className="grid gap-1.5 overflow-x-auto">
          <div className={cn(tableGrid, 'min-w-[620px] px-3 text-xs font-medium text-subtle')}><span>{t('common.sensitivity')}</span><span>{t('common.accuracy')}</span><span>{t('common.meanError')}</span><span>{t('calibration.repeatability')}</span><span>{t('calibration.validationColumn')}</span><span>{t('common.score')}</span></div>
          {report.candidateResults.map((testedValue) => {
            const competitive = report.competitiveResults.some((item) => item.candidateId === testedValue.candidateId)
            const inZone = report.zoneResults.some((item) => item.candidateId === testedValue.candidateId)
            const best = testedValue.candidateId === report.bestResult.candidateId
            return (
              <div key={testedValue.candidateId} className={cn(tableGrid, 'min-w-[620px] rounded-lg border border-solid px-3 py-2 font-mono text-[13px] tabular-nums', best ? 'border-success/50 bg-success/[.08]' : inZone || competitive ? 'border-success/20 bg-success/[.03]' : 'border-border bg-black/20')}>
                <span className="grid gap-0.5">
                  <b className="font-medium text-foreground">{formatSensitivity(testedValue.sensitivity, 6)}</b>
                  <small className="font-sans text-xs text-subtle">{format(testedValue.multiplier, 2)}× · {t('calibration.roundCountCompact', { measurements: testedValue.measurementRounds.length, validation: testedValue.validationRounds.length })}</small>
                </span>
                <span>{format(testedValue.accuracy)}%</span>
                <span>{format(testedValue.meanError)}px</span>
                <span>{format(testedValue.repeatability)}%</span>
                <span>{testedValue.validationScore === null ? '—' : format(testedValue.validationScore)}</span>
                <span className="grid grid-cols-[1fr_32px] items-center gap-2">
                  <i className="h-1 overflow-hidden rounded-full bg-foreground/10"><em className={cn('block h-full rounded-full not-italic', competitive || best ? 'bg-success' : 'bg-primary')} style={{ width: `${testedValue.score}%` }} /></i>
                  <b className="font-medium text-foreground">{format(testedValue.score)}</b>
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="grid gap-px overflow-hidden bg-border p-0 sm:grid-cols-2 lg:grid-cols-4">
        {([
          [t('calibration.collectionQuality'), `${format(report.collectionQualityScore)}%`, t('calibration.collectionQualityHint')],
          [t('calibration.playerConsistency'), `${format(report.playerConsistencyScore)}%`, t('calibration.playerConsistencyHint')],
          [t('calibration.recommendationStrength'), `${format(report.recommendationStrengthScore)}%`, t('calibration.recommendationStrengthHint')],
          [t('calibration.completedRounds'), `${report.validRoundCount}/${report.expectedRoundCount}`, t('calibration.completedRoundsHint')],
        ] as const).map(([label, value, hint]) => <div key={label} className="grid content-start gap-2 bg-card px-5 py-4">
          <span className={eyebrow}>{label}</span><strong className="font-mono text-lg font-medium leading-none tabular-nums text-foreground">{value}</strong><small className="text-xs leading-snug text-subtle">{hint}</small>
        </div>)}
      </Card>

      {previous ? (
        <Card className="gap-4 p-5">
          <SectionHeading icon={TrendingUp} title={t('calibration.previousSession')} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={t('common.sensitivity')} value={signed(recommendedSensitivity - previous.sensitivity)} tone="text-success" />
            <Tile label={t('common.score')} value={signed(report.score - previous.score)} tone="text-success" />
            <Tile label={t('common.accuracy')} value={signed(report.accuracy - previous.accuracy, ' pp')} tone="text-success" />
            <Tile label={t('common.meanError')} value={signed(report.meanError - previous.meanError, ' px')} tone="text-success" />
          </div>
        </Card>
      ) : null}

      <Card className="gap-4 p-5">
        <SectionHeading icon={History} title={t('calibration.historyTitle')} hint={t('calibration.historyCount', { count: history.length })} />
        {history.length ? (
          <ul className="m-0 grid list-none p-0">
            {history.slice(0, 5).map((session) => (
              <li key={session.id} className="grid grid-cols-[1fr_1fr_1.2fr_48px] items-baseline gap-3 border-0 border-t border-solid border-border py-2.5 text-[13px] first:border-t-0">
                <span className="text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(new Date(session.completedAt))}</span>
                <strong className="font-mono font-medium tabular-nums text-foreground">{formatSensitivity(session.sensitivity, 6)}</strong>
                <small className="text-muted-foreground">{session.cmPer360 === null ? t('calibration.cmPer360Unavailable') : `${format(session.cmPer360, 2)} cm/360°`}</small>
                <b className="text-right font-mono font-medium tabular-nums text-success">{format(session.recommendationStrengthScore, 0)}%</b>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-sm text-muted-foreground">{t('calibration.historyEmpty')}</p>}
        {averageCmPer360 !== null && <small className="text-xs text-subtle">{t('calibration.historyPhysicalAverage', { value: format(averageCmPer360, 2) })}</small>}
      </Card>

      <small className="text-xs leading-relaxed text-subtle">{t('calibration.disclaimerV3')}</small>
      <div className="flex flex-col-reverse gap-2.5 border-0 border-t border-solid border-border pt-5 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onRedo}>{t('calibration.redo')}</Button>
        {canRefine
          ? <Button onClick={onRefine}>{t('calibration.refineFinal')}</Button>
          : <Button onClick={onClose}>{t(canUseResult ? 'calibration.finish' : 'calibration.closeReport')}</Button>}
      </div>
    </div>
  )
}
