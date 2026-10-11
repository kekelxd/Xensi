import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'

// One delegated listener for the Home, one pending frame, no React updates per move.
// Bounds are measured on entry/scroll/resize, not interleaved with every style write.
export function useHomeLighting(ref: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion()
  const frame = useRef(0)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const hero = root.querySelector<HTMLElement>('[data-home-hero]')
    const observer = new IntersectionObserver(([entry]) => {
      root.dataset.ambientPaused = String(!entry.isIntersecting || document.hidden)
    }, { threshold: 0 })
    if (hero) observer.observe(hero)
    let surface: HTMLElement | null = null, bounds: DOMRect | null = null
    let x = 0, y = 0, last = 0, dirty = false
    const reset = () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = 0
      if (surface) {
        surface.dataset.lightActive = 'false'
        surface.style.setProperty('--light-dx', '0px')
        surface.style.setProperty('--light-dy', '0px')
      }
      surface = null; bounds = null
    }
    const paint = (now: number) => {
      frame.current = 0
      if (!surface || document.hidden || reduced || !pointer.matches) return
      if (now - last < 32) { frame.current = requestAnimationFrame(paint); return }
      last = now
      if (dirty) { bounds = surface.getBoundingClientRect(); dirty = false }
      if (!bounds?.width || !bounds.height) return
      const px = Math.max(0, Math.min(1, (x - bounds.left) / bounds.width))
      const py = Math.max(0, Math.min(1, (y - bounds.top) / bounds.height))
      surface.style.setProperty('--pointer-x', `${px * 100}%`)
      surface.style.setProperty('--pointer-y', `${py * 100}%`)
      surface.style.setProperty('--light-dx', `${(px - .5) * 80}px`)
      surface.style.setProperty('--light-dy', `${(py - .5) * 50}px`)
      surface.dataset.lightActive = 'true'
    }
    const move = (event: PointerEvent) => {
      if (reduced || !pointer.matches || event.pointerType === 'touch' || document.hidden) return
      const next = (event.target as Element).closest<HTMLElement>('[data-light-surface]')
      if (!next || !root.contains(next)) { reset(); return }
      if (next !== surface) { reset(); surface = next; bounds = next.getBoundingClientRect() }
      x = event.clientX; y = event.clientY
      if (!frame.current) frame.current = requestAnimationFrame(paint)
    }
    const invalidate = () => { dirty = true }
    const visibility = () => {
      if (document.hidden) reset()
      root.dataset.ambientPaused = String(document.hidden || !hero || hero.getBoundingClientRect().bottom <= 0)
    }
    root.addEventListener('pointermove', move, { passive: true })
    root.addEventListener('pointerleave', reset)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('scroll', invalidate, { passive: true, capture: true })
    window.addEventListener('resize', invalidate, { passive: true })
    pointer.addEventListener('change', reset)
    return () => {
      reset(); observer.disconnect()
      root.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', reset)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('scroll', invalidate, true); window.removeEventListener('resize', invalidate)
      pointer.removeEventListener('change', reset)
    }
  }, [ref, reduced])
}
