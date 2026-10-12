// Local adaptation of React Bits SpotlightCard. MIT + Commons Clause.
// Original: David Haz (2026). Full terms in third-party/ReactBits-LICENSE.md.
import { motion, type HTMLMotionProps } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { useSpotlight } from './useSpotlight'

export function SpotlightCard({ children, className = '', delegated = false, ...props }: Omit<HTMLMotionProps<'article'>, 'children'> & { children?: ReactNode; delegated?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useSpotlight(ref, !delegated)
  return <motion.article {...props} ref={ref} className={`xensi-surface xensi-spotlight-card ${className}`}>
    <span className={`xensi-surface-light${delegated ? ' xensi-edge-light' : ''}`} aria-hidden="true" />{children}
  </motion.article>
}
