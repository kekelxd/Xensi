import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getPersonalBestService, usePersonalBests } from './personalBestService'
import { formatPersonalBestValue } from './personalBests'
import { SESSION_REGISTRY, type TrainingSession } from './trainingSession'
import { variantKey } from './analysisService'
import { EXERCISES } from './warmupExercises'
import { PERSONAL_BEST_COPY } from './personalBestCopy'
import { useI18n, type TranslationKey } from './i18n'

export function PersonalBestPanel({ exercise, variant }: { exercise?: TrainingSession['exerciseId']; variant?: string } = {}) {
  const { locale, t } = useI18n(), copy = PERSONAL_BEST_COPY[locale]
  const state = usePersonalBests()
  const items = state.items.filter(best => (!exercise || best.exerciseId === exercise) && (!variant || variantKey(best.session) === variant))
  const [expanded, setExpanded] = useState(false)
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)
  return <article className="analysis-panel analysis-pb-panel" aria-label={copy.title}>
    <div><h2>{copy.title}</h2><button type="button" className="icon-button" title={copy.retry} aria-label={copy.retry}
      disabled={state.status === 'loading'} onClick={() => void getPersonalBestService().refresh()}><RefreshCw size={17} /></button></div>
    {state.status === 'loading' ? <p className="analysis-empty" role="status">{copy.loading}</p>
      : state.status === 'error' ? <p className="analysis-empty" role="status">{copy.unavailable}</p>
      : !items.length ? <p className="analysis-empty">{copy.empty}<br />{copy.emptyText}</p>
      : <div className="analysis-pb-list">
        {items.slice(0, expanded ? items.length : 8).map(best => {
          const config = best.session.config!
          const fields = [
            [copy.input, config.input === 'controller' ? copy.controller : copy.mouse],
            [copy.arena, `${config.arenaWidth} × ${config.arenaHeight}`],
            [copy.crosshair, ['classic', 'dot', 'circle', 'plus'].includes(config.crosshair) ? t(`crosshair.${config.crosshair}` as TranslationKey) : config.crosshair],
            [copy.targets, number(config.targetCount)],
            ...(config.micro ? [[t('micro.targetRadius'), `${number(config.micro.radius * Math.min(config.arenaWidth, config.arenaHeight))} px`],
              [t('micro.minRadius'), `${number(config.micro.minRadius * Math.min(config.arenaWidth, config.arenaHeight))} px`],
              [t('micro.maxRadius'), `${number(config.micro.maxRadius * Math.min(config.arenaWidth, config.arenaHeight))} px`],
              [t('micro.timeout'), `${number(config.micro.timeoutMs)} ms`]] : config.sniper ? [[copy.opening, number(config.sniper.opening)], [copy.radius, number(config.sniper.radius)], [copy.speed, number(config.sniper.speed)]]
              : [[copy.scale, number(config.targetScale)], [copy.speed, number(config.targetSpeed)], [copy.dwell, `${number(config.dwellMs)} ms`], [copy.respawn, `${number(config.respawnMs)} ms`]]),
          ]
          return <section key={best.key} data-session-id={best.sessionId}>
            <span>{EXERCISES.find(exercise => exercise.id === best.exerciseId)?.name}</span>
            <strong>{formatPersonalBestValue({ definition: SESSION_REGISTRY[best.exerciseId], value: best.value }, locale)}</strong>
            <small>{config.durationSeconds}s · {t(`difficulty.${config.difficulty}`)} · v{best.exerciseVersion}</small>
            <time dateTime={best.achievedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(best.achievedAt))}</time>
            <details><summary>{copy.configuration}</summary><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>
          </section>
        })}
      </div>}
    {state.status === 'ready' && items.length > 8 && <button className="secondary-button" type="button" onClick={() => setExpanded(value => !value)}>{expanded ? copy.less : copy.all}</button>}
  </article>
}
