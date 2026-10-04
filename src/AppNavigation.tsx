import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BarChart3, ChevronDown, Crosshair, Gamepad2, Gauge, Info, Languages, MonitorUp, Mouse, Settings2, SlidersHorizontal, UserRound } from 'lucide-react'
import { initializeAuth, readAuthSessionState, signOut, type AuthSessionState } from './authService'
import type { Locale } from './i18n'
import type { WarmupExercise } from './warmupConfig'
import { AvatarArtwork } from './AvatarArtwork'
import { DEFAULT_AVATAR, isAvatarId } from './avatars'
import { isDiagnosticView } from './navigationState'
import type { AnalysisSection, AppView } from './routes'

export type NavigationView = AppView
export type { AnalysisSection }

type Props = {
  view: NavigationView
  analysisSection: AnalysisSection
  locale: Locale
  disabled: boolean
  onLocaleChange: (locale: Locale) => void
  onNavigate: (view: NavigationView) => void
  onLogin: () => void
  onExercise: (exercise: WarmupExercise) => void
  onAnalysisSection: (section: AnalysisSection) => void
}

const labels = {
  pt: { home: 'INÍCIO', train: 'TREINAR', calibrate: 'CALIBRAR', convert: 'CONVERTER', diagnostic: 'DIAGNÓSTICO', analysis: 'ANÁLISE', minigames: 'Minigames', minigamesDescription: 'Exercícios individuais', routinesDescription: 'Sequências de treino', routines: 'Rotinas', calibration: 'Calibrar sensibilidade', calibrationDescription: 'Encontre uma região de sensibilidade para testar.', history: 'Histórico', historyDescription: 'Consulte calibrações anteriores.', method: 'Como funciona', methodDescription: 'Entenda o método de calibração.', polling: 'Teste de Polling Rate', pollingDescription: 'Meça a frequência observada do mouse.', input: 'Diagnóstico de Entrada', inputDescription: 'Analise estabilidade e comportamento do input.', refresh: 'Refresh Rate', refreshDescription: 'Meça a frequência de atualização observada no navegador.', drift: 'Drift do Controle', driftDescription: 'Analise o desvio dos analógicos em repouso.', profile: 'Meu perfil', settings: 'Configurações', logout: 'Sair', unavailable: 'Disponível quando o login for ativado' },
  en: { home: 'HOME', train: 'TRAIN', calibrate: 'CALIBRATE', convert: 'CONVERT', diagnostic: 'DIAGNOSTICS', analysis: 'ANALYSIS', minigames: 'Minigames', minigamesDescription: 'Individual exercises', routinesDescription: 'Training sequences', routines: 'Routines', calibration: 'Calibrate sensitivity', calibrationDescription: 'Find a sensitivity range to test.', history: 'History', historyDescription: 'Review previous calibrations.', method: 'How it works', methodDescription: 'Understand the calibration method.', polling: 'Polling Rate Test', pollingDescription: 'Measure the mouse rate observed by the browser.', input: 'Input Diagnostics', inputDescription: 'Analyze input stability and behavior.', refresh: 'Refresh Rate', refreshDescription: 'Estimate the refresh rate observed by the browser.', drift: 'Controller Drift', driftDescription: 'Measure resting analog stick offset.', profile: 'My profile', settings: 'Settings', logout: 'Sign out', unavailable: 'Available when sign-in is enabled' },
  es: { home: 'INICIO', train: 'ENTRENAR', calibrate: 'CALIBRAR', convert: 'CONVERTIR', diagnostic: 'DIAGNÓSTICO', analysis: 'ANÁLISIS', minigames: 'Minijuegos', minigamesDescription: 'Ejercicios individuales', routinesDescription: 'Secuencias de entrenamiento', routines: 'Rutinas', calibration: 'Calibrar sensibilidad', calibrationDescription: 'Encuentra una región de sensibilidad para probar.', history: 'Historial', historyDescription: 'Consulta calibraciones anteriores.', method: 'Cómo funciona', methodDescription: 'Entiende el método de calibración.', polling: 'Prueba de Polling Rate', pollingDescription: 'Mide la frecuencia del ratón observada por el navegador.', input: 'Diagnóstico de Entrada', inputDescription: 'Analiza la estabilidad y el comportamiento de la entrada.', refresh: 'Refresh Rate', refreshDescription: 'Estima la actualización observada por el navegador.', drift: 'Drift del Control', driftDescription: 'Mide el desvío de los sticks en reposo.', profile: 'Mi perfil', settings: 'Configuración', logout: 'Salir', unavailable: 'Disponible cuando se active el acceso' },
} as const

