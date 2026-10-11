import { useReducedMotion, type Transition, type Variants } from 'motion/react'

export const xensiMotion = {
  durations: { instant: 0.09, fast: 0.14, normal: 0.2, slow: 0.3, micro: 0.14, interaction: 0.24, layout: 0.32, reveal: 0.56, cinematic: 0.9 },
  hero: { background: 0, title: 0.12, lineGap: 0.1, description: 0.32, actions: 0.44, actionGap: 0.08 },
  easings: {
    easeStandard: [0.2, 0, 0, 1],
    easeOut: [0.16, 1, 0.3, 1],
    easeInOut: [0.4, 0, 0.2, 1],
  },
  springs: {
    springFast: { type: 'spring', stiffness: 460, damping: 34 },
    springLayout: { type: 'spring', stiffness: 420, damping: 36 },
  },
} as const

export function useXensiMotion() {
  const reduced = useReducedMotion() ?? false
  const enter: Transition = { duration: reduced ? xensiMotion.durations.instant : xensiMotion.durations.normal, ease: xensiMotion.easings.easeOut }
  const exit: Transition = { duration: reduced ? xensiMotion.durations.instant : xensiMotion.durations.fast, ease: xensiMotion.easings.easeStandard }
  const surface = (y: number, scale: number): Variants => ({
    closed: { opacity: 0, y: reduced ? 0 : y, scale: reduced ? 1 : scale, transition: exit },
    open: { opacity: 1, y: 0, scale: 1, transition: enter },
  })
  return {
    reduced, enter, exit,
    layout: reduced ? { duration: 0 } : xensiMotion.springs.springLayout,
    indicator: reduced ? { duration: 0 } : xensiMotion.springs.springFast,
    dropdownVariants: surface(-8, 0.97),
    dialogVariants: surface(6, 0.98),
    cardVariants: surface(0, 0.98),
    fadeVariants: surface(0, 1),
  }
}
