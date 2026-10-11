import { animate } from 'motion/react'
import { flushSync } from 'react-dom'
import type { AppView } from '../routes'
import { xensiMotion } from './motion'

const presentationRoutes = new Set<AppView>(['home', 'analysis', 'profile', 'diagnostics', 'converter', 'about', 'privacy', 'terms', 'contact'])
let generation = 0
let current: ViewTransition | null = null
let fallback: ReturnType<typeof animate> | null = null

export function navigateWithPageMotion(update: () => void, from: AppView, to: AppView, blocked: boolean) {
  const version = ++generation
  current?.skipTransition()
  fallback?.complete()
  fallback = null
  if (blocked || document.pointerLockElement || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !presentationRoutes.has(from) || !presentationRoutes.has(to) || from === to) {
    update()
    return
  }
  if (document.startViewTransition) {
    const transition = document.startViewTransition(() => { if (version === generation) flushSync(update) })
    current = transition
    // An interrupted capture rejects ready even though the route update succeeds.
    void transition.ready.catch(() => {})
    void transition.finished.catch(() => {}).finally(() => { if (current === transition) current = null })
  } else {
    flushSync(update)
    const content = document.querySelector<HTMLElement>('[data-page-motion], .analysis-workspace, .profile-v1-shell, .converter-workspace, .diagnostic-hub-workspace, .content-page-shell')
    if (content) fallback = animate(content, { opacity: [0.5, 1], y: [12, 0] }, { duration: xensiMotion.durations.slow, ease: xensiMotion.easings.easeOut })
  }
}
