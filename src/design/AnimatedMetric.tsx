import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { xensiMotion } from './motion'

// Interpolate presentation, never a fabricated measured value. Only actual formatted
// snapshots appear; assistive technology always receives the current final result.
export function AnimatedMetric({ value, format }: { value: number | null; format: (value: number | null) => string }) {
  const reduced = useReducedMotion()
  const text = format(value)
  return <span className="xensi-metric-transition" role="img" aria-label={text} data-metric={text}>
    <AnimatePresence initial={false}>
      <motion.span key={text} aria-hidden="true" className="xensi-metric-value" initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: reduced ? xensiMotion.durations.instant : xensiMotion.durations.interaction, ease: xensiMotion.easings.easeOut }}>{text}</motion.span>
    </AnimatePresence>
  </span>
}
