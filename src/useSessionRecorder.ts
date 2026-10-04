import { useEffect, useState } from 'react'
import { getSessionRepository, sessionTabId } from './sessionRepository'
import { readAuthSessionState } from './authService'
import { SessionRecorder } from './sessionRecorder'

export function useSessionRecorder() {
  const [recorder] = useState(() => new SessionRecorder(getSessionRepository(), sessionTabId()))
  useEffect(() => {
    let owner = readAuthSessionState().userId
    const visibility = () => { if (document.hidden) recorder.invalidate('visibility_hidden') }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') recorder.invalidate('escape') }
    const auth = () => {
      const next = readAuthSessionState().userId
      if (next !== owner) { recorder.abort('account_changed'); recorder.finishRun('interrupted', 'account_changed'); owner = next }
    }
    const unload = () => { recorder.abort('page_reload'); recorder.finishRun('interrupted', 'page_reload') }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('keydown', key, true)
    window.addEventListener('xensi-auth-updated', auth)
    window.addEventListener('pagehide', unload)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('xensi-auth-updated', auth)
      window.removeEventListener('pagehide', unload)
      recorder.abort('navigation'); recorder.finishRun('interrupted', 'navigation')
    }
  }, [recorder])
  return recorder
}
