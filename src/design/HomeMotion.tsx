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

export { TechnicalTitle } from './PrecisionTitle'
