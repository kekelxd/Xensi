import { useSyncExternalStore } from 'react'
import { getPresetRepository } from './presetRepository'
import { GAME_SENSITIVITY_PROFILE_BY_ID } from './gameSensitivityProfiles'
import { calculateCm360 } from './sensitivityConversionEngine'
import { EXERCISES } from './warmupExercises'
import { useI18n, type TranslationKey } from './i18n'
import { ANALYSIS_COPY } from './analysisCopy'
import type { TrainingSession } from './trainingSession'
import { PERSONAL_BEST_COPY } from './personalBestCopy'

export function useSessionLabels() {
  const { locale, t } = useI18n(), copy = ANALYSIS_COPY[locale]
  const repo = getPresetRepository()
  const presets = useSyncExternalStore(repo.subscribe, repo.getSnapshot, repo.getSnapshot)
  const number = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(v)
  const exerciseName = (s: TrainingSession) => {
    const exercise = EXERCISES.find(e => e.id === s.exerciseId)!
    return exercise.name
  }
  const configuration = (s: TrainingSession, compact = false) => {
    const c = s.config!
    const pb = PERSONAL_BEST_COPY[locale]
    if (compact) return `${c.durationSeconds}s · ${t(`difficulty.${c.difficulty}`)} · ${c.arenaWidth}×${c.arenaHeight} · ${c.input === 'controller' ? pb.controller : pb.mouse} · v${s.exerciseVersion}`
    const px = (radius: number) => `${number(radius * Math.min(c.arenaWidth,c.arenaHeight))} px`
    const geometry = c.micro ? [
      `${t('micro.targetRadius')}: ${px(c.micro.radius)}`,
      `${t('micro.minRadius')}: ${px(c.micro.minRadius)}`,
      `${t('micro.maxRadius')}: ${px(c.micro.maxRadius)}`,
      `${t('micro.referenceRadius')}: ${px(c.micro.referenceRadius)}`,
      `${t('micro.timeout')}: ${number(c.micro.timeoutMs)} ms`,
      `${pb.respawn}: ${number(c.micro.respawnMs)} ms`,
    ] : c.sniper ? [`${pb.opening}: ${number(c.sniper.opening)}`, `${pb.radius}: ${number(c.sniper.radius)}`, `${pb.speed}: ${number(c.sniper.speed)}`]
      : [`${pb.scale}: ${number(c.targetScale)}`, `${pb.speed}: ${number(c.targetSpeed)}`, `${pb.dwell}: ${number(c.dwellMs)} ms`, `${pb.respawn}: ${number(c.respawnMs)} ms`]
    const crosshair = ['classic','dot','circle','plus'].includes(c.crosshair) ? t(`crosshair.${c.crosshair}` as TranslationKey) : c.crosshair
    return [`${c.durationSeconds}s`, t(`difficulty.${c.difficulty}`), `${pb.arena}: ${c.arenaWidth}×${c.arenaHeight}`,
      c.input === 'controller' ? pb.controller : pb.mouse, `${pb.crosshair}: ${crosshair}`, `${pb.targets}: ${c.targetCount}`,
      ...geometry, `v${s.exerciseVersion}`].join(' · ')
  }
  const fields = (s: TrainingSession, compact = false) => {
    const context = s.context!, profile = GAME_SENSITIVITY_PROFILE_BY_ID[context.gameId]
    const cm = profile ? calculateCm360(profile, context.sensitivity, context.dpi) : null
    const presetId = s.presetId ?? context.presetId
    const preset = presets.userId === s.userId && presets.status === 'ready' ? presets.items.find(p => p.id === presetId) : null
    return [[copy.game, profile?.name ?? context.gameId], [copy.sensitivity, number(context.sensitivity)], ['DPI', number(context.dpi)],
      ...(cm !== null && Number.isFinite(cm) ? [['cm/360', `${number(cm)} cm`]] : []), [copy.preset, presetId ? presets.userId === s.userId && presets.status !== 'ready' ? copy.loading : preset?.name || (preset ? copy.preset : copy.deletedPreset) : copy.noPreset],
      [copy.duration, `${number(s.durationMs / 1000)}s`], [copy.configuration, configuration(s, compact)],
      ...(context.routine ? [[copy.routine, context.routine.name]] : [])]
  }
  const date = (s: TrainingSession) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s.finishedAt))
  return { exerciseName, configuration, fields, date }
}