type OpenMenu = 'train' | 'calibrate' | 'diagnostic' | 'profile' | null
type MenuName = Exclude<OpenMenu, null>

type XensiLogoProps = {
  as?: 'span' | 'button'
  className?: string
  disabled?: boolean
  onClick?: () => void
}

export function XensiLogo({ as = 'span', className = '', disabled = false, onClick }: XensiLogoProps) {
  const content = <><span>X</span>ENSI</>
  const classes = `xensi-nav-brand ${className}`.trim()
  return as === 'button'
    ? <button type="button" className={classes} onClick={onClick} disabled={disabled} aria-label="XENSI home">{content}</button>
    : <span className={classes} aria-label="XENSI">{content}</span>
}

function readNavProfile() {
  try {
    const profile = JSON.parse(window.localStorage.getItem('xensi-player-profile') ?? '{}') as { nickname?: string; avatarId?: string }
    return { nickname: profile.nickname?.trim() || 'xensi_dev', avatarId: isAvatarId(profile.avatarId) ? profile.avatarId : DEFAULT_AVATAR }
  } catch {
    return { nickname: 'xensi_dev', avatarId: DEFAULT_AVATAR }
  }
}

export function AppNavigation({ view, analysisSection, locale, disabled, onLocaleChange, onNavigate, onLogin, onAnalysisSection }: Props) {
  const text = labels[locale]
  const shellRef = useRef<HTMLDivElement>(null)
  const menuTriggerRefs = useRef<Partial<Record<MenuName, HTMLButtonElement | null>>>({})
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [navProfile, setNavProfile] = useState(readNavProfile)
  const [authState, setAuthState] = useState<AuthSessionState>({ status: 'loading', userId: null, profile: null })

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    if (!openMenu) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const trigger = menuTriggerRefs.current[openMenu]
      setOpenMenu(null)
      window.requestAnimationFrame(() => trigger?.focus())
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [openMenu])

  useEffect(() => {
    const update = () => setNavProfile(readNavProfile())
    window.addEventListener('xensi-profile-updated', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('xensi-profile-updated', update)
      window.removeEventListener('storage', update)
    }
  }, [])

  useEffect(() => {
    let active = true
    void initializeAuth().then(() => {
      if (!active) return
      const state = readAuthSessionState()
      setAuthState(state)
      if (state.status === 'authenticated') setNavProfile(state.profile)
    })
    const update = () => {
      const state = readAuthSessionState()
      setAuthState(state)
      if (state.status === 'authenticated') setNavProfile(state.profile)
      else setNavProfile(readNavProfile())
    }
    window.addEventListener('storage', update)
    window.addEventListener('xensi-auth-updated', update)
    return () => {
      active = false
      window.removeEventListener('storage', update)
      window.removeEventListener('xensi-auth-updated', update)
    }
  }, [])

  const logout = async () => {
    setOpenMenu(null)
    await signOut()
    onNavigate('home')
  }

  const navigate = (next: NavigationView) => {
    setOpenMenu(null)
    onNavigate(next)
  }
  const selectAnalysis = (section: AnalysisSection) => {
    setOpenMenu(null)
    onAnalysisSection(section)
  }
  const revealMenuTrigger = (menu: MenuName) => {
    if (menu !== 'diagnostic') return
    window.requestAnimationFrame(() => {
      const trigger = menuTriggerRefs.current[menu]
      const navigation = trigger?.closest<HTMLElement>('.xensi-primary-nav')
      if (!trigger || !navigation || navigation.scrollWidth <= navigation.clientWidth) return
      const left = trigger.offsetLeft - (navigation.clientWidth - trigger.offsetWidth) / 2
      navigation.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    })
  }
  const toggle = (menu: MenuName) => {
    setOpenMenu((current) => current === menu ? null : menu)
    revealMenuTrigger(menu)
  }
  const openFromKeyboard = (menu: MenuName, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown') return
    event.preventDefault()
    setOpenMenu(menu)
    revealMenuTrigger(menu)
    window.requestAnimationFrame(() => shellRef.current?.querySelector<HTMLElement>(`[data-menu="${menu}"] [role="menuitem"]`)?.focus())
  }
  const navigateMenuWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length
    items[next]?.focus()
  }
  const diagnosticActive = isDiagnosticView(view)
  const profileMenuOpen = authState.status === 'authenticated' && openMenu === 'profile'

  return <div className="xensi-navigation" ref={shellRef}>
    <XensiLogo as="button" onClick={() => navigate('home')} disabled={disabled} />

    <nav className="xensi-primary-nav" aria-label="XENSI">
      <button type="button" className={view === 'home' ? 'active' : ''} onClick={() => navigate('home')} disabled={disabled}>{text.home}</button>
      <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.train = node }} type="button" className={view === 'warmup' || view === 'routine' ? 'active' : ''} onClick={() => toggle('train')} onKeyDown={(event) => openFromKeyboard('train', event)} disabled={disabled} aria-haspopup="menu" aria-expanded={openMenu === 'train'}>{text.train}<ChevronDown size={13} /></button>
        {openMenu === 'train' && <div className="xensi-nav-dropdown xensi-training-dropdown" data-menu="train" role="menu" aria-label={text.train} onKeyDown={navigateMenuWithKeyboard}>
          <button type="button" role="menuitem" onClick={() => navigate('warmup')}><Crosshair size={18} /><span><b>{text.minigames}</b><small>{text.minigamesDescription}</small></span></button>
          <button type="button" role="menuitem" onClick={() => navigate('routine')}><SlidersHorizontal size={18} /><span><b>{text.routines}</b><small>{text.routinesDescription}</small></span></button>
        </div>}
      </div>
      <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.calibrate = node }} type="button" className={view === 'calibration' ? 'active' : ''} onClick={() => toggle('calibrate')} onKeyDown={(event) => openFromKeyboard('calibrate', event)} disabled={disabled} aria-haspopup="menu" aria-expanded={openMenu === 'calibrate'}>{text.calibrate}<ChevronDown size={13} /></button>
        {openMenu === 'calibrate' && <div className="xensi-nav-dropdown xensi-calibrate-dropdown" data-menu="calibrate" role="menu" aria-label={text.calibrate} onKeyDown={navigateMenuWithKeyboard}>
          <span className="xensi-nav-dropdown-label">{text.calibrate}</span>
          <button type="button" role="menuitem" className="is-primary" onClick={() => navigate('calibration')}><Crosshair size={15} /><span><b>{text.calibration}</b><small>{text.calibrationDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'analysis' && analysisSection === 'calibration-history' ? 'active is-secondary' : 'is-secondary'} aria-current={view === 'analysis' && analysisSection === 'calibration-history' ? 'page' : undefined} onClick={() => selectAnalysis('calibration-history')}><BarChart3 size={15} /><span><b>{text.history}</b><small>{text.historyDescription}</small></span></button>
          <i className="xensi-nav-dropdown-divider" aria-hidden="true" />
          <button type="button" role="menuitem" className={view === 'analysis' && analysisSection === 'methodology' ? 'active is-documentation' : 'is-documentation'} aria-current={view === 'analysis' && analysisSection === 'methodology' ? 'page' : undefined} onClick={() => selectAnalysis('methodology')}><Info size={15} /><span><b>{text.method}</b><small>{text.methodDescription}</small></span></button>
        </div>}
      </div>
      <button type="button" className={view === 'converter' ? 'active' : ''} onClick={() => navigate('converter')} disabled={disabled}>{text.convert}</button>
      <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.diagnostic = node }} type="button" className={diagnosticActive ? 'active' : ''} onClick={() => toggle('diagnostic')} onKeyDown={(event) => openFromKeyboard('diagnostic', event)} disabled={disabled} aria-haspopup="menu" aria-expanded={openMenu === 'diagnostic'} aria-current={diagnosticActive ? 'page' : undefined}>{text.diagnostic}<ChevronDown size={13} /></button>
        {openMenu === 'diagnostic' && <div className="xensi-nav-dropdown xensi-diagnostic-dropdown" data-menu="diagnostic" role="menu" aria-label={text.diagnostic} onKeyDown={navigateMenuWithKeyboard}>
          <span className="xensi-nav-dropdown-label">{text.diagnostic}</span>
          <button type="button" role="menuitem" className={view === 'polling' ? 'active' : ''} aria-current={view === 'polling' ? 'page' : undefined} onClick={() => navigate('polling')}><Gauge size={16} /><span><b>{text.polling}</b><small>{text.pollingDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'buttons' ? 'active' : ''} aria-current={view === 'buttons' ? 'page' : undefined} onClick={() => navigate('buttons')}><Mouse size={16} /><span><b>{text.input}</b><small>{text.inputDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'refresh-rate' ? 'active' : ''} aria-current={view === 'refresh-rate' ? 'page' : undefined} onClick={() => navigate('refresh-rate')}><MonitorUp size={16} /><span><b>{text.refresh}</b><small>{text.refreshDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'controller-drift' ? 'active' : ''} aria-current={view === 'controller-drift' ? 'page' : undefined} onClick={() => navigate('controller-drift')}><Gamepad2 size={16} /><span><b>{text.drift}</b><small>{text.driftDescription}</small></span></button>
        </div>}
      </div>
      <button type="button" className={view === 'analysis' ? 'active' : ''} onClick={() => selectAnalysis('overview')} disabled={disabled}>{text.analysis}</button>
    </nav>

    <div className="xensi-nav-actions">
      {authState.status === 'loading' ? <div className="xensi-auth-skeleton" aria-label="Carregando sessão" /> : authState.status === 'authenticated' ? <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.profile = node }} type="button" className={`xensi-user-trigger ${view === 'profile' ? 'active' : ''}`} onClick={() => toggle('profile')} disabled={disabled} aria-haspopup="menu" aria-expanded={openMenu === 'profile'}><AvatarArtwork avatarId={navProfile.avatarId} size="sm" /><b>{navProfile.nickname}</b><ChevronDown size={13} /></button>
        {profileMenuOpen && <div className="xensi-nav-dropdown xensi-nav-dropdown-right xensi-profile-dropdown">
          <button type="button" onClick={() => navigate('profile')}><UserRound size={15} /><span><b>{text.profile}</b></span></button>
          <button type="button" onClick={() => navigate('profile')}><Settings2 size={15} /><span><b>{text.settings}</b></span></button>
          <label><Languages size={15} /><select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)} aria-label={text.settings}><option value="pt">Português</option><option value="en">English</option><option value="es">Español</option></select></label>
          <i />
          <button type="button" onClick={logout}><span><b>{text.logout}</b></span></button>
        </div>}
      </div> : <button type="button" className="xensi-login-trigger" onClick={onLogin} disabled={disabled} aria-label="Login"><UserRound size={16} /><span>LOGIN</span><ArrowRight size={15} /></button>}
    </div>
  </div>
}
