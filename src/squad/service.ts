import { getSupabaseClient } from '../supabaseClient'
import type { SquadGame, SquadPlatform } from './registry'
export type RoomStatus = 'open' | 'reserved' | 'closed' | 'expired' | 'cancelled'
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'cancelled' | 'joined'
export type Room = {
  id: string; game_id: SquadGame; platform: SquadPlatform; crossplay: boolean; region: string; game_mode: string; rank_info: string
  microphone_required: boolean; status: RoomStatus; slots: number; capacity: number; filled: number; expires_at: string; reserved_until: string | null; created_at: string; nickname: string; avatar_id: string | null
}
export type Request = { id: string; room_id: string; status: RequestStatus; requested_at: string; platform: SquadPlatform; nickname: string; avatar_id: string | null; reserved_until: string | null; room: Room; discord_username: string | null }
export type Access = { eligible: boolean; enabled: boolean; email_confirmed: boolean; moderator: boolean; creation_enabled: boolean; publication_restricted: boolean; suspended: boolean }
export type Notification = { id: string; kind: string; room_id: string; created_at: string }
export type Contact = { nickname: string; discord_username: string; reserved_until: string }
export type Block = { id: string; nickname: string; created_at: string }
export type Report = { id: string; nickname: string; category: string; status: string; created_at: string }
export type Moderation = {
  reports: Report[]; actions: { id: string; action_type: string; reason: string; created_at: string }[]
  blocks: { blocker_user_id: string; blocked_user_id: string; created_at: string }[]
  restrictions: { user_id: string; nickname: string; publication_restricted: boolean; suspended: boolean }[]; creation_enabled: boolean
}
// No social data is persisted in localStorage, shared caches or console logs.
// expected_user_id is also checked by PostgreSQL, guarding account-switch races.
export async function squadRpc<T>(userId: string, action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const client = getSupabaseClient()
  if (!client) throw new Error('lfg_unconfigured')
  let query = client.rpc('xensi_lfg', { action, payload, expected_user_id: userId })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw new Error(error.message.match(/lfg_[a-z_]+/)?.[0] ?? 'lfg_network')
  if (data?.error) throw new Error(data.error)
  return data as T
}
