// three.js lives in its own chunk; it is only fetched when a first-person exercise can be opened.
let loaded: typeof import('./SniperArena') | null = null

export const loadSniperArena = () => import('./SniperArena').then(module => (loaded = module))
export const getLoadedSniperArena = () => loaded?.SniperArena ?? null
// Warm the chunk while the player is still choosing, so the arena mounts (and takes pointer lock) right on start.
export const preloadSniperArena = () => { void loadSniperArena() }
