import { DEFAULT_AVATAR, isAvatarId, type AvatarId } from './avatars'
import { GAME_SENSITIVITY_PROFILE_BY_ID, type GameSensitivityProfileId } from './gameSensitivityProfiles'
import { calculateCm360, normalizeSensitivityForGame } from './sensitivityConversionEngine'

export const PLAYER_PROFILE_STORAGE_KEY = 'xensi-player-profile'

export interface SensitivityPreset {
  id: string
  gameId: GameSensitivityProfileId
  name?: string
  sensitivity: number
  dpi: number
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

export interface PlayerProfileData {
  nickname: string
  avatarId: AvatarId
  presets: SensitivityPreset[]
  presetStorageVersion?: 1
}

type LegacyGamePreset = { id?: unknown; dpi?: unknown; sensitivity?: unknown }

const isGameId = (value: unknown): value is GameSensitivityProfileId =>
  typeof value === 'string' && value in GAME_SENSITIVITY_PROFILE_BY_ID

const positiveNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function cleanPreset(value: unknown, index: number, now: string): SensitivityPreset | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<SensitivityPreset>
  if (!isGameId(candidate.gameId)) return null
  const dpi = positiveNumber(candidate.dpi)
  const sensitivity = positiveNumber(candidate.sensitivity)
  if (dpi === null || sensitivity === null) return null
  const gameProfile = GAME_SENSITIVITY_PROFILE_BY_ID[candidate.gameId]
  const normalized = normalizeSensitivityForGame(sensitivity, gameProfile)
  const storedSensitivity = gameProfile.inputModel.type === 'unavailable' ? sensitivity : normalized
  if (storedSensitivity === null) return null
  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `preset-${index + 1}`,
    gameId: candidate.gameId,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : undefined,
    sensitivity: storedSensitivity,
    dpi: Math.round(dpi),
    isPrimary: candidate.isPrimary === true,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
  }
}

function migrateLegacyGames(games: LegacyGamePreset[], now: string) {
  return games.map((game, index) => cleanPreset({
    id: `legacy-${index + 1}-${String(game.id ?? 'game')}`,
    gameId: game.id,
    dpi: game.dpi,
    sensitivity: game.sensitivity,
    isPrimary: index === 0,
    createdAt: now,
    updatedAt: now,
  }, index, now)).filter((preset): preset is SensitivityPreset => preset !== null)
}

export function ensureSinglePrimary(presets: SensitivityPreset[], fallbackToFirst = true) {
  const explicitIndex = presets.findIndex(preset => preset.isPrimary)
  const primaryIndex = explicitIndex < 0 && fallbackToFirst ? 0 : explicitIndex
  return presets.map((preset, index) => ({ ...preset, isPrimary: index === primaryIndex }))
}

export function parsePlayerProfile(raw: string | null, now = new Date().toISOString()): PlayerProfileData {
  if (!raw) return { nickname: 'xensi_dev', avatarId: DEFAULT_AVATAR, presets: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerProfileData> & { games?: LegacyGamePreset[] }
    const sourcePresets = Array.isArray(parsed.presets)
      ? parsed.presets.map((preset, index) => cleanPreset(preset, index, now)).filter((preset): preset is SensitivityPreset => preset !== null)
      : Array.isArray(parsed.games) ? migrateLegacyGames(parsed.games, now) : []
    return {
      nickname: typeof parsed.nickname === 'string' && parsed.nickname.trim() ? parsed.nickname.trim() : 'xensi_dev',
      avatarId: isAvatarId(parsed.avatarId) ? parsed.avatarId : DEFAULT_AVATAR,
      presets: ensureSinglePrimary(sourcePresets, parsed.presetStorageVersion !== 1),
      ...(parsed.presetStorageVersion === 1 ? { presetStorageVersion: 1 as const } : {}),
    }
  } catch {
    return { nickname: 'xensi_dev', avatarId: DEFAULT_AVATAR, presets: [] }
  }
}

export function readPlayerProfile(storage: Pick<Storage, 'getItem'>) {
  try { return parsePlayerProfile(storage.getItem(PLAYER_PROFILE_STORAGE_KEY)) }
  catch { return parsePlayerProfile(null) }
}

export function writePlayerProfile(storage: Pick<Storage, 'setItem'>, profile: PlayerProfileData) {
  storage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(profile))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('xensi-profile-updated'))
}

export function selectGamePreset(presets: SensitivityPreset[], gameId: GameSensitivityProfileId, explicitId?: string) {
  const matches = presets.filter(preset => preset.gameId === gameId)
  return matches.find(preset => preset.id === explicitId) ?? matches.find(preset => preset.isPrimary) ?? matches[0] ?? null
}

export type SessionContext = { presetId?: string; gameId: GameSensitivityProfileId; sensitivity: number; dpi: number; configuration?: { difficulty: string; durationSeconds: number } }

export function createSessionContext(gameId: GameSensitivityProfileId, sensitivity: number, dpi: number, presetId?: string, configuration?: SessionContext['configuration']): SessionContext {
  return { gameId, sensitivity, dpi, ...(presetId ? { presetId } : {}), ...(configuration ? { configuration } : {}) }
}

export function saveSensitivityPreset(storage: Pick<Storage, 'getItem' | 'setItem'>, values: Omit<SessionContext, 'presetId'>, updateId?: string) {
  const profile = readPlayerProfile(storage)
  const previous = profile.presets.find(preset => preset.id === updateId && preset.gameId === values.gameId)
  if (updateId && !previous) throw new Error('Preset no longer exists')
  const normalized = normalizeSensitivityForGame(values.sensitivity, GAME_SENSITIVITY_PROFILE_BY_ID[values.gameId])
  if (normalized === null || !Number.isFinite(values.dpi) || values.dpi < 1) throw new Error('Invalid preset')
  const now = new Date().toISOString()
  const preset: SensitivityPreset = {
    ...previous, ...values, sensitivity: normalized, dpi: Math.round(values.dpi),
    id: previous?.id ?? crypto.randomUUID(), isPrimary: previous?.isPrimary ?? false,
    createdAt: previous?.createdAt ?? now, updatedAt: now,
  }
  const presets = previous ? profile.presets.map(item => item.id === preset.id ? preset : item) : [...profile.presets, preset]
  writePlayerProfile(storage, { ...profile, presets: ensureSinglePrimary(presets) })
  return preset
}

export function calculatePresetCm360(preset: Pick<SensitivityPreset, 'gameId' | 'sensitivity' | 'dpi'>) {
  return calculateCm360(GAME_SENSITIVITY_PROFILE_BY_ID[preset.gameId], preset.sensitivity, preset.dpi)
}
