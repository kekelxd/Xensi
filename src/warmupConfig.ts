import type { GameConfig } from './games'
import { getAimGain } from './aimModel'

export type WarmupDifficulty = 'easy' | 'medium' | 'hard' | 'adaptive'
export type FixedWarmupDifficulty = Exclude<WarmupDifficulty, 'adaptive'>
export type WarmupExercise = 'switch' | 'tracking' | 'flick' | 'reflex' | 'gridshot' | 'strafetrack' | 'sniper-reaction' | 'micro_flick'

export type WarmupDifficultyConfig = {
  label: string
  targetScale: number
  targetSpeed: number
  dwellMs: number
  respawnMs: number
}

export const WARMUP_DURATION = 60

export const WARMUP_DIFFICULTIES: Record<WarmupDifficulty, WarmupDifficultyConfig> = {
  easy: { label: 'Fácil', targetScale: 1.18, targetSpeed: 0.24, dwellMs: 650, respawnMs: 220 },
  medium: { label: 'Normal', targetScale: 0.94, targetSpeed: 0.34, dwellMs: 470, respawnMs: 150 },
  hard: { label: 'Difícil', targetScale: 0.72, targetSpeed: 0.46, dwellMs: 320, respawnMs: 90 },
  adaptive: { label: 'Adaptativa', targetScale: 0.94, targetSpeed: 0.34, dwellMs: 470, respawnMs: 150 },
}

export function getWarmupPointerGain(game: GameConfig, sensitivity: number) {
  const gameScale = getAimGain(game, sensitivity, 1 / 0.022) ?? sensitivity / 50
  return Math.max(0.12, Math.min(4, gameScale))
}

export function calculateWarmupAccuracy(hits: number, shots: number) {
  return shots > 0 ? Math.max(0, Math.min(100, hits / shots * 100)) : 0
}
