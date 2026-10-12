import { XensiPageHeader } from './design/Primitives'
import { AnimatedMetric } from './design/AnimatedMetric'
import { useId, useMemo, useState } from 'react'
import { ArrowLeftRight, Check, ChevronDown, Copy, Info, ShieldCheck } from 'lucide-react'
import { GAME_SENSITIVITY_PROFILES, GAME_SENSITIVITY_PROFILE_BY_ID, type GameSensitivityProfile, type GameSensitivityProfileId, type VerificationStatus } from './gameSensitivityProfiles'
import { convertSensitivity, isFullyVerified, validateGameProfile, type ResidualErrorClassification } from './sensitivityConversionEngine'
import { formatSensitivity } from './sensitivity'
import { useI18n } from './i18n'
import { GameSelect } from './GameSelect'
import { PresetSelection } from './PresetSelection'
import { useSensitivityPreset, type PresetLaunch } from './useSensitivityPreset'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const STATUS_KEYS: Record<VerificationStatus, 'converter.statusVerified' | 'converter.statusCrossVerified' | 'converter.statusMeasured' | 'converter.statusExperimental'> = {
  verified: 'converter.statusVerified', cross_verified: 'converter.statusCrossVerified', measured: 'converter.statusMeasured', experimental: 'converter.statusExperimental',
}

const STATUS_BADGE: Record<VerificationStatus, 'success' | 'warning' | 'outline'> = { verified: 'success', cross_verified: 'success', measured: 'warning', experimental: 'outline' }
const ERROR_TONE: Record<ResidualErrorClassification, string> = { negligible: 'text-success', very_low: 'text-success', low: 'text-warning', noticeable: 'text-primary' }
const eyebrow = 'text-xs font-medium leading-none text-muted-foreground'
const readout = 'grid gap-2 rounded-lg border border-solid border-border bg-black/25 px-4 py-3'

function NumberField({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode: 'decimal' | 'numeric' }) {
  const id = useId()
  return <div className="grid min-w-0 content-start gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type="text" inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} className="font-mono text-lg tabular-nums" />
  </div>
}

function coefficientOf(profile: GameSensitivityProfile) {
  return profile.angularModel.type === 'linear' ? profile.angularModel.coefficient : null
}

type SensitivityConverterProps = {
  initialPreset?: PresetLaunch | null
}

