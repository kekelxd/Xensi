import { Focus, Gauge, Grid3X3, MoveHorizontal, Target, Zap, type LucideIcon } from 'lucide-react'
import type { TranslationKey } from './i18n'
import type { WarmupExercise } from './warmupConfig'

export const EXERCISE_CATEGORIES = {
  precision: 'warmup.category.precision',
  tracking: 'warmup.category.tracking',
  reaction: 'warmup.category.reaction',
} as const satisfies Record<string, TranslationKey>
export type ExerciseCategory = keyof typeof EXERCISE_CATEGORIES

export type WarmupExerciseDefinition = {
  id: WarmupExercise
  category: ExerciseCategory
  name: string
  description: TranslationKey
  instruction: TranslationKey
  icon: LucideIcon
  fixedDifficultyOnly?: boolean
}

export const EXERCISES: WarmupExerciseDefinition[] = [
  { id: 'switch', category: 'precision', name: 'Target Switch', description: 'warmup.switch.description', instruction: 'warmup.switch.instruction', icon: Focus },
  { id: 'tracking', category: 'tracking', name: 'Tracking', description: 'warmup.tracking.description', instruction: 'warmup.tracking.instruction', icon: Gauge },
  { id: 'flick', category: 'precision', name: 'Target Shooting', description: 'warmup.flick.description', instruction: 'warmup.flick.instruction', icon: Target },
  { id: 'micro_flick', category: 'precision', name: 'Micro Flick', description: 'warmup.microFlick.description', instruction: 'warmup.microFlick.instruction', icon: Focus, fixedDifficultyOnly: true },
  { id: 'reflex', category: 'reaction', name: 'Reflex', description: 'warmup.reflex.description', instruction: 'warmup.reflex.instruction', icon: Zap },
  { id: 'gridshot', category: 'precision', name: 'Gridshot', description: 'warmup.gridshot.description', instruction: 'warmup.gridshot.instruction', icon: Grid3X3 },
  { id: 'strafetrack', category: 'tracking', name: 'Strafetrack', description: 'warmup.strafetrack.description', instruction: 'warmup.strafetrack.instruction', icon: MoveHorizontal },
  { id: 'sniper-reaction', category: 'reaction', name: 'Sniper Reaction', description: 'sniper.description', instruction: 'sniper.instruction', icon: Focus, fixedDifficultyOnly: true },
]
export function supportsExerciseDifficulty(exercise: WarmupExercise, difficulty: string) {
  return difficulty !== 'adaptive' || !EXERCISES.find(item => item.id === exercise)?.fixedDifficultyOnly
}
