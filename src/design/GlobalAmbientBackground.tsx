import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { useEffect } from 'react'
import { ambientThemes, type Atmosphere } from './ambientThemes'
import { AnimatedGridPattern } from './AnimatedGridPattern'
import { xensiMotion } from './motion'

export function GlobalAmbientBackground({ atmosphere, paused }: { atmosphere: Atmosphere; paused: boolean }) {
  const reduced = useReducedMotion()
  const pointerX = useMotionValue(0), pointerY = useMotionValue(0)
  const x = useSpring(pointerX, { stiffness: 40, damping: 22 }), y = useSpring(pointerY, { stiffness: 40, damping: 22 })
  useEffect(() => {
    if (paused || reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) {
      x.jump(0); y.jump(0)
      return
    }
    let frame = 0, last = 0, px = 0, py = 0
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      px = (event.clientX / innerWidth - .5) * 64
      py = (event.clientY / innerHeight - .5) * 40
      if (!frame) frame = requestAnimationFrame(now => { frame = 0; if (now - last < 32) return; last = now; pointerX.set(px); pointerY.set(py) })
    }
    const leave = () => { pointerX.set(0); pointerY.set(0) }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); pointerX.jump(0); pointerY.jump(0); x.jump(0); y.jump(0) }
  }, [paused, reduced, pointerX, pointerY, x, y])
  const theme = ambientThemes[atmosphere]
  return <div className="xensi-global-ambient" aria-hidden="true" data-paused={paused || reduced ? 'true' : 'false'} data-drift-paused={paused || reduced || atmosphere === 'train' ? 'true' : 'false'}>
    <div className="xensi-ambient-base" />
    <AnimatedGridPattern />
    <motion.div className="xensi-ambient-position" initial={false} animate={{ x: `${theme.x}vw`, y: `${theme.y}vh`, opacity: paused ? 0 : theme.opacity }} transition={{ duration: reduced || paused ? 0 : xensiMotion.durations.cinematic, ease: xensiMotion.easings.easeInOut }}>
      <motion.div className="xensi-ambient-pointer" style={{ x, y }}><div className="xensi-ambient-light" /></motion.div>
    </motion.div>
    <div className="xensi-ambient-vignette" />
  </div>
}
