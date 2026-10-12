import { GameBadge } from './GameBadge'
import { GAME_IDENTITY_BY_ID } from './gameIdentity'
import type { GameSensitivityProfileId } from './gameSensitivityProfiles'
import { useI18n } from './i18n'
import { selectGamePreset, type SensitivityPreset } from './playerProfileStore'
import { presetCopy } from './presetCopy'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupCard } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

const sectionTitle = 'm-0 font-sans text-xs font-medium leading-none tracking-normal normal-case text-muted-foreground'

export function GamePicker({ gameIds, value, onChange, presets = [] }: { gameIds: GameSensitivityProfileId[]; value: GameSensitivityProfileId; onChange: (id: GameSensitivityProfileId) => void; presets?: SensitivityPreset[] }) {
  const { t, locale } = useI18n()
  const text = presetCopy[locale]
  const savedGames = gameIds
    .filter(id => presets.some(preset => preset.gameId === id))
    .sort((left, right) => Number(Boolean(selectGamePreset(presets, right)?.isPrimary)) - Number(Boolean(selectGamePreset(presets, left)?.isPrimary)))
  const otherGames = gameIds.filter(id => !presets.some(preset => preset.gameId === id))

  // Saved games get a roomier card with the preset summary; the rest stay compact so ~11 games fit without scrolling.
  const renderGames = (ids: GameSensitivityProfileId[], compact = false) => <div className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]' : 'grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]')}>
    {ids.map(id => {
      const game = GAME_IDENTITY_BY_ID[id]
      const preset = selectGamePreset(presets, id)
      return <RadioGroupCard key={id} value={id} indicator={compact ? 'corner' : 'inline'} className={cn(compact ? 'gap-2.5 p-2.5 pr-6' : 'min-h-[76px] p-3.5')}>
        <GameBadge gameId={id} size="sm" selected={value === id} />
        <span className="grid min-w-0 gap-1">
          <strong className={cn('font-semibold leading-tight text-balance', compact ? 'text-xs' : 'text-[13px]')}>{game.name}</strong>
          {preset && <small className="text-xs font-normal tabular-nums text-muted-foreground">{preset.sensitivity} · {preset.dpi} DPI</small>}
          {preset?.isPrimary && <Badge variant="success" className="mt-0.5 px-2 py-0.5 text-[11px]">{text.primary}</Badge>}
        </span>
      </RadioGroupCard>
    })}
  </div>

  return <RadioGroup className="xensi-game-selector gap-4" aria-label={t('common.gameReference')} value={value} onValueChange={next => onChange(next as GameSensitivityProfileId)}>
    {savedGames.length > 0 && <section className="grid gap-2.5"><h4 className={sectionTitle}>{text.yourGames}</h4>{renderGames(savedGames)}</section>}
    {otherGames.length > 0 && <section className="grid gap-2.5"><h4 className={sectionTitle}>{text.otherGames}</h4>{renderGames(otherGames, true)}</section>}
  </RadioGroup>
}
