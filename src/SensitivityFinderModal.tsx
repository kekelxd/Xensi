import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clipboard, Play, Save, Settings2, Target, X } from 'lucide-react'
import { FinderCanvas } from './FinderCanvas'
import { CalibrationLanding } from './CalibrationLanding'
import { GAME_BY_ID, type GameId } from './games'
import { cmPer360FromSensitivity } from './sensMath'
import { useBinarySensSearch } from './useBinarySensSearch'
import { useI18n } from './i18n'
import { GamePicker } from './GamePicker'
import { SensitivityConfigFields } from './SensitivityConfigFields'
import { WizardStepPanel, WizardStepper } from './SetupWizard'
import { presetCopy } from './presetCopy'
import { useSensitivityPreset, type PresetLaunch } from './useSensitivityPreset'
import { getPresetRepository } from './presetRepository'
import { useDialogFocus } from './useDialogFocus'

const FINDER_GAMES: GameId[] = ['cs2', 'valorant', 'overwatch2', 'warzone']
type FinderSetupStep = 1 | 2

type SensitivityFinderModalProps = {
  initialPreset?: PresetLaunch | null
}

export function SensitivityFinderModal({ initialPreset = null }: SensitivityFinderModalProps) {
  const { t, locale } = useI18n()
  const text = presetCopy[locale]
  const [setupOpen, setSetupOpen] = useState(Boolean(initialPreset))
  const [setupStep, setSetupStep] = useState<FinderSetupStep>(1)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1)
  const setupRef = useRef<HTMLElement>(null)
  useDialogFocus(setupRef, setupOpen)
  const config = useSensitivityPreset('cs2', initialPreset, true)
  const gameId = config.draft.gameId as GameId
  const { dpi, sensitivity: baseSensitivity } = config.draft
  const { setDpi, setSensitivity: setBaseSensitivity } = config
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const search = useBinarySensSearch()
  const game = GAME_BY_ID[gameId]
  const parsedDpi = Number(dpi.replace(',', '.'))
  const parsedBaseSensitivity = Number(baseSensitivity.replace(',', '.'))
  const sensitivity = search.finalSensitivity
  const setupValid = Boolean(game.yaw) && Number.isFinite(parsedDpi) && parsedDpi > 0 && Number.isFinite(parsedBaseSensitivity) && parsedBaseSensitivity >= game.sensitivityMin && parsedBaseSensitivity <= game.sensitivityMax

  useEffect(() => {
    if (search.stage !== 'complete') return
    document.exitPointerLock?.()
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [search.stage])

  const start = () => {
    if (!setupValid) return
    setSaved(false); setCopied(false); setSetupOpen(false)
    search.start(parsedBaseSensitivity)
  }
  const save = async (updateId?: string) => {
    const cmPer360 = sensitivity === null || !game.yaw ? null : cmPer360FromSensitivity(sensitivity, game.yaw, parsedDpi)
    if (sensitivity === null || cmPer360 === null) return
    try {
      const repository = getPresetRepository()
      const values = { gameId, sensitivity, dpi: Math.round(parsedDpi) }
      const ok = updateId ? await repository.update(updateId, values) : await repository.create(values)
      if (ok) { setSaved(true); setSaveError('') } else setSaveError(text.error)
    } catch { setSaveError(text.error) }
  }
  const copy = async () => {
    if (sensitivity === null) return
    await navigator.clipboard?.writeText(sensitivity.toFixed(game.sensitivityStep < .01 ? 3 : 2))
    setCopied(true)
  }
  const exitFinder = () => {
    search.reset()
    document.exitPointerLock?.()
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  if (search.currentTrial) {
    return <section className="finder-run-workspace">
      <div className="finder-run-top"><div><span>{t('finder.round')}</span><strong>{search.results.length + 1} / {search.totalRounds}</strong></div><p>{search.currentTrial.phase === 'baseline' ? t('finder.baseline') : search.currentTrial.phase === 'macro' ? t('finder.macro') : search.currentTrial.phase === 'refinement' ? t('finder.refinement') : search.currentTrial.phase === 'extension' ? t('finder.extension') : t('finder.validation')}</p></div>
      <FinderCanvas game={game} sensitivity={search.currentTrial.sensitivity} trial={search.currentTrial} round={search.results.length + 1} onComplete={search.completeTrial} onExit={exitFinder} />
    </section>
  }

  if (search.stage === 'complete' && sensitivity !== null && search.baseSensitivity !== null) {
    const cmPer360 = game.yaw ? cmPer360FromSensitivity(sensitivity, game.yaw, parsedDpi) : null
    const baseCmPer360 = game.yaw ? cmPer360FromSensitivity(search.baseSensitivity, game.yaw, parsedDpi) : null
    const difference = (sensitivity / search.baseSensitivity - 1) * 100
    const baseline = search.results[0]
    const best = [...search.results].sort((left, right) => right.score - left.score)[0]
    return <section className="finder-report-workspace">
      <div className="panel-label"><Check size={15} /> {t('finder.complete')}</div>
      <h1>{t('finder.resultTitle')}</h1>
      <p>{t('finder.resultDescription')}</p>
      <div className="finder-result-hero"><div><span>{t('finder.useSensitivity')}</span><strong>{sensitivity.toFixed(3)}</strong><small>{game.label}</small></div><div><span>{t('finder.comparedBase')}</span><strong>{difference >= 0 ? '+' : ''}{difference.toFixed(1)}%</strong><small>{t('finder.original', { value: search.baseSensitivity.toFixed(3) })}</small></div></div>
      <div className="finder-telemetry-grid">
        <div><span>{t('finder.confidence')}</span><strong>{search.confidence?.toFixed(0) ?? '--'}%</strong></div>
        <div><span>{t('finder.brakingGain')}</span><strong>{baseline && best ? `${Math.max(0, baseline.settlingTimeMs - best.settlingTimeMs).toFixed(0)} ms` : '--'}</strong></div>
        <div><span>{t('finder.overshootReduction')}</span><strong>{baseline && best ? `${Math.max(0, baseline.overshootPixels - best.overshootPixels).toFixed(0)} px` : '--'}</strong></div>
        <div><span>{t('finder.physicalDistance')}</span><strong>{cmPer360 ? `${cmPer360.toFixed(1)} cm/360°` : '--'}</strong></div>
      </div>
      <section className="finder-explanation"><Target size={17} /><p><strong>{t('finder.why')}</strong> {t('finder.whyDescription')} {baseCmPer360 && cmPer360 ? t('finder.distanceChanged', { from: baseCmPer360.toFixed(1), to: cmPer360.toFixed(1) }) : ''}</p></section>
      <div className="finder-report-actions"><button className="secondary-button" onClick={() => void copy()}><Clipboard size={16} /> {copied ? t('finder.copied') : t('finder.copy')}</button><button className="primary-button" disabled={saved} onClick={() => save()}><Save size={16} /> {saved ? text.done : text.save}</button>{config.presets.some(preset => preset.gameId === gameId && preset.isPrimary) && <button className="secondary-button" disabled={saved} onClick={() => save(config.presets.find(preset => preset.gameId === gameId && preset.isPrimary)?.id)}>{text.update}</button>}<button className="secondary-button" onClick={search.reset}><RotateIcon /> {t('finder.new')}</button></div>
      {saveError && <p role="alert">{saveError}</p>}
    </section>
  }

  const openSetup = () => { setSetupStep(1); setStepDirection(1); setSetupOpen(true) }

  return <><CalibrationLanding finder rounds="8" seconds="30s" onStart={openSetup} />
    {setupOpen && <div className="modal-backdrop"><section ref={setupRef} className="modal finder-setup-modal" role="dialog" aria-modal="true" aria-label={t('finder.setupTitle')} onKeyDown={event => { if (event.key === 'Escape') setSetupOpen(false) }}><button className="modal-close" onClick={() => setSetupOpen(false)} aria-label={t('common.close')}><X size={18} /></button><Settings2 className="modal-icon" size={21} /><h2>{t('finder.setupTitle')}</h2><p>{t('finder.setupDescription')}</p>
      <WizardStepper current={setupStep} steps={[t('warmup.stepGame'), t('warmup.stepSettings')]} />
      <div className="warmup-step-content"><WizardStepPanel key={setupStep} step={setupStep} direction={stepDirection}>
        {setupStep === 1 && <><h3>{t('warmup.chooseGame')}</h3><GamePicker gameIds={FINDER_GAMES} value={gameId} onChange={config.selectGame} presets={config.presets} /></>}
        {setupStep === 2 && <SensitivityConfigFields draft={config.draft} presets={config.presets} onSelectPreset={config.selectPreset} onSensitivityChange={setBaseSensitivity} onDpiChange={setDpi} sensitivityInvalid={!Number.isFinite(parsedBaseSensitivity) || parsedBaseSensitivity < game.sensitivityMin || parsedBaseSensitivity > game.sensitivityMax} dpiInvalid={!Number.isFinite(parsedDpi) || parsedDpi <= 0} />}
      </WizardStepPanel></div>
      <div className="warmup-wizard-actions">
        {setupStep === 2 && <button className="secondary-button" onClick={() => { setStepDirection(-1); setSetupStep(1) }}><ArrowLeft size={15} /> {t('warmup.back')}</button>}
        {setupStep === 1
          ? <button className="primary-button" onClick={() => { setStepDirection(1); setSetupStep(2) }}>{t('warmup.next')} <ArrowRight size={15} /></button>
          : <button className="primary-button" disabled={!setupValid} onClick={start}><Play size={15} /> {t('finder.start')}</button>}
      </div>
    </section></div>}
  </>
}

function RotateIcon() { return <span aria-hidden="true">↻</span> }
