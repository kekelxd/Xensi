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
  { id: 'tactical-fox-headset', label: 'Raposa com headset', group: 'tactical' },
  { id: 'tactical-wolf-scout', label: 'Lobo batedor', group: 'tactical' },
  { id: 'tactical-raccoon-nightvision', label: 'Guaxinim com visão noturna', group: 'tactical' },
  { id: 'tactical-owl-wink', label: 'Coruja piscando', group: 'tactical' },
  { id: 'tactical-panther-comms', label: 'Pantera no rádio', group: 'tactical' },
  { id: 'tactical-dog-cap', label: 'Cachorro de boné', group: 'tactical' },
  { id: 'tactical-bear-guard', label: 'Urso de guarda', group: 'tactical' },
  { id: 'tactical-bunny-beanie', label: 'Coelho de gorro', group: 'tactical' },
  { id: 'tactical-bat-helmet', label: 'Morcego de capacete', group: 'tactical' },
  { id: 'tactical-ferret-scout', label: 'Furão batedor', group: 'tactical' },
  { id: 'tactical-redpanda-goggles', label: 'Panda-vermelho de óculos', group: 'tactical' },
  { id: 'tactical-cat-hood', label: 'Gato encapuzado', group: 'tactical' },
  { id: 'tactical-otter-laugh', label: 'Lontra rindo', group: 'tactical' },
  { id: 'tactical-crow-visor', label: 'Corvo com visor', group: 'tactical' },
  { id: 'tactical-fox-wink', label: 'Raposa piscando', group: 'tactical' },
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
