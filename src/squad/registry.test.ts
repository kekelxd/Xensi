import { describe, expect, it } from 'vitest'
import { compatible, ranksFor, validDiscord } from './registry'
import { routeStateFromPath, readRouteStateFromLocation } from '../routes'
describe('Squad Finder domain boundaries', () => {
  it('separates Valorant PC and console even with crossplay', () => {
    expect(compatible('valorant', 'pc', 'ps5', true)).toBe(false)
    expect(compatible('valorant', 'xbox_series', 'ps5', false)).toBe(false)
    expect(compatible('valorant', 'xbox_series', 'ps5', true)).toBe(true)
    expect(compatible('valorant', 'ps4', 'ps5', true)).toBe(false)
  })
  it('CS2 has only PC, Fortnite honors console crossplay settings', () => {
    expect(compatible('cs2', 'pc', 'xbox_series', true)).toBe(false)
    expect(compatible('fortnite', 'pc', 'xbox_one', false)).toBe(false)
    expect(compatible('fortnite', 'pc', 'ps4', true)).toBe(true)
  })
  it('validates Discord usernames rather than arbitrary descriptions or URLs', () => {
    for (const name of ['a', 'Display Name', 'User#1234', 'a..b', 'https://example.com', 'A_User', 'x'.repeat(33)]) expect(validDiscord(name)).toBe(false)
    for (const name of ['ab', '.a.b.', 'player_01', 'x'.repeat(32)]) expect(validDiscord(name)).toBe(true)
  })
  it('ranks belong to the selected game mode', () => {
    expect(ranksFor('valorant','unrated')).toEqual(['unranked'])
    expect(ranksFor('cs2','premier')).not.toContain('gold_nova')
    expect(ranksFor('cs2','wingman')).not.toContain('rating_0_4999')
    expect(ranksFor('fortnite','battle_royale')).toEqual(['unranked'])
  })
  it('resolves direct area links without changing tools', () => {
    for(const pathname of ['/squad','/squad/my-room','/squad/requests','/squad/moderation','/squad/blocks']) {
      expect(routeStateFromPath(pathname).view).toBe('squad')
      expect(readRouteStateFromLocation({ pathname, search: '' } as Location).canonicalPath).toBe(pathname)
    }
    expect(routeStateFromPath('convert').view).toBe('converter')
    expect(routeStateFromPath('train').view).toBe('warmup')
  })
})
