import { GameBadge } from './GameBadge'
import type { GameSensitivityProfileId } from './gameSensitivityProfiles'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type GameOption = { id: GameSensitivityProfileId; name: string }

/** Game dropdown: the badge travels with the name into the trigger, so the chosen game reads at a glance. */
export function GameSelect({ games, value, onValueChange, label, id, large = false, disabled = false, className }: { games: readonly GameOption[]; value: GameSensitivityProfileId; onValueChange: (id: GameSensitivityProfileId) => void; label?: string; id?: string; large?: boolean; disabled?: boolean; className?: string }) {
  return <Select value={value} disabled={disabled} onValueChange={next => onValueChange(next as GameSensitivityProfileId)}>
    <SelectTrigger id={id} aria-label={label} className={cn('pl-2', large && 'data-[size=default]:h-[60px] font-heading text-lg font-semibold', className)}><SelectValue /></SelectTrigger>
    <SelectContent className="max-h-[min(420px,var(--radix-select-content-available-height))]">
      {games.map(game => <SelectItem key={game.id} value={game.id} className="py-2 pl-2">
        <span className="flex items-center gap-3"><GameBadge gameId={game.id} size="sm" /><span className="truncate">{game.name}</span></span>
      </SelectItem>)}
    </SelectContent>
  </Select>
}
