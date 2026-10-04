import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GameBadge } from './GameBadge'
import { GAME_IDENTITIES } from './gameIdentity'
import { GAME_SENSITIVITY_PROFILES } from './gameSensitivityProfiles'
import { createSessionContext, ensureSinglePrimary, parsePlayerProfile, saveSensitivityPreset, selectGamePreset, type SensitivityPreset } from './playerProfileStore'
import { draftFromPreset, editSensitivityDraft } from './useSensitivityPreset'
import { createEmptyWarmupMetrics, toWarmupSessionSummary } from './warmupTelemetry'

const a: SensitivityPreset = { id: 'a', gameId: 'cs2', sensitivity: .65, dpi: 800, isPrimary: true, createdAt: '2026-09-05', updatedAt: '2026-09-05' }
const b: SensitivityPreset = { ...a, id: 'b', sensitivity: .7, isPrimary: false }
describe('shared sensitivity presets', () => {
  it('resolves primary, absent and explicit choices without assuming game ID is unique', () => {
    expect(selectGamePreset([b, a], 'cs2')).toEqual(a)
    expect(selectGamePreset([a, b], 'cs2', 'b')).toEqual(b)
    expect(selectGamePreset([a], 'valorant')).toBeNull()
    expect(selectGamePreset([b], 'cs2')).toEqual(b)
  })
  it('migrates to one primary across games and preserves IDs and values', () => {
    const values = [a, b, { ...a, id: 'v', gameId: 'valorant' as const, isPrimary: false }]
    const result = parsePlayerProfile(JSON.stringify({ presets: values }))
    expect(result.presets.map(p => p.isPrimary)).toEqual([true, false, false])
    expect(result.presets.map(p => p.id)).toEqual(['a', 'b', 'v'])
    expect(ensureSinglePrimary(result.presets)).toEqual(result.presets)
  })
  it('keeps manual edits and navigation values in a draft without mutating a preset', () => {
    const initial = draftFromPreset('cs2', { ...a, sensitivity: .75 })
    expect(initial.sensitivity).toBe('0.75')
    const edited = editSensitivityDraft(draftFromPreset('cs2', a), { sensitivity: '0.70' })
    expect(edited).toMatchObject({ sensitivity: '0.70', dpi: '800', dirty: true, presetId: 'a' })
    expect(editSensitivityDraft(edited, { dpi: '1600' }).sensitivity).toBe('0.70')
    expect(a.sensitivity).toBe(.65)
  })
  it('saves a new preset without overwriting and updates only an explicit ID', () => {
    let raw = JSON.stringify({ presets: [a, b] })
    const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value } }
    saveSensitivityPreset(storage, { gameId: 'cs2', sensitivity: .61, dpi: 800 })
    expect(parsePlayerProfile(raw).presets).toHaveLength(3)
    expect(parsePlayerProfile(raw).presets[0].sensitivity).toBe(.65)
    saveSensitivityPreset(storage, { gameId: 'cs2', sensitivity: .61, dpi: 800 }, 'a')
    expect(parsePlayerProfile(raw).presets[0].sensitivity).toBe(.61)
    expect(parsePlayerProfile(raw).presets[1].sensitivity).toBe(.7)
    expect(() => saveSensitivityPreset(storage, { gameId: 'cs2', sensitivity: .6, dpi: 800 }, 'missing')).toThrow()
  })
  it('stores a detached snapshot of the values used, including temporary adjustments', () => {
    const context = createSessionContext('cs2', .7, 800, a.id)
    const session = toWarmupSessionSummary({ ...createEmptyWarmupMetrics(60), sessionContext: context })
    context.sensitivity = .8
    expect(session.sessionContext).toEqual({ gameId: 'cs2', sensitivity: .7, dpi: 800, presetId: 'a' })
    expect(createSessionContext('cs2', 1, 800)).not.toHaveProperty('presetId')
  })
  it('has unique neutral codes for every game and renders badges without official images', () => {
    expect(GAME_IDENTITIES).toHaveLength(GAME_SENSITIVITY_PROFILES.length)
    expect(new Set(GAME_IDENTITIES.map(game => game.shortCode)).size).toBe(GAME_IDENTITIES.length)
    for (const game of GAME_IDENTITIES) {
      expect(game.shortCode).toMatch(/^[A-Z]{2}$/)
      const html = renderToStaticMarkup(<GameBadge gameId={game.id} size="sm" selected />)
      expect(html).toContain(`>${game.shortCode}</span>`)
      expect(html).toContain('is-selected')
      expect(html).not.toContain('<img')
    }
  })
})
