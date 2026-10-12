import { animate, useReducedMotion } from 'motion/react'
import { useEffect, type RefObject } from 'react'
import type { AppView } from '../routes'
import { xensiMotion } from './motion'

const toolRoutes = new Set<AppView>(['warmup', 'routine', 'calibration', 'converter', 'profile', 'analysis', 'diagnostics', 'about', 'privacy', 'terms', 'contact'])
export function useRouteReveal(root: RefObject<HTMLElement | null>, view: AppView) {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (!toolRoutes.has(view) || reduced || document.hidden || document.pointerLockElement) return
    const element = root.current
    if (!element || element.querySelector('.warmup-game-workspace, .finder-run-workspace, .spatial-hunt')) return
    const surfaces = element.querySelectorAll<HTMLElement>('[data-reveal], .warmup-category-filters, .warmup-exercises, .converter-card, .converter-summary, .analysis-v1-filters, .av1-section, .diagnostic-hub-grid, .calibration-hero, .routine-library-panel, .routine-builder-layout')
    const controls = [...surfaces].slice(0, 6).map((surface, index) => animate(surface, { opacity: [.55, 1], y: [18, 0] }, { duration: xensiMotion.durations.reveal, delay: index * .065, ease: xensiMotion.easings.easeOut }))
    // Finish surviving DOM nodes so StrictMode/interruptions never freeze opacity.
    return () => controls.forEach(control => control.complete())
  }, [root, view, reduced])
}
