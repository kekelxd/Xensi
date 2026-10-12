import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import type { AppView } from '../routes'
import { SiteFooter } from '../SiteFooter'
import { AlphaFeedbackModal } from '../AlphaFeedbackModal'
import { atmosphereFor } from './ambientThemes'
import { GlobalAmbientBackground } from './GlobalAmbientBackground'
import { PageAtmosphere } from './PageAtmosphere'
import { useRouteReveal } from './useRouteReveal'
import { artForView, preloadImage } from './pageArt'

const measurementRoutes = new Set<AppView>(['polling', 'buttons', 'refresh-rate', 'controller-drift'])
export function XensiAppShell({ view, className, children, onNavigate }: { view: AppView; className: string; children: ReactNode; onNavigate: (view: AppView) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(() => document.hidden)
  const [immersive, setImmersive] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const reduced = useReducedMotion()
  useRouteReveal(ref, view)
  const [artReady, setArtReady] = useState<string | null>(null)
  const art = artForView(view)
  useEffect(() => {
    if (!art) return
    let alive = true
    preloadImage(art)
    const image = new Image()
    image.src = art
    image.decode().catch(() => undefined).then(() => { if (alive) setArtReady(art) })
    return () => { alive = false }
  }, [art])
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const update = () => { setHidden(document.hidden); setImmersive(Boolean(document.pointerLockElement || root.querySelector('.warmup-game-workspace, .finder-run-workspace, .spatial-hunt'))) }
    // Observe route root replacement/class only, never realtime metric text updates.
    const attributes = new MutationObserver(update)
    const bindRoots = () => { attributes.disconnect(); root.querySelector('.xensi-route-content')?.childNodes.forEach(node => { if (node instanceof HTMLElement) attributes.observe(node, { attributes: true, attributeFilter: ['class'] }) }); update() }
    const routes = new MutationObserver(bindRoots)
    const content = root.querySelector('.xensi-route-content')
    if (content) routes.observe(content, { childList: true })
    bindRoots()
    document.addEventListener('visibilitychange', update); document.addEventListener('pointerlockchange', update)
    return () => { routes.disconnect(); attributes.disconnect(); document.removeEventListener('visibilitychange', update); document.removeEventListener('pointerlockchange', update) }
  }, [view])
  const paused = hidden || immersive || measurementRoutes.has(view)
  const atmosphere = atmosphereFor(view)
  return <div ref={ref} className={`${className} xensi-universal-shell`} data-atmosphere={atmosphere} data-view={view} data-immersive={immersive} data-ui-paused={paused || reduced ? 'true' : 'false'} data-art-ready={art !== null && artReady === art}>
    <GlobalAmbientBackground atmosphere={atmosphere} paused={paused} />
    <PageAtmosphere atmosphere={atmosphere} paused={paused} />
    {children}
    {!immersive && <SiteFooter onFeedback={() => setFeedbackOpen(true)} onNavigate={onNavigate} />}
    <AlphaFeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
  </div>
}
