import { useState } from 'react'
import { Check, Download, Info, RefreshCw, X } from 'lucide-react'
import { useI18n, type TranslationKey } from './i18n'
import { getPresetRepository } from './presetRepository'
import { getRoutineRepository } from './routineRepository'
import { usePresetState } from './useSensitivityPreset'
import { useRoutineState } from './useRoutineState'
import { getSessionRepository, useSessionState } from './sessionRepository'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function PresetSyncStatus() {
  const { t } = useI18n()
  const presets = usePresetState(), routines = useRoutineState(), sessions = useSessionState()
  const presetRepository = getPresetRepository(), routineRepository = getRoutineRepository(), sessionRepository = getSessionRepository()
  const [success, setSuccess] = useState<{ userId: string | null; key: TranslationKey } | null>(null)
  const [importing, setImporting] = useState(false)
  const ready = presets.status === 'ready' && routines.status === 'ready' && sessions.status === 'ready' && presets.userId === routines.userId && presets.userId === sessions.userId
  const offered = ready && (presets.importOffered || routines.importOffered || sessions.importOffered)
  const busy = importing || presets.busy || routines.busy || sessions.busy
  const both = [presets, routines, sessions].filter(state => state.importOffered).length > 1
  const prefix = both ? 'accountData' : sessions.importOffered ? 'sessions' : routines.importOffered ? 'routines' : 'presets'
  const dismiss = () => { presetRepository.dismissImport(); routineRepository.dismissImport(); sessionRepository.dismissImport() }
  const dismissWhenIdle = () => {
    if (!importing && !presetRepository.getSnapshot().busy && !routineRepository.getSnapshot().busy && !sessionRepository.getSnapshot().busy) dismiss()
  }
  const importData = async () => {
    const userId = presets.userId, successKey = `${prefix}.importSuccess` as TranslationKey
    setImporting(true); setSuccess(null)
    try {
      const presetOk = !presets.importOffered || await presetRepository.importGuestPresets()
      if (presetRepository.getSnapshot().userId !== userId || routineRepository.getSnapshot().userId !== userId) return
      const routineOk = !routines.importOffered || await routineRepository.importGuestRoutines()
      if (sessionRepository.getSnapshot().userId !== userId || routineRepository.getSnapshot().userId !== userId) return
      const sessionOk = !sessions.importOffered || await sessionRepository.importGuestSessions()
      if (presetOk && routineOk && sessionOk && presetRepository.getSnapshot().userId === userId && routineRepository.getSnapshot().userId === userId && sessionRepository.getSnapshot().userId === userId) setSuccess({ userId, key: successKey })
    } finally { setImporting(false) }
  }
  return <>
    {[{ state: presets, repository: presetRepository, prefix: 'presets' }, { state: routines, repository: routineRepository, prefix: 'routines' }, { state: sessions, repository: sessionRepository, prefix: 'sessions' }].map(({ state, repository, prefix: kind }) => state.error && !offered && <Alert key={kind} variant="destructive" role="alert" className="preset-sync-message">
      <Info /><span className="col-start-2">{t(state.error === 'storage' ? 'sessions.storageFailure' : `${kind}.${state.error === 'import' ? 'importFailure' : 'syncFailure'}` as TranslationKey)}</span>
      <Button type="button" variant="outline" size="sm" className="col-start-2 mt-2 justify-self-start" disabled={busy} onClick={() => void repository.refresh()}><RefreshCw />{t('presets.retry')}</Button>
    </Alert>)}
    {success && success.userId === presets.userId && <Alert variant="success" className="preset-sync-message">
      <Check /><span className="col-start-2">{t(success.key)}</span>
      <Button type="button" variant="ghost" size="icon" className="absolute top-1.5 right-1.5 size-8" aria-label={t('presets.dismiss')} onClick={() => setSuccess(null)}><X /></Button>
    </Alert>}
    <Dialog open={Boolean(offered)} onOpenChange={open => { if (!open) dismissWhenIdle() }}>
      <DialogContent showCloseButton={false} className="preset-import-dialog max-w-[480px]" onInteractOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t(`${prefix}.importTitle` as TranslationKey)}</DialogTitle>
          <DialogDescription>{t(`${prefix}.importText` as TranslationKey)}</DialogDescription>
        </DialogHeader>
        {both && <p className="m-0 text-sm text-muted-foreground">{t('sessions.importCounts', { presets: presets.pendingImport, routines: routines.pendingImport, sessions: sessions.pendingImport })}</p>}
        {(['presets', 'routines', 'sessions'] as const).filter(kind => ({ presets, routines, sessions })[kind].error === 'import').map(kind => <Alert key={kind} variant="destructive" role="alert"><Info /><span className="col-start-2">{t(`${kind}.importFailure` as TranslationKey)}</span></Alert>)}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={dismiss}>{t('presets.notNow')}</Button>
          <Button type="button" disabled={busy} onClick={() => void importData()}><Download />{t(busy ? 'accountData.importing' : `${prefix}.import` as TranslationKey)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
