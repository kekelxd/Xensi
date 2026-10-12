import { ArrowLeftRight, ArrowRight, ShieldCheck } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { calculateCm360, convertSensitivity } from '../sensitivityConversionEngine'
import { GAME_SENSITIVITY_PROFILES, GAME_SENSITIVITY_PROFILE_BY_ID, type GameSensitivityProfileId } from '../gameSensitivityProfiles'
import type { HomeCopy } from './homeCopy'

export const CONVERTIBLE_PROFILES = GAME_SENSITIVITY_PROFILES.filter(profile => profile.supportedMethods.hipfire360 && profile.angularModel.type === 'linear')

function formatSens(value: number) {
  return value >= 10 ? value.toFixed(2) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
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
      <label htmlFor={`${id}-from`}><span>{copy.converterFrom}</span>
        <select id={`${id}-from`} value={from} onChange={event => setFrom(event.target.value as GameSensitivityProfileId)}>
          {CONVERTIBLE_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.shortName}</option>)}
        </select>
      </label>
      <button type="button" className="xl-conv-swap" aria-label={`${copy.converterFrom} ⇄ ${copy.converterTo}`} onClick={() => { setFrom(to); setTo(from); if (result) setSens(formatSens(result.configurableSensitivity)) }}><ArrowLeftRight size={16} /></button>
      <label htmlFor={`${id}-to`}><span>{copy.converterTo}</span>
        <select id={`${id}-to`} value={to} onChange={event => setTo(event.target.value as GameSensitivityProfileId)}>
          {CONVERTIBLE_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.shortName}</option>)}
        </select>
      </label>
    </div>
    <div className="xl-conv-row is-inputs">
      <label htmlFor={`${id}-sens`}><span>{copy.converterSens}</span><input id={`${id}-sens`} inputMode="decimal" value={sens} onChange={event => setSens(event.target.value)} /></label>
      <label htmlFor={`${id}-dpi`}><span>{copy.converterDpi}</span><input id={`${id}-dpi`} inputMode="numeric" value={dpi} onChange={event => setDpi(event.target.value.replace(/\D/g, '').slice(0, 5))} /></label>
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
