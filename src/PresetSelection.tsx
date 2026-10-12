import { useId } from 'react'
import { useI18n } from './i18n'
import { calculatePresetCm360, type SensitivityPreset } from './playerProfileStore'
import type { SensitivityDraft } from './useSensitivityPreset'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { presetCopy } from './presetCopy'
import { usePresetState } from './useSensitivityPreset'

export function PresetSelection({ draft, presets, onSelect }: { draft: SensitivityDraft; presets: SensitivityPreset[]; onSelect: (id: string) => void }) {
  const { locale, t } = useI18n()
  const id = useId()
  const sync = usePresetState()
  const text = presetCopy[locale]
  const matches = presets.filter(item => item.gameId === draft.gameId)
  const selected = matches.find(item => item.id === draft.presetId)
  const changed = !selected || Number(draft.sensitivity.replace(',', '.')) !== selected.sensitivity || Number(draft.dpi.replace(',', '.')) !== selected.dpi
  const cm = calculatePresetCm360({ gameId: draft.gameId, sensitivity: Number(draft.sensitivity.replace(',', '.')), dpi: Number(draft.dpi.replace(',', '.')) })
  const temporary = draft.dirty && changed
  return <div className="grid gap-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <Badge aria-live="polite" variant={temporary ? 'warning' : selected ? selected.isPrimary ? 'default' : 'success' : 'outline'}>{temporary ? text.temporary : selected ? selected.isPrimary ? text.primary : text.saved : text.none}</Badge>
      {selected && <small className="text-xs font-medium tabular-nums text-muted-foreground">{draft.sensitivity} · {draft.dpi} DPI{cm !== null && Number.isFinite(cm) && cm > 0 ? ` · ${cm.toFixed(2)} cm/360` : ''}</small>}
      {sync.status !== 'ready' && <small role="status" className="text-xs text-subtle">{t('presets.loading')}</small>}
    </div>
    {matches.length > 1 && <div className="grid gap-2">
      <Label htmlFor={id}>{text.choose}</Label>
      <Select value={selected?.id} onValueChange={onSelect}>
        <SelectTrigger id={id} size="sm"><SelectValue placeholder={text.choose} /></SelectTrigger>
        <SelectContent>{matches.map(preset => <SelectItem key={preset.id} value={preset.id}>{preset.name || (preset.isPrimary ? text.primary : text.saved)} · {preset.sensitivity} · {preset.dpi} DPI</SelectItem>)}</SelectContent>
      </Select>
    </div>}
  </div>
}
