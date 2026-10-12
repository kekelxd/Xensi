import { ArrowLeftRight, ArrowRight, ShieldCheck } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { calculateCm360, convertSensitivity } from '../sensitivityConversionEngine'
import { GAME_SENSITIVITY_PROFILES, GAME_SENSITIVITY_PROFILE_BY_ID, type GameSensitivityProfileId } from '../gameSensitivityProfiles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { HomeCopy } from './homeCopy'

export const CONVERTIBLE_PROFILES = GAME_SENSITIVITY_PROFILES.filter(profile => profile.supportedMethods.hipfire360 && profile.angularModel.type === 'linear')

function formatSens(value: number) {
  return value >= 10 ? value.toFixed(2) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function GameField({ id, label, value, onChange }: { id: string; label: string; value: GameSensitivityProfileId; onChange: (id: GameSensitivityProfileId) => void }) {
  return <div className="grid min-w-0 gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Select value={value} onValueChange={next => onChange(next as GameSensitivityProfileId)}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>{CONVERTIBLE_PROFILES.map(profile => <SelectItem key={profile.id} value={profile.id}>{profile.shortName}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}

// Uses the audited conversion engine directly; the Home never computes its own formula.
export function HomeConverter({ copy, onOpen }: { copy: HomeCopy; onOpen: () => void }) {
  const id = useId()
  const [from, setFrom] = useState<GameSensitivityProfileId>('cs2')
  const [to, setTo] = useState<GameSensitivityProfileId>('valorant')
  const [sens, setSens] = useState('1.6')
  const [dpi, setDpi] = useState('800')
  const source = GAME_SENSITIVITY_PROFILE_BY_ID[from]
  const target = GAME_SENSITIVITY_PROFILE_BY_ID[to]

  const result = useMemo(() => {
    const value = Number(sens.replace(',', '.'))
    const counts = Number(dpi)
    return convertSensitivity(value, source, target, counts, counts)
  }, [sens, dpi, source, target])
  const cm360 = useMemo(() => calculateCm360(source, Number(sens.replace(',', '.')), Number(dpi)), [source, sens, dpi])

  return <div className="xl-conv">
    <div className="xl-conv-row">
      <GameField id={`${id}-from`} label={copy.converterFrom} value={from} onChange={setFrom} />
      <Button variant="outline" size="icon" className="transition-[transform,border-color,background-color] duration-300 hover:rotate-180 motion-reduce:transition-none" aria-label={`${copy.converterFrom} ⇄ ${copy.converterTo}`} onClick={() => { setFrom(to); setTo(from); if (result) setSens(formatSens(result.configurableSensitivity)) }}><ArrowLeftRight /></Button>
      <GameField id={`${id}-to`} label={copy.converterTo} value={to} onChange={setTo} />
    </div>
    <div className="xl-conv-row is-inputs">
      <div className="grid min-w-0 gap-2"><Label htmlFor={`${id}-sens`}>{copy.converterSens}</Label><Input id={`${id}-sens`} inputMode="decimal" value={sens} onChange={event => setSens(event.target.value)} className="font-mono tabular-nums" /></div>
      <div className="grid min-w-0 gap-2"><Label htmlFor={`${id}-dpi`}>{copy.converterDpi}</Label><Input id={`${id}-dpi`} inputMode="numeric" value={dpi} onChange={event => setDpi(event.target.value.replace(/\D/g, '').slice(0, 5))} className="font-mono tabular-nums" /></div>
    </div>
    <output className="xl-conv-out" htmlFor={`${id}-from ${id}-to ${id}-sens ${id}-dpi`} aria-live="polite">
      <span>{copy.converterResult} · {target.shortName}</span>
      {result
        ? <><b key={result.configurableSensitivity}>{formatSens(result.configurableSensitivity)}</b><small>{cm360 ? `${cm360.toFixed(1)} ${copy.converterCm}` : ''}</small></>
        : <em>{copy.converterUnavailable}</em>}
    </output>
    <p className="xl-conv-status" data-status={target.verification.status}><ShieldCheck size={14} />{copy.verification[target.verification.status]}</p>
    <button type="button" className="xl-link" onClick={onOpen}>{copy.converterCta}<ArrowRight size={15} /></button>
  </div>
}
