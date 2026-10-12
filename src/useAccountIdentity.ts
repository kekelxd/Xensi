import { useEffect, useState } from 'react'
import { initializeAuth, readAuthSessionState } from './authService'
import { getSupabaseClient } from './supabaseClient'

// Own-account metadata only. Never mirror Discord into the guest profile store.
export function useAccountIdentity() {
  const [auth, setAuth] = useState(readAuthSessionState)
  const [identity, setIdentity] = useState<{ userId: string; discord: string; joined: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let alive = true
    const update = () => setAuth(readAuthSessionState())
    void initializeAuth().then(() => { if (alive) update() })
    window.addEventListener('xensi-auth-updated', update)
    return () => { alive = false; window.removeEventListener('xensi-auth-updated', update) }
  }, [])
  useEffect(() => {
    if (!auth.userId) return
    let alive = true
    const client = getSupabaseClient()
    if (!client) return
    void client.auth.getUser().then(({ data, error }) => {
      if (!alive || readAuthSessionState().userId !== auth.userId) return
      setFailed(Boolean(error))
      if (data.user?.id === auth.userId) setIdentity({ userId: auth.userId, discord: typeof data.user.user_metadata?.discord_username === 'string' ? data.user.user_metadata?.discord_username : '', joined: data.user.created_at ?? '' })
    }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [auth, revision])
  const current = identity?.userId === auth.userId ? identity : null
  const saveDiscord = async (discord: string) => {
    const client = getSupabaseClient(), userId = auth.userId
    if (!client || !userId) return false
    const { data: before } = await client.auth.getUser()
    if (before.user?.id !== userId || readAuthSessionState().userId !== userId) return false
    const { data, error } = await client.auth.updateUser({ data: { discord_username: discord } })
    if (error || data.user?.id !== userId || readAuthSessionState().userId !== userId) return false
    setIdentity({ userId, discord, joined: data.user.created_at ?? '' })
    return true
  }
  return { userId: auth.userId, discord: current?.discord ?? '', joined: current?.joined ?? '', ready: !auth.userId || Boolean(current), failed, saveDiscord, retry: () => setRevision(value => value + 1) }
}