export function SensitivityConverter({ initialPreset = null }: SensitivityConverterProps) {
  const { t, locale } = useI18n()
  const config = useSensitivityPreset('cs2', initialPreset)
  const sourceId = config.draft.gameId
  const [targetId, setTargetId] = useState<GameSensitivityProfileId>(initialPreset?.gameId === 'fortnite' ? 'cs2' : 'fortnite')
  const { sensitivity: sourceValue, dpi: sourceDpi } = config.draft
  const { setSensitivity: setSourceValue, setDpi: setSourceDpi } = config
  const [targetDpi, setTargetDpi] = useState(initialPreset ? String(initialPreset.dpi) : '800')
  const [copied, setCopied] = useState(false)
  const source = GAME_SENSITIVITY_PROFILE_BY_ID[sourceId]
  const target = GAME_SENSITIVITY_PROFILE_BY_ID[targetId]
  const numericValue = Number(sourceValue.replace(',', '.'))
  const numericSourceDpi = Number(sourceDpi.replace(',', '.'))
  const numericTargetDpi = Number(targetDpi.replace(',', '.'))
  const sourceProfileErrors = validateGameProfile(source)
  const targetProfileErrors = validateGameProfile(target)
  const result = useMemo(() => convertSensitivity(numericValue, source, target, numericSourceDpi, numericTargetDpi), [numericSourceDpi, numericTargetDpi, numericValue, source, target])
  const invalidInput = !Number.isFinite(numericValue) || numericValue <= 0
  const invalidDpi = !Number.isFinite(numericSourceDpi) || numericSourceDpi <= 0 || !Number.isFinite(numericTargetDpi) || numericTargetDpi <= 0
  const unsupported = !source.supportedMethods.hipfire360 || !target.supportedMethods.hipfire360
  const unverified = !isFullyVerified(source.verification.status) || !isFullyVerified(target.verification.status)
  const exactLabel = result === null ? '--' : formatSensitivity(result.exactSensitivity, 6)
  const configurableLabel = result === null ? '--' : formatSensitivity(result.configurableSensitivity, 6)
  const duplicateValues = result !== null && Math.abs(result.exactSensitivity - result.configurableSensitivity) < 1e-12
  const statusLabel = (status: VerificationStatus) => t(STATUS_KEYS[status])
  const errorLabel = result === null ? '—' : result.relativeErrorPercent < 0.01 ? t('converter.residualUnder') : `${result.relativeErrorPercent.toFixed(3)}%`

  const swapGames = () => {
    config.replace(targetId, result !== null ? formatSensitivity(result.configurableSensitivity) : sourceValue, targetDpi)
    setTargetId(sourceId); setTargetDpi(sourceDpi); setCopied(false)
  }
  const copyResult = async () => {
    if (result === null) return
    await navigator.clipboard.writeText(configurableLabel)
    setCopied(true); window.setTimeout(() => setCopied(false), 1400)
  }

  const kicker = locale === 'en' ? 'Converter · same cm/360' : locale === 'es' ? 'Conversor · mismo cm/360' : 'Conversor · mesmo cm/360'
  const sideLabel = (side: 'from' | 'to') => side === 'from' ? (locale === 'en' ? 'Source' : 'Origem') : (locale === 'en' ? 'Target' : 'Destino')
  const cm = (value: number | undefined) => value === undefined ? '—' : `${value.toFixed(2)} cm`
  const sideHeader = (side: 'from' | 'to') => <div className="flex items-center justify-between gap-3"><span className={eyebrow}>{t(side === 'from' ? 'converter.from' : 'converter.to')}</span><Badge variant={side === 'from' ? 'outline' : 'default'}>{sideLabel(side)}</Badge></div>
  const notice = unsupported ? t('converter.unsupportedProfile') : sourceProfileErrors.length || targetProfileErrors.length ? t('converter.invalidProfile') : invalidInput ? t('converter.invalidSensitivity') : invalidDpi ? t('converter.invalidDpi') : unverified ? t('converter.unverifiedNotice') : null
  const auditRows = (rows: [string, string | number][]) => <dl className="m-0 grid">{rows.map(([term, detail]) => <div key={term} className="flex items-baseline justify-between gap-4 border-0 border-t border-solid border-border py-2.5 first:border-t-0">
    <dt className="text-xs font-medium text-muted-foreground">{term}</dt><dd className="m-0 text-right font-mono text-[13px] tabular-nums text-foreground [overflow-wrap:anywhere]">{detail}</dd>
  </div>)}</dl>
  const auditCard = 'grid content-start gap-2 rounded-lg border border-solid border-border bg-black/20 p-4'
  const stats: [string, string, string][] = [
    [t('converter.method'), t('converter.hipfireMethod'), 'font-sans text-[15px] font-semibold'],
    [t('converter.physicalEquivalence'), result ? `${result.sourceCm360.toFixed(2)} → ${result.resultingCm360.toFixed(2)} cm/360` : '—', 'text-lg'],
    ...(!duplicateValues ? [[t('converter.mathematicalValue'), exactLabel, 'text-[clamp(24px,2.4vw,34px)]'] as [string, string, string]] : []),
    [t('converter.valueToUse'), configurableLabel, 'text-[clamp(24px,2.4vw,34px)]'],
    [t('converter.residualError'), errorLabel, cn('text-[clamp(24px,2.4vw,34px)]', result && ERROR_TONE[result.errorClassification])],
  ]
  const validated = [source.verification.auditedAt, target.verification.auditedAt, source.verification.verifiedAt, target.verification.verifiedAt].some(Boolean)
  return <section className="converter-workspace">
    <XensiPageHeader kicker={kicker} title={t('converter.title')} description={t('converter.subtitle')} />
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
      <Card spotlight className="gap-5 p-5 sm:p-6">
        {sideHeader('from')}
        <GameSelect large games={GAME_SENSITIVITY_PROFILES} label={t('converter.sourceGame')} value={sourceId} onValueChange={id => { config.selectGame(id); setCopied(false) }} />
        <PresetSelection draft={config.draft} presets={config.presets} onSelect={config.selectPreset} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t('converter.currentSensitivity')} inputMode="decimal" value={sourceValue} onChange={setSourceValue} />
          <NumberField label={t('converter.sourceDpi')} inputMode="numeric" value={sourceDpi} onChange={setSourceDpi} />
        </div>
        <div className={cn(readout, 'mt-auto')}><span className={eyebrow}>{t('converter.cmPer360')}</span><strong className="font-mono text-xl font-medium leading-none tabular-nums text-foreground">{cm(result?.sourceCm360)}</strong></div>
      </Card>
      <div className="flex items-center justify-center gap-3 lg:flex-col">
        <Button variant="outline" size="icon" className="size-12 rounded-full bg-card transition-[transform,border-color,background-color] duration-300 hover:rotate-180 max-lg:rotate-90 max-lg:hover:rotate-270 motion-reduce:transition-none" onClick={swapGames} aria-label={t('converter.swap')}><ArrowLeftRight className="size-5!" /></Button>
        <span aria-hidden="true" className="text-xs font-semibold text-subtle">VS</span>
      </div>
      <Card spotlight accent className="gap-5 p-5 sm:p-6">
        {sideHeader('to')}
        <GameSelect large games={GAME_SENSITIVITY_PROFILES} label={t('converter.targetGame')} value={targetId} onValueChange={id => { setTargetId(id); setCopied(false) }} />
        <div className="relative grid gap-3 rounded-lg border border-solid border-primary/30 bg-primary/[.07] py-5 pr-20 pl-5">
          <span className={eyebrow}>{t('converter.equivalent360')}</span>
          <strong className="font-mono text-[clamp(40px,4.4vw,60px)] font-medium leading-none tabular-nums text-foreground"><AnimatedMetric value={result?.configurableSensitivity ?? null} format={() => configurableLabel} /></strong>
          <Button variant="outline" size="icon" className="absolute top-1/2 right-4 -translate-y-1/2 active:-translate-y-1/2" onClick={copyResult} disabled={result === null} aria-label={t('converter.copy')}>{copied ? <Check className="text-success" /> : <Copy />}</Button>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-3">
          <NumberField label={t('converter.targetDpi')} inputMode="numeric" value={targetDpi} onChange={setTargetDpi} />
          <div className={cn(readout, 'self-end')}><span className={eyebrow}>{t('converter.cmPer360')}</span><strong className="font-mono text-xl font-medium leading-none tabular-nums text-foreground">{cm(result?.resultingCm360)}</strong></div>
        </div>
      </Card>
    </div>

    {result !== null && <Card aria-live="polite" className="mt-4 grid gap-px overflow-hidden bg-border p-0 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.5fr_repeat(3,minmax(0,1fr))]">
      {stats.map(([label, value, tone]) => <div key={label} className="grid content-start gap-2.5 bg-card px-6 py-5">
        <span className={eyebrow}>{label}</span><strong className={cn('font-mono font-medium leading-tight tabular-nums text-foreground', tone)}>{value}</strong>
      </div>)}
    </Card>}

    {notice ? <Alert variant="warning" className="mt-4"><Info /><span className="col-start-2">{notice}</span></Alert>
      : <Alert variant="success" className="mt-4"><ShieldCheck /><span className="col-start-2">{t('converter.verifiedNotice')}</span></Alert>}

    <Card className="mt-4 p-0">
      <details className="group/audit">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5 font-heading text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">{t('converter.viewCalculation')}<ChevronDown size={16} className="text-muted-foreground transition-transform group-open/audit:rotate-180" /></summary>
        <div className="grid gap-3 px-6 pb-6 md:grid-cols-2">
          <article className={auditCard}><div className="flex items-center justify-between gap-3"><span className={eyebrow}>{t('converter.sourceGame')}</span><Badge variant={STATUS_BADGE[source.verification.status]}>{statusLabel(source.verification.status)}</Badge></div>
            {auditRows([[t('converter.currentSensitivity'), Number.isFinite(numericValue) ? formatSensitivity(numericValue) : '—'], [t('converter.sourceDpi'), Number.isFinite(numericSourceDpi) ? numericSourceDpi : '—'], [t('converter.coefficient'), coefficientOf(source) ?? '—'], [t('converter.cmPer360'), result ? `${result.sourceCm360.toFixed(4)} cm` : '—']])}
          </article>
          <article className={auditCard}><div className="flex items-center justify-between gap-3"><span className={eyebrow}>{t('converter.targetGame')}</span><Badge variant={STATUS_BADGE[target.verification.status]}>{statusLabel(target.verification.status)}</Badge></div>
            {auditRows([[t('converter.mathematicalValue'), exactLabel], [t('converter.valueToUse'), configurableLabel], [t('converter.targetDpi'), Number.isFinite(numericTargetDpi) ? numericTargetDpi : '—'], [t('converter.coefficient'), coefficientOf(target) ?? '—'], [t('converter.resultingCm'), result ? `${result.resultingCm360.toFixed(4)} cm` : '—'], [t('converter.residualError'), errorLabel]])}
          </article>
          <article className={cn(auditCard, 'md:col-span-2')}><span className={eyebrow}>{t('converter.profileDetails')}</span>
            {auditRows([[t('converter.method'), t('converter.hipfireMethod')], [t('converter.profileVersion'), `${source.verification.profileVersion} / ${target.verification.profileVersion}`], ...(validated ? [[t('converter.lastValidation'), `${source.verification.auditedAt ?? source.verification.verifiedAt ?? '—'} / ${target.verification.auditedAt ?? target.verification.verifiedAt ?? '—'}`] as [string, string]] : [])])}
            {(source.verification.notes || target.verification.notes) && <p className="m-0 text-sm leading-relaxed text-muted-foreground">{t('converter.unverifiedNotice')}</p>}
            {(source.verification.sources.length > 0 || target.verification.sources.length > 0) && <div className="flex flex-wrap items-center gap-2 pt-1"><strong className="mr-1 text-xs font-semibold text-foreground">{t('converter.sources')}</strong>{[...source.verification.sources, ...target.verification.sources].map((item, index) => item.url ? <a key={`${item.label}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="rounded-md bg-foreground/[.06] px-2 py-1 text-xs font-medium text-foreground no-underline hover:text-primary">{item.label}</a> : <Badge variant="secondary" key={`${item.label}-${index}`}>{item.label}</Badge>)}</div>}
          </article>
        </div>
      </details>
    </Card>
    <p className="m-0 mt-4 max-w-[760px] text-xs leading-relaxed text-subtle">{t('converter.disclaimer')}</p>
  </section>
}
