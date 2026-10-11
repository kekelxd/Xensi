import { xensiMotion } from './design/motion'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n'
import './styles.css'
import './design/motion.css'

for (const [name, seconds] of Object.entries(xensiMotion.durations)) document.documentElement.style.setProperty(`--motion-${name}`, `${seconds}s`)
for (const [name, easing] of Object.entries(xensiMotion.easings)) document.documentElement.style.setProperty(`--motion-${name}`, `cubic-bezier(${easing.join(',')})`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user"><I18nProvider><App /></I18nProvider></MotionConfig>
  </StrictMode>,
)
