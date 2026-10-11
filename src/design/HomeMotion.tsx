import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { xensiMotion } from './motion'
import './premium-motion.css'

export function HomeReveal({ delay = 0, ...props }: HTMLMotionProps<'section'> & { delay?: number }) {
  const reduced = useReducedMotion()
  return <motion.section {...props} initial={reduced ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.12 }} variants={{ hidden: { opacity: 0, y: reduced ? 0 : 32 }, visible: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut, delay: reduced ? 0 : delay, staggerChildren: reduced ? 0 : xensiMotion.hero.actionGap } } }} />
}

export function HomeRevealItem(props: HTMLMotionProps<'article'>) {
  const reduced = useReducedMotion()
  return <motion.article {...props} variants={{ hidden: { opacity: 0, y: reduced ? 0 : 12 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: reduced ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut }} />
}

export function TechnicalTitle({ children, index = 0 }: { children: string; index?: number }) {
  const reduced = useReducedMotion()
  return <motion.span className="xensi-technical-mask" initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)', y: 28, opacity: 0 }} animate={{ clipPath: 'inset(0 0 -10% 0)', y: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut, delay: reduced ? 0 : xensiMotion.hero.title + index * xensiMotion.hero.lineGap }}>{children}</motion.span>
}
