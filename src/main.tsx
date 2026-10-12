import { xensiMotion } from './design/motion'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user"><I18nProvider><App /></I18nProvider></MotionConfig>
  </StrictMode>,
)
