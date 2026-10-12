import { LayoutGroup } from 'motion/react'
import { ActiveIndicator, MotionDropdown } from './design/MotionSurfaces'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Home as HomeIcon, Bell, Search, BarChart3, ChevronDown, Crosshair, Gamepad2, Gauge, Info, Languages, MonitorUp, Mouse, Settings2, SlidersHorizontal, UserRound } from 'lucide-react'
import { SquadBell } from './squad/SquadBell'
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

const navLabel = (label: string) => label[0] + label.slice(1).toLocaleLowerCase()

const labels = {
  pt: { home: 'INÍCIO', train: 'TREINAR', calibrate: 'CALIBRAR', convert: 'CONVERTER', diagnostic: 'DIAGNÓSTICO', analysis: 'ANÁLISE', minigames: 'Minigames', minigamesDescription: 'Exercícios individuais', routinesDescription: 'Sequências de treino', routines: 'Rotinas', calibration: 'Calibrar sensibilidade', calibrationDescription: 'Encontre uma região de sensibilidade para testar.', history: 'Histórico', historyDescription: 'Consulte calibrações anteriores.', method: 'Como funciona', methodDescription: 'Entenda o método de calibração.', polling: 'Teste de Polling Rate', pollingDescription: 'Meça a frequência observada do mouse.', input: 'Diagnóstico de Entrada', inputDescription: 'Analise estabilidade e comportamento do input.', refresh: 'Refresh Rate', refreshDescription: 'Meça a frequência de atualização observada no navegador.', drift: 'Drift do Controle', driftDescription: 'Analise o desvio dos analógicos em repouso.', profile: 'Meu perfil', settings: 'Configurações', logout: 'Sair', unavailable: 'Disponível quando o login for ativado' },
  en: { home: 'HOME', train: 'TRAIN', calibrate: 'CALIBRATE', convert: 'CONVERT', diagnostic: 'DIAGNOSTICS', analysis: 'ANALYSIS', minigames: 'Minigames', minigamesDescription: 'Individual exercises', routinesDescription: 'Training sequences', routines: 'Routines', calibration: 'Calibrate sensitivity', calibrationDescription: 'Find a sensitivity range to test.', history: 'History', historyDescription: 'Review previous calibrations.', method: 'How it works', methodDescription: 'Understand the calibration method.', polling: 'Polling Rate Test', pollingDescription: 'Measure the mouse rate observed by the browser.', input: 'Input Diagnostics', inputDescription: 'Analyze input stability and behavior.', refresh: 'Refresh Rate', refreshDescription: 'Estimate the refresh rate observed by the browser.', drift: 'Controller Drift', driftDescription: 'Measure resting analog stick offset.', profile: 'My profile', settings: 'Settings', logout: 'Sign out', unavailable: 'Available when sign-in is enabled' },
  es: { home: 'INICIO', train: 'ENTRENAR', calibrate: 'CALIBRAR', convert: 'CONVERTIR', diagnostic: 'DIAGNÓSTICO', analysis: 'ANÁLISIS', minigames: 'Minijuegos', minigamesDescription: 'Ejercicios individuales', routinesDescription: 'Secuencias de entrenamiento', routines: 'Rutinas', calibration: 'Calibrar sensibilidad', calibrationDescription: 'Encuentra una región de sensibilidad para probar.', history: 'Historial', historyDescription: 'Consulta calibraciones anteriores.', method: 'Cómo funciona', methodDescription: 'Entiende el método de calibración.', polling: 'Prueba de Polling Rate', pollingDescription: 'Mide la frecuencia del ratón observada por el navegador.', input: 'Diagnóstico de Entrada', inputDescription: 'Analiza la estabilidad y el comportamiento de la entrada.', refresh: 'Refresh Rate', refreshDescription: 'Estima la actualización observada por el navegador.', drift: 'Drift del Control', driftDescription: 'Mide el desvío de los sticks en reposo.', profile: 'Mi perfil', settings: 'Configuración', logout: 'Salir', unavailable: 'Disponible cuando se active el acceso' },
} as const

