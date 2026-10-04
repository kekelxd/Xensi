import type { AuthMode } from './authService'
import type { WarmupExercise } from './warmupConfig'

export const APP_BASE_PATH = '/'

export type AppView =
  | 'home'
  | 'analysis'
  | 'profile'
  | 'routine'
  | 'warmup'
  | 'calibration'
  | 'converter'
  | 'diagnostics'
  | 'polling'
  | 'buttons'
  | 'refresh-rate'
  | 'controller-drift'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'contact'

export type AnalysisSection = 'overview' | 'calibration-history' | 'methodology'

export type AppRouteState = {
  authRoute: AuthMode | null
  view: AppView
  analysisSection: AnalysisSection
  warmupEntry: WarmupExercise | null
  canonicalPath: string
  shouldReplace: boolean
}

const AUTH_ROUTE_PATHS: Record<string, AuthMode> = {
  login: 'login',
  register: 'register',
  'forgot-password': 'forgot-password',
  'reset-password': 'reset-password',
  'auth/callback': 'auth-callback',
}

export const WARMUP_EXERCISE_ROUTES: Record<WarmupExercise, string> = {
  switch: 'target-switch',
  tracking: 'tracking',
  flick: 'target-shooting',
  reflex: 'reaction',
  gridshot: 'gridshot',
  strafetrack: 'strafetrack',
  'sniper-reaction': 'sniper',
  micro_flick: 'micro-flick',
}

const WARMUP_EXERCISE_BY_ROUTE = new Map(
  Object.entries(WARMUP_EXERCISE_ROUTES).map(([exercise, route]) => [route, exercise as WarmupExercise]),
)

const VIEW_PATHS: Partial<Record<AppView, string>> = {
  home: '',
  warmup: 'train',
  routine: 'train/routines',
  calibration: 'calibrate',
  converter: 'convert',
  analysis: 'analysis',
  profile: 'profile',
  diagnostics: 'diagnostics',
  polling: 'diagnostics/polling-rate',
  buttons: 'diagnostics/input',
  'refresh-rate': 'diagnostics/refresh-rate',
  'controller-drift': 'diagnostics/controller-drift',
  about: 'sobre',
  privacy: 'privacidade',
  terms: 'termos',
  contact: 'contato',
}

const LEGACY_REDIRECTS: Record<string, string> = {
  diagnostico: 'diagnostics',
  'polling-rate': 'diagnostics/polling-rate',
  polling: 'diagnostics/polling-rate',
  'input-diagnostics': 'diagnostics/input',
  buttons: 'diagnostics/input',
  'refresh-rate': 'diagnostics/refresh-rate',
  'drift-controle': 'diagnostics/controller-drift',
  'controller-drift': 'diagnostics/controller-drift',
  warmup: 'train',
  routine: 'train/routines',
  calibration: 'calibrate',
  converter: 'convert',
  about: 'sobre',
  privacy: 'privacidade',
  terms: 'termos',
  contact: 'contato',
}

const trimRoute = (route: string) => route.replace(/^\/+/, '').replace(/\/+$/, '')

export function withBasePath(route = '') {
  const cleanRoute = trimRoute(route)
  return cleanRoute ? `${APP_BASE_PATH}${cleanRoute}` : APP_BASE_PATH
}

export function getRouteSegmentFromLocation(location: Pick<Location, 'pathname'> = window.location) {
  const pathname = location.pathname
  const relative = pathname.startsWith(APP_BASE_PATH)
    ? pathname.slice(APP_BASE_PATH.length)
    : pathname.replace(/^\/+/, '')
  return trimRoute(relative)
}

export function authRoutePath(route: AuthMode) {
  if (route === 'auth-callback') return withBasePath('auth/callback')
  return withBasePath(route)
}

export function viewRoutePath(view: AppView, options: { warmupEntry?: WarmupExercise | null; analysisSection?: AnalysisSection } = {}) {
  if (view === 'warmup' && options.warmupEntry) return withBasePath(`train/${WARMUP_EXERCISE_ROUTES[options.warmupEntry]}`)
  if (view === 'analysis' && options.analysisSection === 'calibration-history') return withBasePath('analysis/history')
  if (view === 'analysis' && options.analysisSection === 'methodology') return withBasePath('methodology')
  return withBasePath(VIEW_PATHS[view] ?? '')
}

export function routeStateFromPath(route: string): Omit<AppRouteState, 'canonicalPath' | 'shouldReplace'> {
  const cleanRoute = trimRoute(route)
  if (!cleanRoute) return { authRoute: null, view: 'home', analysisSection: 'overview', warmupEntry: null }
  if (AUTH_ROUTE_PATHS[cleanRoute]) {
    return { authRoute: AUTH_ROUTE_PATHS[cleanRoute], view: 'home', analysisSection: 'overview', warmupEntry: null }
  }

  if (cleanRoute === 'train') return { authRoute: null, view: 'warmup', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'train/routines') return { authRoute: null, view: 'routine', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute.startsWith('train/')) {
    const exercise = WARMUP_EXERCISE_BY_ROUTE.get(cleanRoute.slice('train/'.length))
    if (exercise) return { authRoute: null, view: 'warmup', analysisSection: 'overview', warmupEntry: exercise }
  }

  if (cleanRoute === 'calibrate') return { authRoute: null, view: 'calibration', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'convert') return { authRoute: null, view: 'converter', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'analysis') return { authRoute: null, view: 'analysis', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'analysis/history') return { authRoute: null, view: 'analysis', analysisSection: 'calibration-history', warmupEntry: null }
  if (cleanRoute === 'methodology') return { authRoute: null, view: 'analysis', analysisSection: 'methodology', warmupEntry: null }
  if (cleanRoute === 'profile') return { authRoute: null, view: 'profile', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'sobre' || cleanRoute === 'about') return { authRoute: null, view: 'about', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'privacidade' || cleanRoute === 'privacy') return { authRoute: null, view: 'privacy', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'termos' || cleanRoute === 'terms') return { authRoute: null, view: 'terms', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'contato' || cleanRoute === 'contact') return { authRoute: null, view: 'contact', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'diagnostics') return { authRoute: null, view: 'diagnostics', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'diagnostics/polling-rate') return { authRoute: null, view: 'polling', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'diagnostics/input') return { authRoute: null, view: 'buttons', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'diagnostics/refresh-rate') return { authRoute: null, view: 'refresh-rate', analysisSection: 'overview', warmupEntry: null }
  if (cleanRoute === 'diagnostics/controller-drift') return { authRoute: null, view: 'controller-drift', analysisSection: 'overview', warmupEntry: null }

  return { authRoute: null, view: 'home', analysisSection: 'overview', warmupEntry: null }
}

function canonicalPathForState(state: Omit<AppRouteState, 'canonicalPath' | 'shouldReplace'>) {
  if (state.authRoute) return authRoutePath(state.authRoute)
  return viewRoutePath(state.view, { analysisSection: state.analysisSection, warmupEntry: state.warmupEntry })
}

export function readRouteStateFromLocation(location: Location = window.location): AppRouteState {
  const redirectedRoute = trimRoute(new URLSearchParams(location.search).get('xensi-route') ?? '')
  const rawRoute = redirectedRoute || getRouteSegmentFromLocation(location)
  const canonicalRoute = LEGACY_REDIRECTS[rawRoute] ?? rawRoute
  const state = routeStateFromPath(canonicalRoute)
  const canonicalPath = canonicalPathForState(state)
  return {
    ...state,
    canonicalPath,
    shouldReplace: Boolean(redirectedRoute) || canonicalRoute !== rawRoute || location.pathname !== canonicalPath,
  }
}
