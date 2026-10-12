import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowRight, Crosshair, Play, RotateCcw } from 'lucide-react'
import { xensiMotion } from '../design/motion'
import type { HomeCopy } from './homeCopy'

const TOTAL = 5
type Phase = 'idle' | 'waiting' | 'live' | 'done'
type Point = { x: number; y: number }

function randomPoint(previous: Point | null): Point {
  // Keep targets away from the arena edges and from the previous spot so every hit needs a real flick.
  for (let attempt = 0; attempt < 12; attempt++) {
    const next = { x: 12 + Math.random() * 76, y: 16 + Math.random() * 64 }
    if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) > 22) return next
  }
  return { x: 50, y: 50 }
}

const format = (value: number | null) => value === null ? '—' : `${Math.round(value)} ms`

// Lightweight DOM demo: no engine, no Pointer Lock, no global listeners. Reaction time is
// measured from the frame in which the target is painted to the pointerdown on it.
export function HomeAimDemo({ copy, onTrain }: { copy: HomeCopy; onTrain: () => void }) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('idle')
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState<Point | null>(null)
  const [times, setTimes] = useState<number[]>([])
  const [misses, setMisses] = useState(0)
  const [hit, setHit] = useState<Point | null>(null)
  const shownAt = useRef(0)
  const timer = useRef(0)

  const clear = () => { window.clearTimeout(timer.current); timer.current = 0 }
  useEffect(() => clear, [])

  const schedule = useCallback((nextIndex: number, previous: Point | null) => {
    setPhase('waiting'); setTarget(null); setIndex(nextIndex)
    clear()
    // Random delay prevents anticipating the next target.
    timer.current = window.setTimeout(() => { setTarget(randomPoint(previous)); setPhase('live') }, 450 + Math.random() * 650)
  }, [])

  useLayoutEffect(() => {
    if (phase !== 'live') return
    const frame = requestAnimationFrame(now => { shownAt.current = now })
    return () => cancelAnimationFrame(frame)
  }, [phase, target])

  // Pause if the tab is hidden mid-test so the measurement is never polluted.
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'live') return
    const onHide = () => { if (document.hidden) { clear(); setPhase('idle'); setTarget(null) } }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [phase])

  const start = () => { setTimes([]); setMisses(0); setHit(null); schedule(0, null) }

  const hitTarget = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (phase !== 'live' || !target || !shownAt.current) return
    const elapsed = Math.max(0, event.timeStamp - shownAt.current)
    shownAt.current = 0
    const next = [...times, elapsed]
    setTimes(next); setHit(target)
    if (next.length >= TOTAL) { clear(); setTarget(null); setPhase('done') } else schedule(next.length, target)
  }

  const miss = () => { if (phase === 'live' || phase === 'waiting') setMisses(value => value + 1) }

  const average = times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : null
  const best = times.length ? Math.min(...times) : null
  const running = phase === 'waiting' || phase === 'live'

  return <div className="xl-demo" data-phase={phase} data-testid="home-reaction-demo">
    <header className="xl-demo-bar">
      <span>{copy.demoChallenge}</span>
      <b aria-live="polite">{running ? copy.demoRunning.replace('{current}', String(Math.min(index + 1, TOTAL))).replace('{total}', String(TOTAL)) : copy.demoTargets}</b>
    </header>
    <div className="xl-demo-body">
      <p className="xl-demo-title"><Crosshair size={18} />{copy.demoLabel}</p>
      <div className="xl-demo-progress" aria-hidden="true">{Array.from({ length: TOTAL }, (_, item) => <i key={item} data-state={item < times.length ? 'hit' : item === index && running ? 'active' : 'idle'} />)}</div>
      <div className="xl-demo-arena" onPointerDown={running ? miss : undefined}>
        <span className="xl-demo-reticle" aria-hidden="true" />
        {phase === 'live' && target && <motion.button
          key={`${index}-${target.x}`}
          type="button"
          className="xl-demo-target"
          style={{ left: `${target.x}%`, top: `${target.y}%` }}
          initial={reduced ? false : { scale: .55, opacity: .75 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduced ? 0 : .09 }}
          onPointerDown={hitTarget}
          aria-label={`${copy.demoTarget} ${index + 1}`}
        ><span /></motion.button>}
        {hit && running && <span key={`${hit.x}-${times.length}`} className="xl-demo-hitmarker" style={{ left: `${hit.x}%`, top: `${hit.y}%` }} aria-hidden="true" />}
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'idle' && <motion.div key="idle" className="xl-demo-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: xensiMotion.durations.interaction }}>
            <p>{copy.demoIdle}</p>
            <button type="button" className="xl-btn xl-btn-outline-coral" onClick={start}>{copy.demoGo}<Play size={15} /></button>
          </motion.div>}
          {phase === 'done' && <motion.div key="done" className="xl-demo-panel is-result" initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: xensiMotion.durations.interaction }}>
            <button type="button" className="xl-btn xl-btn-primary" onClick={onTrain}>{copy.demoTrain}<ArrowRight size={16} /></button>
            <button type="button" className="xl-btn xl-btn-ghost" onClick={start}><RotateCcw size={15} />{copy.demoAgain}</button>
          </motion.div>}
        </AnimatePresence>
      </div>
      <dl className="xl-demo-stats" data-done={phase === 'done'}>
        <div><dt>{copy.demoAverage}</dt><dd>{format(phase === 'done' ? average : null)}</dd></div>
        <div><dt>{copy.demoBest}</dt><dd>{format(phase === 'done' ? best : null)}</dd></div>
        <div><dt>{copy.demoMisses}</dt><dd>{misses}</dd></div>
      </dl>
      <p className="xl-demo-note">{copy.demoNote}</p>
    </div>
  </div>
}
