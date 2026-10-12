import { describe, expect, it } from 'vitest'
import { platformIds, regions, registry, validDiscord, validFreeText } from './registry'
import { routeStateFromPath, readRouteStateFromLocation } from '../routes'
describe('Squad Finder domain boundaries', () => {
  it('lists the 17 supported games and lets the host pick any platform', () => {
    expect(Object.keys(registry)).toHaveLength(17)
    expect(platformIds).toEqual(['pc', 'xbox_series', 'ps5', 'xbox_one', 'ps4'])
    expect(new Set(Object.values(registry).map(game => game.code)).size).toBe(17)
  })
  it('uses short region codes', () => {
    expect([...regions]).toEqual(['sa', 'na', 'eu', 'as', 'oc'])
  })
  it('validates Discord usernames rather than arbitrary descriptions or URLs', () => {
    for (const name of ['a', 'Display Name', 'User#1234', 'a..b', 'https://example.com', 'A_User', 'x'.repeat(33)]) expect(validDiscord(name)).toBe(false)
    for (const name of ['ab', '.a.b.', 'player_01', 'x'.repeat(32)]) expect(validDiscord(name)).toBe(true)
  })
  it('keeps free-text mode and rank short and free of links or contact hints', () => {
    for (const text of ['', 'Ouro II', 'Ranked Flex', 'Diamante 3 - Imortal', 'x'.repeat(24)]) expect(validFreeText(text)).toBe(true)
    for (const text of ['https://x.io', 'discord.gg', 'me@mail', 'tag#1234', 'www.site', 'a:b', 'x'.repeat(25), '<b>']) expect(validFreeText(text)).toBe(false)
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
