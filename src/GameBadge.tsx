import { GAME_IDENTITY_BY_ID } from './gameIdentity'
import type { GameSensitivityProfileId } from './gameSensitivityProfiles'
import './gameIdentity.css'

export function GameBadge({ gameId, size = 'md', selected = false, variant = 'default' }: { gameId: GameSensitivityProfileId; size?: 'sm' | 'md' | 'lg'; selected?: boolean; variant?: 'default' | 'reference' }) {
  const referenceCodes: Partial<Record<GameSensitivityProfileId, string>> = { valorant: 'VAL', cs2: 'CS2', overwatch2: 'OW2' }
  const code = variant === 'reference' ? referenceCodes[gameId] ?? GAME_IDENTITY_BY_ID[gameId].shortCode : GAME_IDENTITY_BY_ID[gameId].shortCode
  return <span aria-hidden="true" className={`xensi-game-badge badge-${size}${selected ? ' is-selected' : ''}`}>{code}</span>
}
