import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const distDir = join(process.cwd(), 'dist')
const indexFile = join(distDir, 'index.html')
const spaRoutes = [
  'login',
  'register',
  'forgot-password',
  'train',
  'train/target-switch',
  'train/tracking',
  'train/target-shooting',
  'train/reaction',
  'train/gridshot',
  'train/strafetrack',
  'train/micro-flick',
  'train/sniper',
  'train/routines',
  'calibrate',
  'convert',
  'analysis',
  'analysis/history',
  'methodology',
  'diagnostics',
  'diagnostics/polling-rate',
  'diagnostics/input',
  'diagnostics/refresh-rate',
  'diagnostics/controller-drift',
  'profile',
  'sobre',
  'privacidade',
  'termos',
  'contato',
  'about',
  'privacy',
  'terms',
  'contact',
  'diagnostico',
  'polling-rate',
  'input-diagnostics',
  'refresh-rate',
  'drift-controle',
  'warmup',
  'routine',
  'calibration',
  'converter',
]

if (!existsSync(indexFile)) {
  throw new Error('dist/index.html was not found. Run this script after vite build.')
}

for (const route of spaRoutes) {
  const routeDir = join(distDir, route)
  mkdirSync(routeDir, { recursive: true })
  copyFileSync(indexFile, join(routeDir, 'index.html'))
}
