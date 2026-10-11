// Official compatibility sources and review date: docs/squad-finder.md.
// The backend registry is authoritative; these defaults match migration V1.
export type SquadGame = 'valorant' | 'cs2' | 'fortnite'
export const platforms = { pc: 'PC', xbox_series: 'Xbox Series X|S', ps5: 'PlayStation 5', xbox_one: 'Xbox One', ps4: 'PlayStation 4' }
export type SquadPlatform = keyof typeof platforms
export const registry = {
  valorant: { name: 'Valorant', platforms: ['pc', 'xbox_series', 'ps5'], modes: ['competitive', 'unrated'], ranks: ['unranked', 'iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'ascendant', 'immortal', 'radiant'] },
  cs2: { name: 'Counter-Strike 2', platforms: ['pc'], modes: ['premier', 'competitive', 'wingman'], ranks: ['unranked', 'silver', 'gold_nova', 'master_guardian', 'distinguished', 'legendary', 'supreme', 'global', 'rating_0_4999', 'rating_5000_9999', 'rating_10000_14999', 'rating_15000_19999', 'rating_20000_plus'] },
  fortnite: { name: 'Fortnite', platforms: ['pc', 'xbox_series', 'ps5', 'xbox_one', 'ps4'], modes: ['battle_royale', 'zero_build', 'ranked_br', 'ranked_zero_build'], ranks: ['unranked', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite', 'champion', 'unreal'] },
} satisfies Record<SquadGame, { name: string; platforms: SquadPlatform[]; modes: string[]; ranks: string[] }>
export const regions = ['br', 'na', 'eu', 'latam', 'asia', 'oce'] as const
export function compatible(game: SquadGame, host: SquadPlatform, guest: SquadPlatform, crossplay: boolean) {
  const allowed: readonly string[] = registry[game].platforms
  if (!allowed.includes(host) || !allowed.includes(guest)) return false
  if (host === guest) return true
  if (!crossplay) return false
  return game === 'fortnite' || (game === 'valorant' && host !== 'pc' && guest !== 'pc')
}
export function validDiscord(value: string) { return /^[a-z0-9_.]{2,32}$/.test(value) && !value.includes('..') }
export function ranksFor(game: SquadGame, mode: string): readonly string[] {
  if (game === 'valorant') return mode === 'competitive' ? registry.valorant.ranks : ['unranked']
  if (game === 'fortnite') return mode.startsWith('ranked_') ? registry.fortnite.ranks : ['unranked']
  return registry.cs2.ranks.filter(rank => rank === 'unranked' || (mode === 'premier' ? rank.startsWith('rating_') : !rank.startsWith('rating_')))
}
