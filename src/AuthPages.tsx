import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleAlert, Eye, EyeOff, MailCheck, RotateCcw } from 'lucide-react'
import authArt from './assets/xensi-auth-art.webp'
import { XensiLogo } from './AppNavigation'
import {
  AuthMode,
  AuthStatus,
  checkNicknameAvailability,
  registerWithEmail,
  requestPasswordReset,
  resendSignupConfirmation,
  signInWithEmail,
  updatePassword,
  type AuthErrorCode,
  type AuthLocale,
} from './authService'
import { useI18n, type Locale, type TranslationKey } from './i18n'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type AuthScreenProps = {
  mode: AuthMode
  onNavigate: (mode: AuthMode) => void
  onAuthenticated: () => void
}

type NicknameState = 'idle' | 'invalid' | 'checking' | 'available' | 'unavailable' | 'error'
type CallbackState = 'checking' | 'success' | 'error'

const modeKeys: Record<AuthMode, {
  title: TranslationKey
  subtitle: TranslationKey
  action: TranslationKey
  loading: TranslationKey
  complete: TranslationKey
}> = {
  login: {
    title: 'auth.login.title',
    subtitle: 'auth.login.subtitle',
    action: 'auth.login.action',
    loading: 'auth.login.loading',
    complete: 'auth.login.complete',
  },
  register: {
    title: 'auth.register.title',
    subtitle: 'auth.register.subtitle',
    action: 'auth.register.action',
    loading: 'auth.register.loading',
    complete: 'auth.register.complete',
  },
  'forgot-password': {
    title: 'auth.forgot.title',
    subtitle: 'auth.forgot.subtitle',
    action: 'auth.forgot.action',
    loading: 'auth.forgot.loading',
    complete: 'auth.forgot.complete',
  },
  'reset-password': {
    title: 'auth.reset.title',
    subtitle: 'auth.reset.subtitle',
    action: 'auth.reset.action',
    loading: 'auth.reset.loading',
    complete: 'auth.reset.complete',
  },
  'auth-callback': {
    title: 'auth.callback.checkingTitle',
    subtitle: 'auth.callback.checkingSubtitle',
    action: 'auth.callback.continue',
    loading: 'auth.callback.loading',
    complete: 'auth.callback.successTitle',
  },
}

const errorKeys: Record<AuthErrorCode, TranslationKey> = {
  auth_unconfigured: 'auth.error.unconfigured',
  missing_login_fields: 'auth.error.missingLogin',
  missing_email: 'auth.error.missingEmail',
  missing_signup_fields: 'auth.error.missingSignup',
  missing_password: 'auth.error.missingPassword',
  invalid_credentials: 'auth.error.invalidCredentials',
  email_not_confirmed: 'auth.error.emailNotConfirmed',
  email_already_registered: 'auth.error.emailAlreadyRegistered',
  nickname_unavailable: 'auth.error.nicknameUnavailable',
  nickname_check_failed: 'auth.error.nicknameCheckFailed',
  generic: 'auth.error.generic',
}

function normalizeAuthLocale(locale: Locale): AuthLocale {
  return locale === 'pt' ? 'pt-BR' : 'en-US'
}

function readCallbackError() {
  const values = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return values.get('error') ?? values.get('error_code') ?? hash.get('error') ?? hash.get('error_code')
}

function PasswordInput({ id, value, onChange, visible, onToggle, autoComplete, placeholder, disabled, invalid, showLabel, hideLabel }: { id: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void; autoComplete: string; placeholder: string; disabled: boolean; invalid?: boolean; showLabel: string; hideLabel: string }) {
  return <div className="relative">
    <Input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined} required className="h-12 pr-12" />
    <Button variant="ghost" size="icon" className="absolute top-1/2 right-1 size-10 -translate-y-1/2 active:-translate-y-1/2" onClick={onToggle} aria-label={visible ? hideLabel : showLabel} disabled={disabled}>
      {visible ? <EyeOff /> : <Eye />}
    </Button>
  </div>
}