type OpenMenu = 'train' | 'calibrate' | 'diagnostic' | 'profile' | 'search' | 'bell' | null
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
  const [moreOpen, setMoreOpen] = useState(false)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const [compactNav, setCompactNav] = useState(() => window.matchMedia('(max-width:880px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width:880px)')
    const update = () => { setCompactNav(query.matches); setMoreOpen(false); setOpenMenu(null) }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const [navSearch, setNavSearch] = useState('')
  const [navProfile, setNavProfile] = useState(readNavProfile)
  const [authState, setAuthState] = useState<AuthSessionState>({ status: 'loading', userId: null, profile: null })

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) { setOpenMenu(null); setMoreOpen(false) }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    if (!openMenu && !moreOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const originalTrigger = openMenu ? menuTriggerRefs.current[openMenu] : moreTrigger.current
      const trigger = originalTrigger?.getClientRects().length ? originalTrigger : moreTrigger.current
      if (openMenu) setOpenMenu(null)
      else setMoreOpen(false)
      trigger?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [openMenu, moreOpen])

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
    setMoreOpen(false)
    await signOut()
    onNavigate('home')
  }

  const bellTriggerRef = useRef<HTMLButtonElement | null>(null)
  const navigate = (next: NavigationView) => {
    setOpenMenu(null)
    setMoreOpen(false)
    onNavigate(next)
  }
  const selectAnalysis = (section: AnalysisSection) => {
    setOpenMenu(null)
    setMoreOpen(false)
    onAnalysisSection(section)
  }
  const toggle = (menu: MenuName) => {
    setOpenMenu((current) => current === menu ? null : menu)
  }
  const openFromKeyboard = (menu: MenuName, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown') return
    event.preventDefault()
    setOpenMenu(menu)
    window.requestAnimationFrame(() => shellRef.current?.querySelector<HTMLElement>(`[data-menu="${menu}"] [role="menuitem"]`)?.focus())
  }
  const navigateMenuWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length)
    items[next]?.focus()
  }
  const diagnosticActive = isDiagnosticView(view)
  const profileMenuOpen = authState.status === 'authenticated' && openMenu === 'profile'

  return <div className="xensi-navigation" ref={shellRef}>
    <XensiLogo as="button" onClick={() => navigate('home')} disabled={disabled} />

    <LayoutGroup id="navbar"><nav className="xensi-primary-nav" aria-label="XENSI">
      <button type="button" className={`xensi-nav-home${view === 'home' ? ' active' : ''}`} onClick={() => navigate('home')} disabled={disabled} aria-label={navLabel(text.home)}><HomeIcon size={16} className="xensi-nav-home-icon" /><span className="xensi-nav-home-label">{navLabel(text.home)}</span>{(view === 'home') && <ActiveIndicator />}</button>
      <button type="button" className={view === 'squad' ? 'active' : ''} aria-current={view === 'squad' ? 'page' : undefined} onClick={() => navigate('squad')} disabled={disabled}>Squad Finder{view === 'squad' && <ActiveIndicator />}</button>
      <button ref={moreTrigger} type="button" className={`xensi-nav-more-trigger${!['home','squad','profile'].includes(view) ? ' active' : ''}`} aria-label={locale === 'pt' ? 'Mais' : locale === 'es' ? 'Más' : 'More'} title={locale === 'pt' ? 'Mais' : locale === 'es' ? 'Más' : 'More'} aria-expanded={moreOpen} aria-controls="xensi-nav-secondary" onClick={() => { setOpenMenu(null); setMoreOpen(value => !value) }} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setMoreOpen(true); window.requestAnimationFrame(() => shellRef.current?.querySelector<HTMLButtonElement>('.xensi-nav-secondary > button, .xensi-nav-secondary > div > button')?.focus()) } }} disabled={disabled}><span>{locale === 'pt' ? 'Mais' : locale === 'es' ? 'Más' : 'More'}</span><ChevronDown size={12} />{compactNav && !moreOpen && !['home','squad','profile'].includes(view) && <ActiveIndicator />}</button>
      <div id="xensi-nav-secondary" className="xensi-nav-secondary" data-expanded={moreOpen}>
      <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.train = node }} type="button" className={view === 'warmup' || view === 'routine' ? 'active' : ''} onClick={() => toggle('train')} onKeyDown={(event) => openFromKeyboard('train', event)} disabled={disabled} aria-haspopup="menu" aria-label={navLabel(text.train)} aria-expanded={openMenu === 'train'}>{navLabel(text.train)}{(!compactNav || moreOpen) && (view === 'warmup' || view === 'routine') && <ActiveIndicator />}<ChevronDown size={13} /></button>
        <MotionDropdown open={openMenu === 'train'} className="xensi-nav-dropdown xensi-training-dropdown" data-menu="train" role="menu" aria-label={navLabel(text.train)} onKeyDown={navigateMenuWithKeyboard}>
          <button type="button" role="menuitem" onClick={() => navigate('warmup')}><Crosshair size={18} /><span><b>{text.minigames}</b><small>{text.minigamesDescription}</small></span></button>
          <button type="button" role="menuitem" onClick={() => navigate('routine')}><SlidersHorizontal size={18} /><span><b>{text.routines}</b><small>{text.routinesDescription}</small></span></button>
        </MotionDropdown>
      </div>
      <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.calibrate = node }} type="button" className={view === 'calibration' ? 'active' : ''} onClick={() => toggle('calibrate')} onKeyDown={(event) => openFromKeyboard('calibrate', event)} disabled={disabled} aria-haspopup="menu" aria-label={navLabel(text.calibrate)} aria-expanded={openMenu === 'calibrate'}>{navLabel(text.calibrate)}{(!compactNav || moreOpen) && (view === 'calibration') && <ActiveIndicator />}<ChevronDown size={13} /></button>
        <MotionDropdown open={openMenu === 'calibrate'} className="xensi-nav-dropdown xensi-calibrate-dropdown" data-menu="calibrate" role="menu" aria-label={navLabel(text.calibrate)} onKeyDown={navigateMenuWithKeyboard}>
          <span className="xensi-nav-dropdown-label">{text.calibrate}</span>
          <button type="button" role="menuitem" className="is-primary" onClick={() => navigate('calibration')}><Crosshair size={15} /><span><b>{text.calibration}</b><small>{text.calibrationDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'analysis' && analysisSection === 'calibration-history' ? 'active is-secondary' : 'is-secondary'} aria-current={view === 'analysis' && analysisSection === 'calibration-history' ? 'page' : undefined} onClick={() => selectAnalysis('calibration-history')}><BarChart3 size={15} /><span><b>{text.history}</b><small>{text.historyDescription}</small></span></button>
          <i className="xensi-nav-dropdown-divider" aria-hidden="true" />
          <button type="button" role="menuitem" className={view === 'analysis' && analysisSection === 'methodology' ? 'active is-documentation' : 'is-documentation'} aria-current={view === 'analysis' && analysisSection === 'methodology' ? 'page' : undefined} onClick={() => selectAnalysis('methodology')}><Info size={15} /><span><b>{text.method}</b><small>{text.methodDescription}</small></span></button>
        </MotionDropdown>
      </div>
      <button type="button" className={view === 'converter' ? 'active' : ''} onClick={() => navigate('converter')} disabled={disabled} aria-label={navLabel(text.convert)}>{navLabel(text.convert)}{(!compactNav || moreOpen) && (view === 'converter') && <ActiveIndicator />}</button>
      <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.diagnostic = node }} type="button" className={diagnosticActive ? 'active' : ''} onClick={() => toggle('diagnostic')} onKeyDown={(event) => openFromKeyboard('diagnostic', event)} disabled={disabled} aria-haspopup="menu" aria-label={navLabel(text.diagnostic)} aria-expanded={openMenu === 'diagnostic'} aria-current={diagnosticActive ? 'page' : undefined}>{navLabel(text.diagnostic)}{(!compactNav || moreOpen) && (diagnosticActive) && <ActiveIndicator />}<ChevronDown size={13} /></button>
        <MotionDropdown open={openMenu === 'diagnostic'} className="xensi-nav-dropdown xensi-diagnostic-dropdown" data-menu="diagnostic" role="menu" aria-label={navLabel(text.diagnostic)} onKeyDown={navigateMenuWithKeyboard}>
          <span className="xensi-nav-dropdown-label">{text.diagnostic}</span>
          <button type="button" role="menuitem" className={view === 'polling' ? 'active' : ''} aria-current={view === 'polling' ? 'page' : undefined} onClick={() => navigate('polling')}><Gauge size={16} /><span><b>{text.polling}</b><small>{text.pollingDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'buttons' ? 'active' : ''} aria-current={view === 'buttons' ? 'page' : undefined} onClick={() => navigate('buttons')}><Mouse size={16} /><span><b>{text.input}</b><small>{text.inputDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'refresh-rate' ? 'active' : ''} aria-current={view === 'refresh-rate' ? 'page' : undefined} onClick={() => navigate('refresh-rate')}><MonitorUp size={16} /><span><b>{text.refresh}</b><small>{text.refreshDescription}</small></span></button>
          <button type="button" role="menuitem" className={view === 'controller-drift' ? 'active' : ''} aria-current={view === 'controller-drift' ? 'page' : undefined} onClick={() => navigate('controller-drift')}><Gamepad2 size={16} /><span><b>{text.drift}</b><small>{text.driftDescription}</small></span></button>
        </MotionDropdown>
      </div>
      <button type="button" className={view === 'analysis' ? 'active' : ''} onClick={() => selectAnalysis('overview')} disabled={disabled} aria-label={navLabel(text.analysis)}>{navLabel(text.analysis)}{(!compactNav || moreOpen) && (view === 'analysis') && <ActiveIndicator />}</button>
      <button type="button" className="xensi-nav-compact-utility" onClick={() => { setMoreOpen(false); setNavSearch(''); setOpenMenu('search') }} disabled={disabled}><Search size={16} />{locale === 'pt' ? 'Buscar ferramentas' : locale === 'es' ? 'Buscar herramientas' : 'Search tools'}</button>
      <button type="button" className="xensi-nav-compact-utility" onClick={() => navigate('squad')} disabled={disabled}><Bell size={16} />{locale === 'pt' ? 'Notificações do Squad' : locale === 'es' ? 'Notificaciones del Squad' : 'Squad notifications'}</button>
      </div>
    </nav></LayoutGroup>

    <div className="xensi-nav-actions">
      <div className="xensi-nav-menu-group xensi-nav-search-group">
        <button ref={node => { menuTriggerRefs.current.search = node }} type="button" className="xensi-nav-utility" aria-label={locale === 'pt' ? 'Buscar ferramentas' : locale === 'es' ? 'Buscar herramientas' : 'Search tools'} title={locale === 'pt' ? 'Buscar ferramentas' : locale === 'es' ? 'Buscar herramientas' : 'Search tools'} aria-expanded={openMenu === 'search'} onClick={() => { setNavSearch(''); toggle('search') }} disabled={disabled}><Search size={22} /></button>
        <MotionDropdown open={openMenu === 'search'} className="xensi-nav-dropdown xensi-nav-dropdown-right xensi-nav-search" data-menu="search" onKeyDown={navigateMenuWithKeyboard}>
          <label><Search size={17} /><input autoFocus aria-label={locale === 'pt' ? 'Buscar ferramentas' : locale === 'es' ? 'Buscar herramientas' : 'Search tools'} value={navSearch} onChange={e => setNavSearch(e.target.value)} />{navSearch && <button type="button" aria-label={locale === 'pt' ? 'Limpar busca' : locale === 'es' ? 'Limpiar búsqueda' : 'Clear search'} onClick={e => { setNavSearch(''); e.currentTarget.parentElement?.querySelector('input')?.focus() }}>×</button>}</label>
          <div role="menu">{([{view:'home', label:navLabel(text.home)}, {view:'squad',label:'Squad Finder'}, {view:'warmup',label:navLabel(text.train)}, {view:'calibration',label:navLabel(text.calibrate)}, {view:'converter',label:navLabel(text.convert)}, {view:'diagnostics',label:navLabel(text.diagnostic)}, {view:'analysis',label:navLabel(text.analysis)}, {view:'profile',label:locale === 'en' ? 'Profile' : 'Perfil'}] as {view:AppView;label:string}[]).filter(item => item.label.toLocaleLowerCase().includes(navSearch.toLocaleLowerCase())).map(item => <button type="button" role="menuitem" key={item.view} onClick={() => navigate(item.view)}>{item.label}</button>)}</div>
        </MotionDropdown>
      </div>
      <SquadBell userId={authState.status === 'authenticated' ? authState.userId : null} locale={locale} open={openMenu === 'bell'} disabled={disabled} triggerRef={bellTriggerRef} onToggle={() => toggle('bell')} onOpenSquad={() => navigate('squad')} />
      <div className="xensi-nav-account-slot">{authState.status === 'loading' ? <div className="xensi-auth-skeleton" aria-label="Carregando sessão" /> : authState.status === 'authenticated' ? <div className="xensi-nav-menu-group">
        <button ref={(node) => { menuTriggerRefs.current.profile = node }} type="button" aria-label={navProfile.nickname} className={`xensi-user-trigger ${view === 'profile' ? 'active' : ''}`} onClick={() => toggle('profile')} disabled={disabled} onKeyDown={event => openFromKeyboard('profile', event)} aria-haspopup="menu" aria-expanded={openMenu === 'profile'}><span className="xensi-nav-account-avatar">{navProfile.avatarId === DEFAULT_AVATAR ? navProfile.nickname.charAt(0) : <AvatarArtwork avatarId={navProfile.avatarId} size="sm" />}</span><b className="xensi-nav-username">{navProfile.nickname}</b><ChevronDown size={13} /></button>
        <MotionDropdown open={profileMenuOpen} className="xensi-nav-dropdown xensi-nav-dropdown-right xensi-profile-dropdown" data-menu="profile" onKeyDown={navigateMenuWithKeyboard}>
          <span className="xensi-account-name">{navProfile.nickname}</span>
          <button type="button" role="menuitem" onClick={() => navigate('profile')}><UserRound size={15} /><span><b>{text.profile}</b></span></button>
          <button type="button" role="menuitem" onClick={() => navigate('profile')}><Settings2 size={15} /><span><b>{text.settings}</b></span></button>
          <label><Languages size={15} /><select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)} aria-label={text.settings}><option value="pt">Português</option><option value="en">English</option><option value="es">Español</option></select></label>
          <i />
          <button type="button" role="menuitem" onClick={logout}><span><b>{text.logout}</b></span></button>
        </MotionDropdown>
      </div> : <button type="button" className="xensi-login-trigger" onClick={onLogin} disabled={disabled} aria-label="Login"><UserRound size={16} /><span>Login</span><ArrowRight size={15} /></button>}</div>
    </div>
  </div>
}
