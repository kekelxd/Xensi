// The backend registry is authoritative; these defaults mirror it.
// Every game accepts every platform (the host decides) and mode/rank are free text.
export const platforms = { pc: 'PC', xbox_series: 'Xbox Series X|S', ps5: 'PlayStation 5', xbox_one: 'Xbox One', ps4: 'PlayStation 4' }
export type SquadPlatform = keyof typeof platforms
export const platformIds = Object.keys(platforms) as SquadPlatform[]

export const registry = {
  valorant: { name: 'Valorant', code: 'VA' },
  cs2: { name: 'Counter-Strike 2', code: 'CS' },
  fortnite: { name: 'Fortnite', code: 'FN' },
  rainbow6: { name: 'Rainbow Six Siege X', code: 'R6' },
  cod: { name: 'Call of Duty', code: 'CD' },
  apex: { name: 'Apex Legends', code: 'AP' },
  pubg: { name: 'PUBG: Battlegrounds', code: 'PU' },
  overwatch2: { name: 'Overwatch 2', code: 'OW' },
  marvel_rivals: { name: 'Marvel Rivals', code: 'MR' },
  delta_force: { name: 'Delta Force', code: 'DF' },
  the_finals: { name: 'The Finals', code: 'TF' },
  battlefield6: { name: 'Battlefield 6', code: 'BF' },
  lol: { name: 'League of Legends', code: 'LL' },
  dota2: { name: 'Dota 2', code: 'D2' },
  deadlock: { name: 'Deadlock', code: 'DL' },
  rocket_league: { name: 'Rocket League', code: 'RL' },
  ea_fc: { name: 'EA Sports FC', code: 'FC' },
} satisfies Record<string, { name: string; code: string }>
export type SquadGame = keyof typeof registry

export const regions = ['sa', 'na', 'eu', 'as', 'oc'] as const
export function validDiscord(value: string) { return /^[a-z0-9_.]{2,32}$/.test(value) && !value.includes('..') }
// Mode and rank are shown to other players: short, no links or contact hints (same rule as the database).
export function validFreeText(value: string) { return value.length <= 24 && !/[@#:/\\<>]/.test(value) && !/(http|www|discord|\.gg|\.com|\.net)/i.test(value) }
