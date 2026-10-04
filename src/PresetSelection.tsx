import { useI18n } from './i18n'
import { calculatePresetCm360, type SensitivityPreset } from './playerProfileStore'
import type { SensitivityDraft } from './useSensitivityPreset'

import { presetCopy } from './presetCopy'
import { usePresetState } from './useSensitivityPreset'

export function PresetSelection({ draft, presets, onSelect }: { draft: SensitivityDraft; presets: SensitivityPreset[]; onSelect: (id: string) => void }) {
  const { locale, t } = useI18n()
  const sync = usePresetState()
  const text = presetCopy[locale]
  const matches = presets.filter(item => item.gameId === draft.gameId)
  const selected = matches.find(item => item.id === draft.presetId)
  const changed = !selected || Number(draft.sensitivity.replace(',', '.')) !== selected.sensitivity || Number(draft.dpi.replace(',', '.')) !== selected.dpi
  const cm = calculatePresetCm360({ gameId: draft.gameId, sensitivity: Number(draft.sensitivity.replace(',', '.')), dpi: Number(draft.dpi.replace(',', '.')) })
  return <div className="xensi-preset-context">
    {sync.status !== 'ready' && <small role="status">{t('presets.loading')}</small>}
    <span aria-live="polite">{draft.dirty && changed ? text.temporary : selected ? selected.isPrimary ? text.primary : text.saved : text.none}</span>
    {matches.length > 1 && <label>{text.choose}<select value={draft.presetId ?? ''} onChange={event => onSelect(event.target.value)}>
      {!selected && <option value="">{text.choose}</option>}
      {matches.map(preset => <option key={preset.id} value={preset.id}>{preset.name || (preset.isPrimary ? text.primary : text.saved)} · {preset.sensitivity} · {preset.dpi} DPI</option>)}
    </select></label>}
    {selected && <small>{draft.sensitivity} · {draft.dpi} DPI{cm !== null && Number.isFinite(cm) && cm > 0 ? ` · ${cm.toFixed(2)} cm/360` : ''}</small>}
  </div>
}
