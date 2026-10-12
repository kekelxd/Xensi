import heroArt from '../assets/xensi-hero-art.webp'
import profileArt from '../assets/xensi-profile-art.webp'
import squadArt from '../assets/xensi-squad-art.webp'
import authArt from '../assets/xensi-auth-art.webp'
import type { AppView } from '../routes'

// The art behind each page lives in shell.css (::before). CSS backgrounds are only fetched once the
// shell renders, after the cards, so the art used to pop in last. These are the same files (Vite gives
// the CSS url() and the import the same hashed URL), fetched as early as the route is known.
const NO_ART = new Set<AppView>(['home', 'diagnostics', 'polling', 'buttons', 'refresh-rate', 'controller-drift'])
export { authArt }

export function artForView(view: AppView) {
  if (NO_ART.has(view)) return null
  return view === 'profile' ? profileArt : view === 'squad' ? squadArt : heroArt
}

const requested = new Set<string>()
export function preloadImage(href: string, priority: 'high' | 'low' = 'high') {
  if (requested.has(href)) return
  requested.add(href)
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = href
  link.setAttribute('fetchpriority', priority)
  document.head.appendChild(link)
}

// After the first route settles, warm the other arts at low priority so navigation does not wait for them.
export function warmPageArt() {
  const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1200))
  idle(() => [heroArt, profileArt, squadArt, authArt].forEach(href => preloadImage(href, 'low')))
}
