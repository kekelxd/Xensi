import { motion, useReducedMotion } from 'motion/react'
import { xensiMotion } from './motion'

export function TechnicalTitle({ children, index = 0 }: { children: string; index?: number }) {
  const reduced = useReducedMotion()
  return <motion.span className="xensi-technical-mask" initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', y: 28, opacity: 0 }} animate={{ clipPath: 'inset(0 0 -10% 0)', y: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut, delay: reduced ? 0 : xensiMotion.hero.title + index * xensiMotion.hero.lineGap }}>{children}</motion.span>
}
