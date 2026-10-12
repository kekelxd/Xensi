export const XENSI_AVATARS = [
  { id: 'cat-happy', label: 'Gato feliz', group: 'cats' },
  { id: 'cat-playful', label: 'Gato brincando', group: 'cats' },
  { id: 'cat-sleeping', label: 'Gato dormindo', group: 'cats' },
  { id: 'cat-box', label: 'Gato na caixa', group: 'cats' },
  { id: 'cat-wave', label: 'Gato acenando', group: 'cats' },
  { id: 'cat-headset', label: 'Gato com headset', group: 'cats' },
  { id: 'cat-back', label: 'Gato de costas', group: 'cats' },
  { id: 'cat-relaxed', label: 'Gato relaxado', group: 'cats' },
  { id: 'dog-peeking', label: 'Cachorro espiando', group: 'dogs' },
  { id: 'dog-happy', label: 'Cachorro feliz', group: 'dogs' },
  { id: 'dog-headset', label: 'Cachorro com headset', group: 'dogs' },
  { id: 'dog-sleeping', label: 'Cachorro dormindo', group: 'dogs' },
  { id: 'dog-sitting', label: 'Cachorro sentado', group: 'dogs' },
  { id: 'hamster-gaming', label: 'Hamster jogando', group: 'hamsters' },
  { id: 'hamster-looking', label: 'Hamster olhando', group: 'hamsters' },
  { id: 'hamster-sleeping', label: 'Hamster dormindo', group: 'hamsters' },
  { id: 'hamster-box', label: 'Hamster na caixa', group: 'hamsters' },
  { id: 'hamster-snack', label: 'Hamster com lanche', group: 'hamsters' },
  { id: 'hamster-laptop', label: 'Hamster no notebook', group: 'hamsters' },
  { id: 'hamster-focused', label: 'Hamster concentrado', group: 'hamsters' },
  { id: 'hamster-happy', label: 'Hamster feliz', group: 'hamsters' },
  { id: 'neon-fox-happy', label: 'Raposa feliz', group: 'neon' },
  { id: 'neon-fox-nightvision', label: 'Raposa com visão noturna', group: 'neon' },
  { id: 'neon-wolf-howl', label: 'Lobo uivando', group: 'neon' },
  { id: 'neon-wolf-comms', label: 'Lobo no rádio', group: 'neon' },
  { id: 'neon-raccoon-gaming', label: 'Guaxinim jogando', group: 'neon' },
  { id: 'neon-raccoon-sneak', label: 'Guaxinim espreitando', group: 'neon' },
  { id: 'neon-bunny-happy', label: 'Coelho feliz', group: 'neon' },
  { id: 'neon-bunny-headset', label: 'Coelho com headset', group: 'neon' },
  { id: 'neon-bunny-tactical', label: 'Coelho tático', group: 'neon' },
  { id: 'neon-bear-relaxed', label: 'Urso relaxado', group: 'neon' },
  { id: 'neon-bear-visor', label: 'Urso com visor', group: 'neon' },
  { id: 'neon-bear-focused', label: 'Urso concentrado', group: 'neon' },
  { id: 'neon-owl-perched', label: 'Coruja no galho', group: 'neon' },
  { id: 'neon-owl-scout', label: 'Coruja batedora', group: 'neon' },
  { id: 'neon-tiger-sitting', label: 'Tigre sentado', group: 'neon' },
  { id: 'neon-tiger-pounce', label: 'Tigre atacando', group: 'neon' },
  { id: 'neon-corgi-happy', label: 'Corgi feliz', group: 'neon' },
  { id: 'neon-corgi-tactical', label: 'Corgi tático', group: 'neon' },
] as const

export type AvatarId = typeof XENSI_AVATARS[number]['id']
export const DEFAULT_AVATAR: AvatarId = 'cat-headset'
type ImportMetaWithBaseUrl = ImportMeta & { readonly env?: { readonly BASE_URL?: string } }

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && XENSI_AVATARS.some((avatar) => avatar.id === value)
}

export function avatarSource(avatarId: AvatarId) {
  const baseUrl = (import.meta as ImportMetaWithBaseUrl).env?.BASE_URL ?? '/'
  return `${baseUrl}avatars/individual/${avatarId}.png`
}
