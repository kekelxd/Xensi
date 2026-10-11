// Local adaptation of React Bits SpotlightCard. MIT + Commons Clause.
// Original: David Haz (2026). Full terms in third-party/ReactBits-LICENSE.md.
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'

export function SpotlightCard({ children, className = '', delegated = false, ...props }: Omit<HTMLMotionProps<'article'>, 'children'> & { children?: ReactNode; delegated?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const root = ref.current
    if (!root || delegated || reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let frame = 0, bounds: DOMRect | null = null, last = 0
    let tx = 0, ty = 0, sx = 0, sy = 0
    const tick = (now: number) => {
      frame = 0
      if (document.hidden || document.pointerLockElement) return
      const dt = Math.min(.05, Math.max(.001, (now - last) / 1000)); last = now
      const follow = 1 - Math.exp(-dt / .08)
      sx += (tx - sx) * follow; sy += (ty - sy) * follow
      root.style.setProperty('--spotlight-x', `${sx.toFixed(1)}px`)
      root.style.setProperty('--spotlight-y', `${sy.toFixed(1)}px`)
      if (Math.abs(tx-sx) > .5 || Math.abs(ty-sy) > .5) frame = requestAnimationFrame(tick)
    }
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || document.hidden || document.pointerLockElement) return
      bounds = root.getBoundingClientRect(); sx = tx = event.clientX-bounds.left; sy = ty = event.clientY-bounds.top
      root.dataset.spotlightActive = 'true'
      last = performance.now(); if (!frame) frame = requestAnimationFrame(tick)
    }
    const move = (event: PointerEvent) => { if (event.pointerType !== 'mouse' || document.hidden || document.pointerLockElement) return; bounds ??= root.getBoundingClientRect(); root.dataset.spotlightActive = 'true'; tx = event.clientX-bounds.left; ty = event.clientY-bounds.top; if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick) } }
    const leave = () => { root.dataset.spotlightActive = 'false'; bounds = null; cancelAnimationFrame(frame); frame = 0 }
    const invalidate = () => { bounds = null; cancelAnimationFrame(frame); frame = 0 }
    root.addEventListener('pointerenter', enter); root.addEventListener('pointermove', move, { passive: true }); root.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', leave); document.addEventListener('pointerlockchange', leave); window.addEventListener('scroll', invalidate, true); window.addEventListener('resize', invalidate)
    return () => { leave(); root.removeEventListener('pointerenter', enter); root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', leave); document.removeEventListener('visibilitychange', leave); document.removeEventListener('pointerlockchange', leave); window.removeEventListener('scroll', invalidate, true); window.removeEventListener('resize', invalidate) }
  }, [reduced, delegated])
  return <motion.article {...props} ref={ref} className={`xensi-surface xensi-spotlight-card ${className}`}>
    <span className={`xensi-surface-light${delegated ? ' xensi-edge-light' : ''}`} aria-hidden="true" />{children}
  </motion.article>
}
