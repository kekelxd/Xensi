import { PLAYER_PROFILE_STORAGE_KEY, parsePlayerProfile, readPlayerProfile, writePlayerProfile, type SensitivityPreset } from './playerProfileStore'
import { isUUID, markImported, readImportReceipts } from './accountCollectionRepository'

type PresetStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export const presetCacheKey = (userId: string) => `xensi-presets:user:${userId}:v1`
export const importReceiptKey = (userId: string) => `xensi-presets:imported:${userId}:v1`
const backupKey = 'xensi-player-profile:pre-presets-v1'

export function readGuestPresets(storage: PresetStorage): SensitivityPreset[] {
  const raw = storage.getItem(PLAYER_PROFILE_STORAGE_KEY)
  const profile = parsePlayerProfile(raw)
  if (!raw) return profile.presets
  // Preserve the full old document (including unknown/invalid fields) before any conversion.
  const document = JSON.parse(raw) as Record<string, unknown>
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Invalid guest storage')
  const seen = new Set<string>()
  const presets = profile.presets.map(preset => {
    const canonicalId = preset.id.toLowerCase()
    const id = isUUID(canonicalId) && !seen.has(canonicalId) ? canonicalId : crypto.randomUUID()
    seen.add(id)
    return { ...preset, id }
  })
  if (document.presetStorageVersion !== 1 || JSON.stringify(document.presets) !== JSON.stringify(presets)) {
    if (!storage.getItem(backupKey)) storage.setItem(backupKey, raw)
    storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ ...document, presets, presetStorageVersion: 1 }))
  }
  return presets
}

export function writeGuestPresets(storage: PresetStorage, presets: SensitivityPreset[]) {
  const raw = storage.getItem(PLAYER_PROFILE_STORAGE_KEY)
  const document = raw ? JSON.parse(raw) as Record<string, unknown> : readPlayerProfile(storage)
  writePlayerProfile(storage, { ...document, presets, presetStorageVersion: 1 } as ReturnType<typeof readPlayerProfile>)
}

export function readPresetCache(storage: PresetStorage, userId: string): SensitivityPreset[] {
  try {
    const raw = storage.getItem(presetCacheKey(userId))
    if (!raw) return []
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values)) return []
    return parsePlayerProfile(JSON.stringify({ presets: values, presetStorageVersion: 1 })).presets
  } catch { return [] }
}

export function guestPresetFingerprint(preset: SensitivityPreset) {
  return JSON.stringify([preset.id, preset.gameId, preset.name ?? '', preset.sensitivity, preset.dpi, preset.isPrimary, preset.updatedAt])
}

export function pendingGuestPresets(storage: PresetStorage, userId: string) {
  const receipts = readImportReceipts(storage, importReceiptKey(userId))
  return readGuestPresets(storage).filter(preset => receipts?.[preset.id] !== guestPresetFingerprint(preset))
}

export function markGuestPresetsImported(storage: PresetStorage, userId: string, presets: SensitivityPreset[]) {
  markImported(storage, importReceiptKey(userId), presets, guestPresetFingerprint)
}
