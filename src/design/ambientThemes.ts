import type { AppView } from '../routes'

export type Atmosphere = 'home' | 'train' | 'calibrate' | 'convert' | 'diagnostics' | 'analysis' | 'profile' | 'information'
export const atmosphereFor = (view: AppView): Atmosphere => view === 'warmup' || view === 'routine' ? 'train' : view === 'calibration' ? 'calibrate' : view === 'converter' ? 'convert' : view === 'profile' || view === 'analysis' || view === 'home' ? view : view === 'diagnostics' || view === 'polling' || view === 'buttons' || view === 'refresh-rate' || view === 'controller-drift' ? 'diagnostics' : 'information'
export const ambientThemes: Record<Atmosphere, { x: number; y: number; opacity: number }> = {
  home: { x: 60, y: -18, opacity: .55 }, train: { x: 12, y: -20, opacity: .75 },
  calibrate: { x: 56, y: -14, opacity: .8 }, convert: { x: 38, y: -25, opacity: .62 },
  diagnostics: { x: 70, y: -16, opacity: .65 }, analysis: { x: 45, y: -20, opacity: .65 },
  profile: { x: 3, y: -8, opacity: .8 }, information: { x: 68, y: -20, opacity: .45 },
}
