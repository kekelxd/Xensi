import { useEffect, useRef, useState } from 'react'
import { Check, Download, RefreshCw, X } from 'lucide-react'
import { useI18n, type TranslationKey } from './i18n'
import { getPresetRepository } from './presetRepository'
import { getRoutineRepository } from './routineRepository'
import { usePresetState } from './useSensitivityPreset'
import { useRoutineState } from './useRoutineState'
import { getSessionRepository, useSessionState } from './sessionRepository'
import { useDialogFocus } from './useDialogFocus'

export function PresetSyncStatus() {
  const { t } = useI18n()
  const presets = usePresetState(), routines = useRoutineState(), sessions = useSessionState()
  const presetRepository = getPresetRepository(), routineRepository = getRoutineRepository(), sessionRepository = getSessionRepository()
  const [success, setSuccess] = useState<{ userId: string | null; key: TranslationKey } | null>(null)
  const [importing, setImporting] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const ready = presets.status === 'ready' && routines.status === 'ready' && sessions.status === 'ready' && presets.userId === routines.userId && presets.userId === sessions.userId
  const offered = ready && (presets.importOffered || routines.importOffered || sessions.importOffered)
  const busy = importing || presets.busy || routines.busy || sessions.busy
  const both = [presets, routines, sessions].filter(state => state.importOffered).length > 1
  const prefix = both ? 'accountData' : sessions.importOffered ? 'sessions' : routines.importOffered ? 'routines' : 'presets'
  const dismiss = () => { presetRepository.dismissImport(); routineRepository.dismissImport(); sessionRepository.dismissImport() }
  useDialogFocus(ref, offered)
  useEffect(() => {
    if (!offered) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing && !presetRepository.getSnapshot().busy && !routineRepository.getSnapshot().busy && !sessionRepository.getSnapshot().busy) {
        presetRepository.dismissImport(); routineRepository.dismissImport(); sessionRepository.dismissImport()
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [offered, importing, presetRepository, routineRepository, sessionRepository])
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
    {[{ state: presets, repository: presetRepository, prefix: 'presets' }, { state: routines, repository: routineRepository, prefix: 'routines' }, { state: sessions, repository: sessionRepository, prefix: 'sessions' }].map(({ state, repository, prefix: kind }) => state.error && !offered && <div key={kind} className="preset-sync-message" role="alert">
      <span>{t(state.error === 'storage' ? 'sessions.storageFailure' : `${kind}.${state.error === 'import' ? 'importFailure' : 'syncFailure'}` as TranslationKey)}</span>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void repository.refresh()}><RefreshCw size={16} />{t('presets.retry')}</button>
    </div>)}
    {success && success.userId === presets.userId && <div className="preset-sync-message" role="status">
      <Check size={16} /><span>{t(success.key)}</span>
      <button type="button" className="icon-button" aria-label={t('presets.dismiss')} onClick={() => setSuccess(null)}><X size={16} /></button>
    </div>}
    {offered && <div className="modal-backdrop"><section ref={ref} className="profile-v1-modal preset-import-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-import-title" aria-describedby="preset-import-description">
      <h2 id="preset-import-title">{t(`${prefix}.importTitle` as TranslationKey)}</h2>
      <p id="preset-import-description">{t(`${prefix}.importText` as TranslationKey)}</p>
      {both && <p>{t('sessions.importCounts', { presets: presets.pendingImport, routines: routines.pendingImport, sessions: sessions.pendingImport })}</p>}
      {presets.error === 'import' && <p role="alert" className="profile-v1-error">{t('presets.importFailure')}</p>}
      {routines.error === 'import' && <p role="alert" className="profile-v1-error">{t('routines.importFailure')}</p>}
      {sessions.error === 'import' && <p role="alert" className="profile-v1-error">{t('sessions.importFailure')}</p>}
      <footer><button type="button" className="secondary-button" disabled={busy} onClick={dismiss}>{t('presets.notNow')}</button>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void importData()}><Download size={16} />{t(busy ? 'accountData.importing' : `${prefix}.import` as TranslationKey)}</button></footer>
    </section></div>}
  </>
}
