import { xensiMotion } from './design/motion'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { artForView, authArt, preloadImage, warmPageArt } from './design/pageArt'
import { readRouteStateFromLocation } from './routes'
import { I18nProvider } from './i18n'
import './design/typography.css'
import './styles.css'
import './design/motion.css'
import './design/universal.css'
import './design/broadcast.css'
import './design/broadcast-pages.css'
import './design/navbar.css'
import './design/shell.css'
import './design/tailwind.css'

for (const [name, seconds] of Object.entries(xensiMotion.durations)) document.documentElement.style.setProperty(`--motion-${name}`, `${seconds}s`)
for (const [name, easing] of Object.entries(xensiMotion.easings)) document.documentElement.style.setProperty(`--motion-${name}`, `cubic-bezier(${easing.join(',')})`)

// Start the route's background art now, in parallel with the first render, instead of after it.
const initialRoute = readRouteStateFromLocation()
const initialArt = initialRoute.authRoute ? authArt : artForView(initialRoute.view)
if (initialArt) preloadImage(initialArt)
warmPageArt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user"><I18nProvider><App /></I18nProvider></MotionConfig>
  </StrictMode>,
)
