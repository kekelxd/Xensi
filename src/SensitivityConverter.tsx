import { XensiPageHeader } from './design/Primitives'
import { AnimatedMetric } from './design/AnimatedMetric'
import { useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, Info, RefreshCw, ShieldCheck } from 'lucide-react'
import { GAME_SENSITIVITY_PROFILES, GAME_SENSITIVITY_PROFILE_BY_ID, type GameSensitivityProfile, type GameSensitivityProfileId, type VerificationStatus } from './gameSensitivityProfiles'
import { convertSensitivity, isFullyVerified, validateGameProfile } from './sensitivityConversionEngine'
import { formatSensitivity } from './sensitivity'
import { useI18n } from './i18n'
import { GameBadge } from './GameBadge'
import { PresetSelection } from './PresetSelection'
import { useSensitivityPreset, type PresetLaunch } from './useSensitivityPreset'

const STATUS_KEYS: Record<VerificationStatus, 'converter.statusVerified' | 'converter.statusCrossVerified' | 'converter.statusMeasured' | 'converter.statusExperimental'> = {
  verified: 'converter.statusVerified', cross_verified: 'converter.statusCrossVerified', measured: 'converter.statusMeasured', experimental: 'converter.statusExperimental',
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
  return <section className="converter-workspace xb-page xb-converter">
    <XensiPageHeader className="converter-heading" kicker={kicker} title={t('converter.title')} description={t('converter.subtitle')} />
    <div className="converter-card xb-versus">
      <div className="converter-side xb-side is-source">
        <header className="xb-side-bar"><span className="converter-label">{t('converter.from')}</span><b>{sideLabel('from')}</b></header>
        <div className="xb-side-body">
          <label className="converter-select xb-game-select"><GameBadge gameId={sourceId} /><select aria-label={t('converter.sourceGame')} value={sourceId} onChange={(event) => { config.selectGame(event.target.value as GameSensitivityProfileId); setCopied(false) }}>{GAME_SENSITIVITY_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          <PresetSelection draft={config.draft} presets={config.presets} onSelect={config.selectPreset} />
          <div className="converter-values xb-fields">
            <label className="converter-field"><span>{t('converter.currentSensitivity')}</span><input type="text" inputMode="decimal" value={sourceValue} onChange={(event) => setSourceValue(event.target.value)} aria-label={t('converter.currentSensitivity')} /></label>
            <label className="converter-field"><span>{t('converter.sourceDpi')}</span><input type="text" inputMode="numeric" value={sourceDpi} onChange={(event) => setSourceDpi(event.target.value)} aria-label={t('converter.sourceDpi')} /></label>
          </div>
          <div className="converter-field converter-physical xb-readout"><span>{t('converter.cmPer360')}</span><strong>{result === null ? '—' : `${result.sourceCm360.toFixed(2)} cm`}</strong></div>
        </div>
      </div>
      <div className="xb-versus-axis"><button className="converter-swap xb-swap" onClick={swapGames} aria-label={t('converter.swap')}><RefreshCw size={20} /></button><span aria-hidden="true">VS</span></div>
      <div className="converter-side xb-side is-target">
        <header className="xb-side-bar"><span className="converter-label">{t('converter.to')}</span><b>{sideLabel('to')}</b></header>
        <div className="xb-side-body">
          <label className="converter-select xb-game-select"><GameBadge gameId={targetId} /><select aria-label={t('converter.targetGame')} value={targetId} onChange={(event) => { setTargetId(event.target.value as GameSensitivityProfileId); setCopied(false) }}>{GAME_SENSITIVITY_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          <div className="converter-field converter-result xb-result"><span>{t('converter.equivalent360')}</span><strong><AnimatedMetric value={result?.configurableSensitivity ?? null} format={() => configurableLabel} /></strong><button onClick={copyResult} disabled={result === null} aria-label={t('converter.copy')}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div>
          <div className="converter-values xb-fields">
            <label className="converter-field"><span>{t('converter.targetDpi')}</span><input type="text" inputMode="numeric" value={targetDpi} onChange={(event) => setTargetDpi(event.target.value)} aria-label={t('converter.targetDpi')} /></label>
            <div className="converter-field converter-physical xb-readout"><span>{t('converter.cmPer360')}</span><strong>{result === null ? '—' : `${result.resultingCm360.toFixed(2)} cm`}</strong></div>
          </div>
        </div>
      </div>
    </div>

    {result !== null && <div className="converter-summary xb-scoreboard" aria-live="polite">
      <div className="converter-method"><span>{t('converter.method')}</span><strong>{t('converter.hipfireMethod')}</strong></div>
      <div><span>{t('converter.physicalEquivalence')}</span><strong>{result.sourceCm360.toFixed(2)} → {result.resultingCm360.toFixed(2)} cm/360</strong></div>
      {!duplicateValues && <div><span>{t('converter.mathematicalValue')}</span><strong>{exactLabel}</strong></div>}
      <div><span>{t('converter.valueToUse')}</span><strong>{configurableLabel}</strong></div>
      <div><span>{t('converter.residualError')}</span><strong className={`error-${result.errorClassification}`}>{errorLabel}</strong></div>
    </div>}

    {unsupported ? <div className="converter-notice warning"><Info size={16} /><span>{t('converter.unsupportedProfile')}</span></div>
      : sourceProfileErrors.length || targetProfileErrors.length ? <div className="converter-notice warning"><Info size={16} /><span>{t('converter.invalidProfile')}</span></div>
      : invalidInput ? <div className="converter-notice warning"><Info size={16} /><span>{t('converter.invalidSensitivity')}</span></div>
      : invalidDpi ? <div className="converter-notice warning"><Info size={16} /><span>{t('converter.invalidDpi')}</span></div>
      : unverified ? <div className="converter-notice warning"><Info size={16} /><span>{t('converter.unverifiedNotice')}</span></div>
      : <div className="converter-notice"><ShieldCheck size={16} /><span>{t('converter.verifiedNotice')}</span></div>}

    <details className="converter-audit xb-audit">
      <summary>{t('converter.viewCalculation')}<ChevronDown size={15} /></summary>
      <div className="converter-audit-grid">
        <article><header><span>{t('converter.sourceGame')}</span><i className={`profile-status status-${source.verification.status}`}>{statusLabel(source.verification.status)}</i></header><dl>
          <div><dt>{t('converter.currentSensitivity')}</dt><dd>{Number.isFinite(numericValue) ? formatSensitivity(numericValue) : '—'}</dd></div><div><dt>{t('converter.sourceDpi')}</dt><dd>{Number.isFinite(numericSourceDpi) ? numericSourceDpi : '—'}</dd></div><div><dt>{t('converter.coefficient')}</dt><dd>{coefficientOf(source) ?? '—'}</dd></div><div><dt>{t('converter.cmPer360')}</dt><dd>{result ? `${result.sourceCm360.toFixed(4)} cm` : '—'}</dd></div>
        </dl></article>
        <article><header><span>{t('converter.targetGame')}</span><i className={`profile-status status-${target.verification.status}`}>{statusLabel(target.verification.status)}</i></header><dl>
          <div><dt>{t('converter.mathematicalValue')}</dt><dd>{exactLabel}</dd></div><div><dt>{t('converter.valueToUse')}</dt><dd>{configurableLabel}</dd></div><div><dt>{t('converter.targetDpi')}</dt><dd>{Number.isFinite(numericTargetDpi) ? numericTargetDpi : '—'}</dd></div><div><dt>{t('converter.coefficient')}</dt><dd>{coefficientOf(target) ?? '—'}</dd></div><div><dt>{t('converter.resultingCm')}</dt><dd>{result ? `${result.resultingCm360.toFixed(4)} cm` : '—'}</dd></div><div><dt>{t('converter.residualError')}</dt><dd>{errorLabel}</dd></div>
        </dl></article>
        <article className="converter-profile-meta"><header><span>{t('converter.profileDetails')}</span></header><dl>
          <div><dt>{t('converter.method')}</dt><dd>{t('converter.hipfireMethod')}</dd></div><div><dt>{t('converter.profileVersion')}</dt><dd>{source.verification.profileVersion} / {target.verification.profileVersion}</dd></div>
          {(source.verification.auditedAt || target.verification.auditedAt || source.verification.verifiedAt || target.verification.verifiedAt) && <div><dt>{t('converter.lastValidation')}</dt><dd>{source.verification.auditedAt ?? source.verification.verifiedAt ?? '—'} / {target.verification.auditedAt ?? target.verification.verifiedAt ?? '—'}</dd></div>}
        </dl>{(source.verification.notes || target.verification.notes) && <p>{t('converter.unverifiedNotice')}</p>}
          {(source.verification.sources.length > 0 || target.verification.sources.length > 0) && <div className="converter-sources"><strong>{t('converter.sources')}</strong>{[...source.verification.sources, ...target.verification.sources].map((item, index) => item.url ? <a key={`${item.label}-${index}`} href={item.url} target="_blank" rel="noreferrer">{item.label}</a> : <span key={`${item.label}-${index}`}>{item.label}</span>)}</div>}
        </article>
      </div>
    </details>
    <p className="converter-disclaimer">{t('converter.disclaimer')}</p>
  </section>
}
