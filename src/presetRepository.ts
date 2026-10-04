import type { SupabaseClient } from '@supabase/supabase-js'
import { AccountCollectionRepository, bindAccountCollection, type CollectionState } from './accountCollectionRepository'
import { getSupabaseClient } from './supabaseClient'
import { GAME_SENSITIVITY_PROFILE_BY_ID, type GameSensitivityProfileId } from './gameSensitivityProfiles'
import { normalizeSensitivityForGame } from './sensitivityConversionEngine'
import type { SensitivityPreset } from './playerProfileStore'
import { importReceiptKey, markGuestPresetsImported, pendingGuestPresets, presetCacheKey, readGuestPresets, readPresetCache, writeGuestPresets } from './presetStorage'
import { PLAYER_PROFILE_STORAGE_KEY } from './playerProfileStore'

export type PresetInput = Pick<SensitivityPreset, 'gameId' | 'sensitivity' | 'dpi'> & Partial<Pick<SensitivityPreset, 'name' | 'isPrimary'>>
export type PresetState = {
  status: 'auth-loading' | 'presets-loading' | 'ready'
  userId: string | null
  presets: SensitivityPreset[]
  pendingImport: number
  importOffered: boolean
  busy: boolean
  error: 'sync' | 'import' | null
}
export type PresetRow = {
  id: string; user_id: string; game_id: string; name: string | null
  sensitivity: number; dpi: number; is_primary: boolean; created_at: string; updated_at: string
}
export interface PresetCloud {
  getAll(userId: string): Promise<SensitivityPreset[]>
  save(id: string, input: Required<PresetInput>, createNew: boolean, userId: string): Promise<SensitivityPreset[]>
  remove(id: string, userId: string): Promise<void>
  setPrimary(id: string, userId: string): Promise<SensitivityPreset[]>
  importGuestPresets(presets: SensitivityPreset[], userId: string): Promise<SensitivityPreset[]>
}

function fromRow(row: PresetRow): SensitivityPreset {
  if (!(row.game_id in GAME_SENSITIVITY_PROFILE_BY_ID)) throw new Error('Unsupported game profile')
  return { id: row.id, gameId: row.game_id as GameSensitivityProfileId, name: row.name ?? undefined,
    sensitivity: Number(row.sensitivity), dpi: row.dpi, isPrimary: row.is_primary,
    createdAt: row.created_at, updatedAt: row.updated_at }
}

export function createPresetCloud(getClient: () => SupabaseClient | null): PresetCloud {
  const client = () => {
    const value = getClient()
    if (!value) throw new Error('Supabase unavailable')
    return value
  }
  const rows = (data: unknown, error: unknown) => {
    if (error || !Array.isArray(data)) throw new Error('Preset request failed')
    return (data as PresetRow[]).map(fromRow)
  }
  return {
    async getAll(userId) {
      const presets: SensitivityPreset[] = []
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client().from('sensitivity_presets').select('*').eq('user_id', userId)
          .order('created_at').order('id').range(offset, offset + 499)
        const page = rows(data, error)
        presets.push(...page)
        if (page.length < 500) return presets
      }
    },
    async save(id, input, createNew, userId) {
      const { data, error } = await client().rpc('xensi_save_sensitivity_preset', {
        preset_id: id, preset_game_id: input.gameId, preset_name: input.name,
        preset_sensitivity: input.sensitivity, preset_dpi: input.dpi, preset_primary: input.isPrimary, create_new: createNew, expected_user_id: userId,
      })
      return rows(data, error)
    },
    async remove(id, userId) {
      const { data, error } = await client().from('sensitivity_presets').delete().eq('id', id).eq('user_id', userId).select('id')
      if (error || data?.length !== 1) throw new Error('Preset delete failed')
    },
    async setPrimary(id, userId) {
      const { data, error } = await client().rpc('xensi_set_primary_sensitivity_preset', { preset_id: id, expected_user_id: userId })
      return rows(data, error)
    },
    async importGuestPresets(presets, userId) {
      const { data, error } = await client().rpc('xensi_import_sensitivity_presets', { expected_user_id: userId, presets: presets.map(preset => ({
        id: preset.id, game_id: preset.gameId, name: preset.name ?? null,
        sensitivity: preset.sensitivity, dpi: preset.dpi, is_primary: preset.isPrimary,
      })) })
      return rows(data, error)
    },
  }
}

