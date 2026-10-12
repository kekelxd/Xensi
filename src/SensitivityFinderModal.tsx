import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clipboard, Info, Play, RotateCcw, Save, Settings2, Target } from 'lucide-react'
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
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
    const stat = (label: string, value: string, hint?: string, big = false) => <Card className="content-start gap-2 p-5 text-left">
      <span className="text-xs font-medium leading-none text-muted-foreground">{label}</span>
      <strong className={cn('font-mono font-medium leading-none tabular-nums text-foreground', big ? 'text-[clamp(32px,4vw,44px)] text-success' : 'text-xl')}>{value}</strong>
      {hint && <small className="text-xs text-muted-foreground">{hint}</small>}
    </Card>
    return <section className="finder-report-workspace">
      <Badge variant="success" className="mx-auto"><Check /> {t('finder.complete')}</Badge>
      <h1>{t('finder.resultTitle')}</h1>
      <p>{t('finder.resultDescription')}</p>
      <div className="mx-auto mt-8 grid w-full max-w-[760px] gap-3 text-left">
        <div className="grid gap-3 sm:grid-cols-2">
          {stat(t('finder.useSensitivity'), sensitivity.toFixed(3), game.label, true)}
          {stat(t('finder.comparedBase'), `${difference >= 0 ? '+' : ''}${difference.toFixed(1)}%`, t('finder.original', { value: search.baseSensitivity.toFixed(3) }), true)}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat(t('finder.confidence'), `${search.confidence?.toFixed(0) ?? '--'}%`)}
          {stat(t('finder.brakingGain'), baseline && best ? `${Math.max(0, baseline.settlingTimeMs - best.settlingTimeMs).toFixed(0)} ms` : '--')}
          {stat(t('finder.overshootReduction'), baseline && best ? `${Math.max(0, baseline.overshootPixels - best.overshootPixels).toFixed(0)} px` : '--')}
          {stat(t('finder.physicalDistance'), cmPer360 ? `${cmPer360.toFixed(1)} cm/360°` : '--')}
        </div>
        <Alert><Target /><p className="col-start-2 m-0 text-sm leading-relaxed text-muted-foreground"><strong className="font-semibold text-foreground">{t('finder.why')}</strong> {t('finder.whyDescription')} {baseCmPer360 && cmPer360 ? t('finder.distanceChanged', { from: baseCmPer360.toFixed(1), to: cmPer360.toFixed(1) }) : ''}</p></Alert>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button variant="outline" onClick={() => void copy()}><Clipboard /> {copied ? t('finder.copied') : t('finder.copy')}</Button>
          <Button disabled={saved} onClick={() => save()}><Save /> {saved ? text.done : text.save}</Button>
          {config.presets.some(preset => preset.gameId === gameId && preset.isPrimary) && <Button variant="outline" disabled={saved} onClick={() => save(config.presets.find(preset => preset.gameId === gameId && preset.isPrimary)?.id)}>{text.update}</Button>}
          <Button variant="outline" onClick={search.reset}><RotateCcw /> {t('finder.new')}</Button>
        </div>
        {saveError && <Alert variant="warning" role="alert"><Info /><span className="col-start-2">{saveError}</span></Alert>}
      </div>
    </section>
  }

  const openSetup = () => { setSetupStep(1); setStepDirection(1); setSetupOpen(true) }

  return <><CalibrationLanding finder rounds="8" seconds="30s" onStart={openSetup} />
    <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
      <DialogContent closeLabel={t('common.close')} className="finder-setup-modal max-w-[820px] gap-6">
        <DialogHeader><Settings2 size={21} className="text-primary" aria-hidden="true" /><DialogTitle>{t('finder.setupTitle')}</DialogTitle><DialogDescription>{t('finder.setupDescription')}</DialogDescription></DialogHeader>
        <WizardStepper current={setupStep} steps={[t('warmup.stepGame'), t('warmup.stepSettings')]} />
        <div className="min-h-[220px]"><WizardStepPanel key={setupStep} step={setupStep} direction={stepDirection}>
          {setupStep === 1 && <div className="grid gap-4"><h3 className="m-0 font-heading text-base font-semibold text-foreground">{t('warmup.chooseGame')}</h3><GamePicker gameIds={FINDER_GAMES} value={gameId} onChange={config.selectGame} presets={config.presets} /></div>}
          {setupStep === 2 && <SensitivityConfigFields draft={config.draft} presets={config.presets} onSelectPreset={config.selectPreset} onSensitivityChange={setBaseSensitivity} onDpiChange={setDpi} sensitivityInvalid={!Number.isFinite(parsedBaseSensitivity) || parsedBaseSensitivity < game.sensitivityMin || parsedBaseSensitivity > game.sensitivityMax} dpiInvalid={!Number.isFinite(parsedDpi) || parsedDpi <= 0} />}
        </WizardStepPanel></div>
        <DialogFooter className="border-0 border-t border-solid border-border pt-5">
          {setupStep === 2 && <Button variant="outline" onClick={() => { setStepDirection(-1); setSetupStep(1) }}><ArrowLeft /> {t('warmup.back')}</Button>}
          {setupStep === 1
            ? <Button onClick={() => { setStepDirection(1); setSetupStep(2) }}>{t('warmup.next')} <ArrowRight /></Button>
            : <Button disabled={!setupValid} onClick={start}><Play /> {t('finder.start')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

