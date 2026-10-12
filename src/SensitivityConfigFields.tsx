import { Check, Gauge } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { GameBadge } from './GameBadge'
import { GAME_IDENTITY_BY_ID } from './gameIdentity'
import { useI18n } from './i18n'
import { calculatePresetCm360, type SensitivityPreset } from './playerProfileStore'
import { presetCopy } from './presetCopy'
import type { SensitivityDraft } from './useSensitivityPreset'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  draft: SensitivityDraft
  presets: SensitivityPreset[]
  onSelectPreset: (id: string) => void
  onSensitivityChange: (value: string) => void
  onDpiChange: (value: string) => void
  sensitivityInvalid?: boolean
  dpiInvalid?: boolean
  children?: ReactNode
}

export function SensitivityConfigFields({ draft, presets, onSelectPreset, onSensitivityChange, onDpiChange, sensitivityInvalid, dpiInvalid, children }: Props) {
  const { locale, t } = useI18n()
  const id = useId()
  const text = presetCopy[locale]
  const matches = presets.filter(item => item.gameId === draft.gameId)
  const selected = matches.find(item => item.id === draft.presetId)
  const sensitivity = Number(draft.sensitivity.replace(',', '.'))
  const dpi = Number(draft.dpi.replace(',', '.'))
  const changed = !selected || sensitivity !== selected.sensitivity || dpi !== selected.dpi
  const cm = calculatePresetCm360({ gameId: draft.gameId, sensitivity, dpi })
  const temporary = draft.dirty && changed
  const status = temporary ? text.temporary : selected ? selected.isPrimary ? text.primaryLoaded : text.savedLoaded : text.sessionConfig

  return <div className="xensi-config-fields grid gap-4">
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-solid border-border bg-black/20 p-3">
      <GameBadge gameId={draft.gameId} />
      <div className="grid min-w-[140px] flex-1 gap-1"><span className="text-xs font-medium text-muted-foreground">{text.adjustTitle}</span><strong className="truncate text-sm font-semibold text-foreground">{GAME_IDENTITY_BY_ID[draft.gameId].name}</strong></div>
      <Badge aria-live="polite" variant={temporary ? 'warning' : 'success'} className="ml-auto whitespace-normal">{selected && !changed && <Check />}{status}</Badge>
    </div>
    {matches.length > 1 && <div className="grid items-center gap-2 sm:grid-cols-[auto_minmax(180px,280px)] sm:justify-between">
      <Label htmlFor={`${id}-preset`}>{text.choose}</Label>
      <Select value={draft.presetId ?? undefined} onValueChange={onSelectPreset}>
        <SelectTrigger id={`${id}-preset`} size="sm"><SelectValue placeholder={text.choose} /></SelectTrigger>
        <SelectContent>{matches.map(preset => <SelectItem key={preset.id} value={preset.id}>{preset.name || (preset.isPrimary ? text.primary : text.saved)}</SelectItem>)}</SelectContent>
      </Select>
    </div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_minmax(180px,.8fr)]">
      <div className="grid min-w-0 content-start gap-2"><Label htmlFor={`${id}-sens`}>{text.sensitivity}</Label><Input id={`${id}-sens`} type="text" inputMode="decimal" value={draft.sensitivity} onChange={event => onSensitivityChange(event.target.value)} aria-invalid={sensitivityInvalid} className="font-mono tabular-nums" /></div>
      <div className="grid min-w-0 content-start gap-2"><Label htmlFor={`${id}-dpi`}>{t('common.mouseDpi')}</Label><Input id={`${id}-dpi`} type="text" inputMode="numeric" value={draft.dpi} onChange={event => onDpiChange(event.target.value)} aria-invalid={dpiInvalid} className="font-mono tabular-nums" /></div>
      <div className="col-span-2 flex min-h-11 items-center gap-2.5 self-end rounded-lg border border-solid border-success/25 bg-success/[.05] px-3 py-2 md:col-span-1">
        <Gauge className="size-4 flex-none text-success" aria-hidden="true" />
        <span className="grid gap-0.5 text-xs font-medium text-muted-foreground">{text.physicalReference}<strong className="font-mono text-[13px] font-medium tabular-nums text-foreground">{cm !== null && Number.isFinite(cm) && cm > 0 ? `${cm.toFixed(2)} cm/360` : '—'}</strong></span>
      </div>
    </div>
    {children}
  </div>
}
