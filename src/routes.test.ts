import { describe, expect, it } from 'vitest'
import { routeStateFromPath, viewRoutePath } from './routes'

describe('application route map', () => {
  it.each([
    ['warmup', '/train'],
    ['routine', '/train/routines'],
    ['calibration', '/calibrate'],
    ['converter', '/convert'],
    ['analysis', '/analysis'],
    ['profile', '/profile'],
    ['diagnostics', '/diagnostics'],
    ['polling', '/diagnostics/polling-rate'],
    ['buttons', '/diagnostics/input'],
    ['refresh-rate', '/diagnostics/refresh-rate'],
    ['controller-drift', '/diagnostics/controller-drift'],
    ['about', '/sobre'],
    ['privacy', '/privacidade'],
    ['terms', '/termos'],
    ['contact', '/contato'],
  ] as const)('maps %s to %s', (view, path) => {
    expect(viewRoutePath(view)).toBe(path)
  })

  it.each([
    ['switch', '/train/target-switch'],
    ['tracking', '/train/tracking'],
    ['flick', '/train/target-shooting'],
    ['reflex', '/train/reaction'],
    ['gridshot', '/train/gridshot'],
    ['strafetrack', '/train/strafetrack'],
    ['sniper-reaction', '/train/sniper'],
    ['micro_flick', '/train/micro-flick'],
  ] as const)('maps warmup exercise %s to %s', (warmupEntry, path) => {
    expect(viewRoutePath('warmup', { warmupEntry })).toBe(path)
  })

  it('maps methodology to the standalone route', () => {
    expect(viewRoutePath('analysis', { analysisSection: 'methodology' })).toBe('/methodology')
    expect(routeStateFromPath('methodology')).toMatchObject({ view: 'analysis', analysisSection: 'methodology' })
  })

  it.each([
    ['diagnostics/polling-rate', 'polling'],
    ['diagnostics/input', 'buttons'],
    ['diagnostics/refresh-rate', 'refresh-rate'],
    ['diagnostics/controller-drift', 'controller-drift'],
    ['sobre', 'about'],
    ['privacidade', 'privacy'],
    ['termos', 'terms'],
    ['contato', 'contact'],
    ['about', 'about'],
    ['privacy', 'privacy'],
    ['terms', 'terms'],
    ['contact', 'contact'],
    ['train/reaction', 'reflex'],
  ] as const)('parses %s', (path, expected) => {
    const state = routeStateFromPath(path)
    expect([state.view, state.warmupEntry]).toContain(expected)
  })
})
