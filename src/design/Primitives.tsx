import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'
import { xensiMotion } from './motion'

export function XensiPageHeader({ title, description, actions, className = '', kicker }: { title: string; description?: string; actions?: ReactNode; className?: string; kicker?: string }) {
  const reduced = useReducedMotion()
  return <header className={`xensi-page-header ${className}`}>
    <div>{kicker && <span className="xensi-page-kicker">{kicker}</span>}<motion.h1 initial={reduced ? false : { opacity: .4, y: 14, clipPath: 'inset(0 0 100% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 -12% 0)' }} transition={{ duration: reduced ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut }}>{title}</motion.h1>{description && <p>{description}</p>}</div>{actions}
  </header>
}

export function XensiSection(props: HTMLMotionProps<'section'>) {
  const reduced = useReducedMotion()
  return <motion.section {...props} className={`xensi-section ${props.className ?? ''}`} initial={reduced ? false : { opacity: .3, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .08 }} transition={{ duration: reduced ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut }} />
}