// Slightly darkened so the form stays the focus; fades in once decoded instead of popping in late.
function AuthArt() {
  const [loaded, setLoaded] = useState(false)
  return <img src={authArt} alt="" fetchPriority="high" decoding="async" ref={image => { if (image?.complete && image.naturalWidth) setLoaded(true) }} onLoad={() => setLoaded(true)}
    className={`absolute inset-0 size-full object-cover object-[65%_center] brightness-[.78] saturate-[.9] transition-opacity duration-500 ease-out motion-reduce:transition-none [mask-image:linear-gradient(90deg,transparent_0%,#000_45%)] ${loaded ? 'opacity-100' : 'opacity-0'}`} />
}

// Split layout (shadcn login-02): form column on the left, brand art on the right from lg up.
function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="xensi-auth-page grid min-h-[100dvh] bg-background font-sans text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <div className="xensi-auth-shell flex min-h-[100dvh] flex-col px-6 py-7 sm:px-10 lg:px-14">
      <XensiLogo className="self-start" />
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
    {/* No divider: the art fades into the form column so the seam disappears. */}
    <div aria-hidden="true" className="relative hidden overflow-hidden lg:block">
      <AuthArt />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_0%,transparent_30%),linear-gradient(0deg,var(--background)_0%,transparent_22%)]" />
    </div>
  </main>
}

const title = 'm-0 font-heading text-[28px] font-semibold leading-tight tracking-[-0.015em] text-foreground'
const lead = 'm-0 text-[15px] leading-relaxed text-muted-foreground'

