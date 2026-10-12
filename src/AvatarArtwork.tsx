import { DEFAULT_AVATAR, XENSI_AVATARS, avatarSource, isAvatarId } from './avatars'

type AvatarSize = 'sm' | 'md' | 'lg' | 'picker'

type AvatarArtworkProps = {
  avatarId: string
  className?: string
  size?: AvatarSize
  selected?: boolean
  loading?: 'lazy' | 'eager'
}

export function AvatarArtwork({ avatarId, className = '', size = 'md', selected = false, loading }: AvatarArtworkProps) {
  const resolved = isAvatarId(avatarId) ? avatarId : DEFAULT_AVATAR
  const avatar = XENSI_AVATARS.find((item) => item.id === resolved)!
  return <span className={`xensi-avatar xensi-avatar-${size}${selected ? ' selected' : ''} ${className}`.trim()}>
    <img src={avatarSource(resolved)} alt={avatar.label} draggable={false} loading={loading} width={512} height={512} />
  </span>
}