export class PresetRepository extends AccountCollectionRepository<SensitivityPreset> {
  private snapshotSource?: CollectionState<SensitivityPreset>
  private snapshotView!: Omit<CollectionState<SensitivityPreset>, 'status'> & PresetState
  constructor(storage: Storage, private cloud: PresetCloud, offerStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    super(storage, {
      namespace: 'xensi-presets', readGuest: () => readGuestPresets(storage),
      readCache: id => readPresetCache(storage, id),
      writeCache: (id, items) => storage.setItem(presetCacheKey(id), JSON.stringify(items)),
      pendingGuest: id => pendingGuestPresets(storage, id),
      markImported: (id, items) => markGuestPresetsImported(storage, id, items),
      fetch: id => cloud.getAll(id), import: (items, id) => cloud.importGuestPresets(items, id),
    }, offerStorage)
  }
  getSnapshot = () => {
    if (this.snapshotSource !== this.state) {
      this.snapshotSource = this.state
      this.snapshotView = { ...this.state, status: this.state.status === 'data-loading' ? 'presets-loading' : this.state.status, presets: this.state.items } as Omit<CollectionState<SensitivityPreset>, 'status'> & PresetState
    }
    return this.snapshotView
  }
  private validate(input: PresetInput, previous?: SensitivityPreset): Required<PresetInput> {
    const game = GAME_SENSITIVITY_PROFILE_BY_ID[input.gameId]
    if (!game || !Number.isFinite(input.sensitivity) || input.sensitivity <= 0 || !Number.isInteger(input.dpi) || input.dpi < 1 || input.dpi > 2147483647) throw new Error('Invalid preset')
    const sensitivity = game.inputModel.type === 'unavailable' ? input.sensitivity : normalizeSensitivityForGame(input.sensitivity, game)
    if (sensitivity === null || sensitivity <= 0) throw new Error('Invalid sensitivity')
    return { gameId: input.gameId, sensitivity, dpi: input.dpi, name: input.name?.trim() ?? previous?.name ?? '',
      isPrimary: input.isPrimary ?? previous?.isPrimary ?? this.getAll().length === 0 }
  }
  create(input: PresetInput) { return this.save(crypto.randomUUID(), input, true) }
  update(id: string, input: PresetInput) { return this.save(id, input, false) }
  private save(id: string, input: PresetInput, createNew: boolean) {
    return this.mutation(async userId => {
      const previous = this.getById(id)
      if (!createNew && !previous) throw new Error('Preset not found')
      const values = this.validate(input, previous ?? undefined)
      if (userId) return this.cloud.save(id, values, createNew, userId)
      const now = new Date().toISOString()
      const preset = { ...values, id, createdAt: previous?.createdAt ?? now, updatedAt: now }
      const presets = createNew ? [...this.getAll(), preset] : this.getAll().map(item => item.id === id ? preset : item)
      const result = values.isPrimary ? presets.map(item => ({ ...item, isPrimary: item.id === id,
        updatedAt: item.isPrimary && item.id !== id ? now : item.updatedAt })) : presets
      writeGuestPresets(this.storage, result)
      return result
    })
  }
  remove(id: string) {
    return this.mutation(async userId => {
      if (!this.getById(id)) throw new Error('Preset not found')
      if (userId) await this.cloud.remove(id, userId)
      const presets = this.getAll().filter(preset => preset.id !== id)
      if (!userId) writeGuestPresets(this.storage, presets)
      return presets
    })
  }
  setPrimary(id: string) {
    return this.mutation(async userId => {
      if (!this.getById(id)) throw new Error('Preset not found')
      if (userId) return this.cloud.setPrimary(id, userId)
      const now = new Date().toISOString()
      const presets = this.getAll().map(preset => ({ ...preset, isPrimary: preset.id === id,
        updatedAt: preset.isPrimary !== (preset.id === id) ? now : preset.updatedAt }))
      writeGuestPresets(this.storage, presets)
      return presets
    })
  }
  importGuestPresets() { return this.importGuestData() }
}

let repository: PresetRepository | undefined
export function getPresetRepository() {
  if (!repository) {
    repository = new PresetRepository(window.localStorage, createPresetCloud(getSupabaseClient), window.sessionStorage)
    bindAccountCollection(repository, { guest: [PLAYER_PROFILE_STORAGE_KEY], cache: presetCacheKey, receipt: importReceiptKey, guestEvent: 'xensi-profile-updated' })
  }
  return repository
}