export function AuthScreen({ mode, onNavigate, onAuthenticated }: AuthScreenProps) {
  const { locale, t } = useI18n()
  const copy = modeKeys[mode]
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [message, setMessage] = useState('')
  const [nicknameState, setNicknameState] = useState<NicknameState>('idle')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [callbackState, setCallbackState] = useState<CallbackState>('checking')
  const trimmedNickname = nickname.trim()
  const needsEmail = mode !== 'reset-password' && mode !== 'auth-callback'
  const needsPassword = mode !== 'forgot-password' && mode !== 'auth-callback'
  const needsConfirmPassword = mode === 'register' || mode === 'reset-password'
  const passwordsMismatch = needsConfirmPassword && confirmPassword.length > 0 && password !== confirmPassword
  const authLocale = normalizeAuthLocale(locale)

  const nicknameMessage = useMemo(() => {
    if (mode !== 'register' || !trimmedNickname) return ''
    if (nicknameState === 'invalid') return t('auth.nickname.invalid')
    if (nicknameState === 'checking') return t('auth.nickname.checking')
    if (nicknameState === 'available') return t('auth.nickname.available')
    if (nicknameState === 'unavailable') return t('auth.nickname.unavailable')
    if (nicknameState === 'error') return t('auth.nickname.error')
    return ''
  }, [mode, nicknameState, t, trimmedNickname])

  useEffect(() => {
    setStatus('idle')
    setMessage('')
    setPassword('')
    setConfirmPassword('')
    setConfirmationEmail('')
    setCallbackState('checking')
  }, [mode])

  useEffect(() => {
    if (mode !== 'register') return
    if (!trimmedNickname) {
      setNicknameState('idle')
      return
    }
    if (trimmedNickname.length < 3 || trimmedNickname.length > 24) {
      setNicknameState('invalid')
      return
    }
    setNicknameState('checking')
    const timer = window.setTimeout(async () => {
      const result = await checkNicknameAvailability(trimmedNickname)
      if (!result.ok) {
        setNicknameState(result.code === 'auth_unconfigured' ? 'idle' : 'error')
        return
      }
      setNicknameState(result.available ? 'available' : 'unavailable')
    }, 350)
    return () => window.clearTimeout(timer)
  }, [mode, trimmedNickname])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  useEffect(() => {
    if (mode !== 'auth-callback') return
    if (readCallbackError()) {
      setCallbackState('error')
      setStatus('error')
      setMessage(t('auth.callback.errorText'))
      return
    }
    setCallbackState('success')
    setStatus('success')
    const timer = window.setTimeout(onAuthenticated, 2200)
    return () => window.clearTimeout(timer)
  }, [mode, onAuthenticated, t])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'loading') return
    if (passwordsMismatch) {
      setStatus('error')
      setMessage(t('auth.error.passwordMismatch'))
      return
    }
    if (mode === 'register') {
      if (trimmedNickname.length < 3 || trimmedNickname.length > 24) {
        setStatus('error')
        setMessage(t('auth.nickname.invalid'))
        return
      }
      if (nicknameState === 'checking') {
        setStatus('error')
        setMessage(t('auth.nickname.wait'))
        return
      }
      if (nicknameState === 'unavailable') {
        setStatus('error')
        setMessage(t('auth.error.nicknameUnavailable'))
        return
      }
    }

    setStatus('loading')
    setMessage('')
    const result = mode === 'login'
      ? await signInWithEmail(email, password)
      : mode === 'register'
        ? await registerWithEmail(email, password, trimmedNickname, authLocale)
        : mode === 'reset-password'
          ? await updatePassword(password)
          : await requestPasswordReset(email)
    if (!result.ok) {
      setStatus('error')
      setMessage(t(errorKeys[result.code]))
      return
    }
    setStatus('success')
    setMessage(t(copy.complete))
    if (mode === 'register') {
      setConfirmationEmail(email.trim())
      setResendCooldown(60)
      return
    }
    if (mode === 'login') onAuthenticated()
    if (mode === 'reset-password') window.setTimeout(onAuthenticated, 1800)
  }

  const resendConfirmation = async () => {
    if (!confirmationEmail || resendCooldown > 0 || status === 'loading') return
    setStatus('loading')
    setMessage('')
    const result = await resendSignupConfirmation(confirmationEmail)
    if (!result.ok) {
      setStatus('error')
      setMessage(t(errorKeys[result.code]))
      return
    }
    setStatus('success')
    setMessage(t('auth.confirm.resendSent'))
    setResendCooldown(60)
  }

  const statusMessage = message && <Alert role={status === 'error' ? 'alert' : 'status'} variant={status === 'error' ? 'destructive' : 'success'} aria-live="polite" className={`xensi-auth-message ${status}`}>
    {status === 'error' ? <CircleAlert /> : <CheckCircle2 />}<span className="col-start-2">{message}</span>
  </Alert>

  if (mode === 'auth-callback') {
    const success = callbackState === 'success'
    return <AuthLayout>
      <div className="xensi-auth-card xensi-auth-state-card grid gap-6">
        <span className={`grid size-12 place-content-center rounded-full border border-solid ${success ? 'border-success/35 bg-success/10 text-success' : 'border-destructive/35 bg-destructive/10 text-destructive'}`}>{success ? <CheckCircle2 size={22} aria-hidden="true" /> : <CircleAlert size={22} aria-hidden="true" />}</span>
        <div className="grid gap-2">
          <h1 className={title}>{success ? t('auth.callback.successTitle') : t('auth.callback.errorTitle')}</h1>
          <p className={lead}>{success ? t('auth.callback.successText') : t('auth.callback.errorText')}</p>
        </div>
        <Button size="lg" className="xensi-auth-submit w-full" onClick={success ? onAuthenticated : () => onNavigate('login')}>
          {success ? t('auth.callback.continue') : t('auth.signIn')}
          <ArrowRight />
        </Button>
      </div>
    </AuthLayout>
  }

  if (mode === 'register' && confirmationEmail) {
    return <AuthLayout>
      <div className="xensi-auth-card xensi-auth-state-card grid gap-6">
        <span className="grid size-12 place-content-center rounded-full border border-solid border-success/35 bg-success/10 text-success"><MailCheck size={22} aria-hidden="true" /></span>
        <div className="grid gap-2">
          <h1 className={title}>{t('auth.confirm.title')}</h1>
          <p className={lead}>{t('auth.confirm.subtitle', { email: confirmationEmail })}</p>
        </div>
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">{t('auth.confirm.instructions')}</p>
        {statusMessage}
        <Button size="lg" variant="outline" className="xensi-auth-submit w-full" onClick={resendConfirmation} disabled={status === 'loading' || resendCooldown > 0}>
          <RotateCcw />
          {resendCooldown > 0 ? t('auth.confirm.resendCooldown', { seconds: resendCooldown }) : t('auth.confirm.resend')}
        </Button>
        <Button variant="link" className="justify-self-center" onClick={() => onNavigate('login')}>{t('auth.confirm.backToSignIn')}</Button>
      </div>
    </AuthLayout>
  }

  const busy = status === 'loading'
  return <AuthLayout>
    <form className="xensi-auth-card grid gap-7" onSubmit={submit} noValidate>
      <div className="grid gap-2">
        <h1 className={title}>{t(copy.title)}</h1>
        <p className={lead}>{t(copy.subtitle)}</p>
      </div>

      <FieldGroup>
        {needsEmail && <Field>
          <FieldLabel htmlFor="auth-email">{t('auth.emailLabel')}</FieldLabel>
          <Input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder={t('auth.emailPlaceholder')} disabled={busy} required className="h-12" />
        </Field>}

        {mode === 'register' && <Field>
          <FieldLabel htmlFor="auth-nickname">{t('auth.nicknameLabel')}</FieldLabel>
          <Input id="auth-nickname" type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" minLength={3} maxLength={24} placeholder={t('auth.nicknamePlaceholder')} disabled={busy} aria-invalid={nicknameState === 'invalid' || nicknameState === 'unavailable' || undefined} required className="h-12" />
          {nicknameMessage && <FieldError className={`xensi-auth-inline ${nicknameState}`} aria-live="polite" tone={nicknameState === 'available' ? 'success' : nicknameState === 'checking' ? 'neutral' : 'error'} role={nicknameState === 'unavailable' || nicknameState === 'error' ? 'alert' : 'status'}>{nicknameMessage}</FieldError>}
        </Field>}

        {needsPassword && <Field>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="auth-password">{mode === 'reset-password' ? t('auth.newPasswordLabel') : t('auth.passwordLabel')}</FieldLabel>
            {mode === 'login' && <Button variant="link" size="sm" className="h-auto p-0 text-[13px] font-medium text-muted-foreground no-underline hover:text-primary hover:no-underline" onClick={() => onNavigate('forgot-password')}>{t('auth.forgot')}</Button>}
          </div>
          <PasswordInput id="auth-password" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'reset-password' ? t('auth.newPasswordPlaceholder') : t('auth.passwordPlaceholder')} disabled={busy} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
        </Field>}

        {needsConfirmPassword && <Field>
          <FieldLabel htmlFor="auth-confirm-password">{t('auth.confirmPasswordLabel')}</FieldLabel>
          <PasswordInput id="auth-confirm-password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} autoComplete="new-password" placeholder={t('auth.confirmPasswordPlaceholder')} disabled={busy} invalid={passwordsMismatch} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} />
          {passwordsMismatch && <FieldError className="xensi-auth-inline unavailable">{t('auth.error.passwordMismatch')}</FieldError>}
        </Field>}
      </FieldGroup>

      {statusMessage}

      <div className="grid gap-4">
        <Button type="submit" size="lg" className="xensi-auth-submit w-full" disabled={busy} aria-busy={busy}>
          {busy ? t(copy.loading) : t(copy.action)}
          {mode === 'forgot-password' ? <RotateCcw /> : <ArrowRight />}
        </Button>
        <FieldSeparator />
        <Button variant="outline" size="lg" className="xensi-auth-guest w-full" onClick={onAuthenticated}>{t('auth.continueGuest')}</Button>
      </div>

      <p className="xensi-auth-switch m-0 text-center text-sm text-muted-foreground">
        {mode === 'login' ? t('auth.loginSwitch') : t('auth.registerSwitch')}{' '}
        <Button variant="link" className="h-auto p-0 text-sm" onClick={() => onNavigate(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? t('auth.createAccount') : t('auth.signIn')}</Button>
      </p>
    </form>
  </AuthLayout>
}
