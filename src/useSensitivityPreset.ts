import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { PLAYER_PROFILE_STORAGE_KEY, parsePlayerProfile, selectGamePreset, type SensitivityPreset } from './playerProfileStore'
import { getPresetRepository } from './presetRepository'
import { readAuthSessionState } from './authService'
import type { GameSensitivityProfileId } from './gameSensitivityProfiles'

function subscribe(notify: () => void) {
  window.addEventListener('storage', notify)
  window.addEventListener('xensi-profile-updated', notify)
  return () => { window.removeEventListener('storage', notify); window.removeEventListener('xensi-profile-updated', notify) }
}
function getSnapshot() {
  try { return window.localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY) } catch { return null }
}
export function usePlayerProfile() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null)
  const state = usePresetState()
  return useMemo(() => {
    const guest = parsePlayerProfile(raw)
    const auth = readAuthSessionState()
    return { ...guest, ...(auth.status === 'authenticated' ? auth.profile : {}), presets: state.presets }
  }, [raw, state])
}

export function usePresetState() {
  const repository = getPresetRepository()
  return useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot)
}

export type PresetLaunch = { id?: string; gameId: GameSensitivityProfileId; sensitivity: number; dpi: number }
export type SensitivityDraft = { gameId: GameSensitivityProfileId; sensitivity: string; dpi: string; presetId?: string; dirty: boolean }
export function draftFromPreset(gameId: GameSensitivityProfileId, preset: SensitivityPreset | PresetLaunch | null): SensitivityDraft {
  return { gameId, sensitivity: String(preset?.sensitivity ?? 1), dpi: String(preset?.dpi ?? 800), presetId: preset?.id, dirty: false }
}
export function editSensitivityDraft(draft: SensitivityDraft, patch: Partial<Pick<SensitivityDraft, 'sensitivity' | 'dpi'>>) {
  return { ...draft, ...patch, dirty: true }
}

// Saved presets supply defaults. Only explicit user actions replace a session draft.
export function useSensitivityPreset(defaultGame: GameSensitivityProfileId, initial?: PresetLaunch | null, preferPrimary = false) {
  const profile = usePlayerProfile()
  const sync = usePresetState()
  const owner = useRef(sync.userId)
  const [draft, setDraft] = useState(() => {
    const launchPreset = initial ?? (preferPrimary ? profile.presets.find(item => item.isPrimary) : null) ?? selectGamePreset(profile.presets, defaultGame)
    return draftFromPreset(launchPreset?.gameId ?? defaultGame, launchPreset)
  })
  useEffect(() => {
    const changedAccount = owner.current !== sync.userId
    owner.current = sync.userId
    setDraft(current => {
      if (changedAccount) return draftFromPreset(defaultGame, null)
      if (sync.status !== 'ready' || current.dirty || initial) return current
      const selected = selectGamePreset(profile.presets, current.gameId, current.presetId)
      const resolved = current.presetId ? selected : (preferPrimary ? profile.presets.find(item => item.isPrimary) : null) ?? selected
      const next = draftFromPreset(resolved?.gameId ?? current.gameId, resolved)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [defaultGame, initial, preferPrimary, profile.presets, sync.status, sync.userId])
  const preset = profile.presets.find(item => item.id === draft.presetId && item.gameId === draft.gameId) ?? null
  const selectGame = (gameId: GameSensitivityProfileId) => {
    if (gameId !== draft.gameId) setDraft(draftFromPreset(gameId, selectGamePreset(profile.presets, gameId)))
  }
  const selectPreset = (id: string) => {
    const chosen = profile.presets.find(item => item.id === id && item.gameId === draft.gameId)
    if (chosen) setDraft(draftFromPreset(draft.gameId, chosen))
  }
  return { draft, preset, presets: profile.presets, selectGame, selectPreset,
    setSensitivity: (sensitivity: string) => setDraft(current => editSensitivityDraft(current, { sensitivity })),
    setDpi: (dpi: string) => setDraft(current => editSensitivityDraft(current, { dpi })),
    replace: (gameId: GameSensitivityProfileId, sensitivity: string, dpi: string, presetId?: string) => setDraft({ gameId, sensitivity, dpi, presetId, dirty: true }),
  }
}
