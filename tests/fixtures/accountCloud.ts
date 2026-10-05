import { expect, type Page, type BrowserContext } from '@playwright/test'

export type Row = { id: string; user_id: string; game_id: string; name: string | null; sensitivity: number; dpi: number; is_primary: boolean; created_at: string; updated_at: string }
export const userA = '10000000-0000-4000-8000-000000000001'
export const userB = '10000000-0000-4000-8000-000000000002'
export const localId = '20000000-0000-4000-8000-000000000001'
export const cloudId = '30000000-0000-4000-8000-000000000001'
export const localPreset = { id: localId, gameId: 'cs2', name: 'Guest preset', sensitivity: .65, dpi: 800, isPrimary: true, createdAt: '2026-09-05T12:00:00.000Z', updatedAt: '2026-09-05T12:00:00.000Z' }
export const remotePreset = (userId = userA): Row => ({ id: cloudId, user_id: userId, game_id: 'valorant', name: 'Cloud preset', sensitivity: .4, dpi: 1600, is_primary: true, created_at: localPreset.createdAt, updated_at: localPreset.updatedAt })

export async function mockCloud(context: BrowserContext, initial: Row[] = []) {
  const state = { failPB: false, pbCalls: 0, sessions: [] as HistoryRow[], runs: [] as HistoryRow[], loseHistoryResponse: false, historyCalls: [] as { owner: string; payload: { sessions: HistoryRow[]; runs: HistoryRow[] } }[], routineRows: [] as RoutineRow[], loseImportResponse: false, delayRoutineFetch: false, rows: [...initial], failWrites: false, importCalls: 0, delayImport: false }
  await context.route('https://xensi-presets.example.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url())
    const body = request.postDataJSON() ?? {}
    const respond = (json: unknown, status = 200) => route.fulfill({ status, json })
    const authorization = request.headers()['authorization'] ?? ''
    let owner = userA
    try { owner = JSON.parse(Buffer.from(authorization.replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub ?? userA } catch { /* Anonymous fixture. */ }
    if (url.pathname === '/auth/v1/token') {
      const id = body.email === 'b@example.invalid' ? userB : userA
      const user = { id, aud: 'authenticated', role: 'authenticated', email: body.email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { nickname: 'Test user' }, created_at: new Date().toISOString() }
      const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.')
      return respond({ access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user })
    }
    if (url.pathname === '/auth/v1/logout') return respond({})
    if (url.pathname === '/auth/v1/user') return respond({ id: owner, email: 'a@example.invalid' })
    if (url.pathname === '/rest/v1/profiles') return respond({ nickname: owner === userA ? 'Account A' : 'Account B', avatar_id: 'dog-happy' })
    if (url.pathname.endsWith('/xensi_analysis_v1')) {
      if (body.expected_user_id !== owner) return respond({ message: 'Session changed' }, 403)
      const result = await context.pages()[0].evaluate(async ({ rows, body, owner }) => {
        const { buildAnalysis } = await import('/src/analysisService.ts')
        const { parseCloudSession, sessionRow } = await import('/src/sessionCloud.ts')
        const query = { period: body.period_days === null ? 'all' : `${body.period_days}d`, exercise: body.target_exercise ?? 'all',
          variant: body.target_signature ? JSON.stringify([body.target_exercise,body.target_version,body.target_signature]) : null,
          metric: body.metric_key, now: Date.parse(body.as_of) }
        const data = buildAnalysis(rows.filter((r: {user_id:string})=>r.user_id===owner).map((r: unknown)=>parseCloudSession(r,owner)),owner,query)
        return { ...data, selected: data.recent[0] ? sessionRow(data.recent[0]) : null,
          points: data.points.map(sessionRow), recent: data.recent.map(sessionRow), variants: data.variants.map(v=>({session:sessionRow(v.session),count:v.count})) }
      }, { rows:state.sessions, body, owner })
      return respond(result)
    }
    if (url.pathname.endsWith('/xensi_personal_best_sessions')) {
      state.pbCalls++
      if (body.expected_user_id !== owner) return respond({ message: 'Session changed' }, 403)
      if (state.failPB) return respond({ message: 'PB unavailable' }, 503)
      const boundary = state.sessions.find(s => s.id === body.before_session_id && s.user_id === owner)
      if (body.before_session_id && !boundary) return respond({ message: 'Session unavailable' }, 403)
      const order = (s: HistoryRow) => `${s.finished_at}:${s.id}`
      const winners = new Map<string, HistoryRow>()
      for (const definition of body.definitions) {
        const candidates = state.sessions.filter(s => {
          const value = (s.metrics as Record<string, unknown> | null)?.[definition.primary_metric]
          return s.user_id === owner && s.exercise_id === definition.exercise_id && s.status === 'completed' && s.invalid_reason === null
            && s.schema_version === 1 && Number(s.exercise_version) > 0 && s.configuration && s.context && s.comparison_signature
            && typeof value === 'number' && Number.isFinite(value) && (definition.direction === 'lower' ? value > 0 : value >= 0)
            && (definition.min_accuracy == null || Number((s.metrics as Record<string, number>).accuracy) >= definition.min_accuracy)
            && (definition.min_hits == null || Number((s.metrics as Record<string, number>).hits) >= definition.min_hits)
            && (!body.target_signature || s.comparison_signature === body.target_signature)
            && (!body.target_exercise_version || s.exercise_version === body.target_exercise_version)
            && (!boundary || order(s) < order(boundary))
        }).sort((a, b) => {
          const delta = Number((a.metrics as Record<string, number>)[definition.primary_metric]) - Number((b.metrics as Record<string, number>)[definition.primary_metric])
          return (definition.direction === 'lower' ? delta : -delta) || order(a).localeCompare(order(b))
        })
        for (const s of candidates) {
          const key = JSON.stringify([s.exercise_id, s.exercise_version, s.comparison_signature])
          if (!winners.has(key)) winners.set(key, s)
        }
      }
      return respond([...winners.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(body.page_offset, body.page_offset + body.page_size).map(([, s]) => s))
    }
    if (url.pathname === '/rest/v1/training_sessions') {
      if (request.method()==='DELETE') {
        if (state.failWrites) return respond({message:'Delete failed'},503)
        const id=url.searchParams.get('id')?.replace('eq.','')
        const removed=state.sessions.filter(s=>s.user_id===owner&&s.id===id)
        state.sessions=state.sessions.filter(s=>!removed.includes(s))
        return respond(removed.map(s=>({id:s.id})))
      }
      return respond(state.sessions.filter(row => row.user_id === owner).sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at))).slice(0, 300))
    }
    if (url.pathname.endsWith('/xensi_get_training_routines')) {
      if (state.delayRoutineFetch) await new Promise(resolve => setTimeout(resolve, 350))
      return respond(state.routineRows.filter(row => row.user_id === owner))
    }
    if (url.pathname === '/rest/v1/training_routines') {
      if (state.delayRoutineFetch) await new Promise(resolve => setTimeout(resolve, 350))
      if (request.method() === 'DELETE') {
        if (state.failWrites) return respond({ message: 'fixture network failure' }, 503)
        const id = url.searchParams.get('id')?.replace('eq.', '')
        const removed = state.routineRows.filter(row => row.id === id && row.user_id === owner)
        state.routineRows = state.routineRows.filter(row => !removed.includes(row))
        return respond(removed.map(row => ({ id: row.id })))
      }
      return respond(state.routineRows.filter(row => row.user_id === owner))
    }
    if (state.failWrites && request.method() !== 'GET') return respond({ message: 'fixture network failure' }, 503)
    if (url.pathname === '/rest/v1/sensitivity_presets') {
      if (request.method() === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '')
        const removed = state.rows.filter(row => row.id === id && row.user_id === owner)
        state.rows = state.rows.filter(row => !removed.includes(row))
        return respond(removed.map(row => ({ id: row.id })))
      }
      return respond(state.rows.filter(row => row.user_id === owner))
    }
    if (body.expected_user_id !== owner) return respond({ message: 'Session changed' }, 403)
    if (url.pathname.endsWith('/xensi_append_training_history')) {
      state.historyCalls.push({ owner, payload: structuredClone(body.payload) })
      for (const item of body.payload.runs as HistoryRow[]) {
        const previous = state.runs.find(row => row.id === item.id && row.user_id === owner)
        if (!previous) state.runs.push(structuredClone(item))
        else if (previous.status === 'running' && item.status !== 'running') Object.assign(previous, { status: item.status, finished_at: item.finished_at, invalid_reason: item.invalid_reason, duration_ms: item.duration_ms })
      }
      for (const item of body.payload.sessions as HistoryRow[]) if (!state.sessions.some(row => row.id === item.id)) state.sessions.push(structuredClone(item))
      if (state.loseHistoryResponse) { state.loseHistoryResponse = false; return respond({ message: 'History response lost' }, 503) }
      return respond({ sessions: state.sessions.filter(row => row.user_id === owner && body.payload.sessions.some((s: HistoryRow) => s.id === row.id)),
        runs: state.runs.filter(row => row.user_id === owner && body.payload.runs.some((r: HistoryRow) => r.id === row.id)) })
    }
    if (url.pathname.endsWith('/xensi_save_training_routine') || url.pathname.endsWith('/xensi_import_training_routines')) {
      const importing = url.pathname.endsWith('/xensi_import_training_routines')
      if (importing) state.importCalls++
      const definitions = importing ? body.definitions : [body.definition]
      for (const definition of definitions) {
        const previous = state.routineRows.find(row => row.id === definition.id && row.user_id === owner)
        if (importing && previous) continue
        const timestamp = new Date().toISOString()
        const row: RoutineRow = { id: definition.id, user_id: owner, name: definition.name, game_id: definition.game_id, preset_id: definition.preset_id,
          created_at: previous?.created_at ?? timestamp, updated_at: timestamp, training_routine_steps: definition.steps }
        state.routineRows = state.routineRows.filter(row => row.id !== definition.id).concat(row)
      }
      if (importing && state.loseImportResponse) { state.loseImportResponse = false; return respond({ message: 'Response lost after write' }, 503) }
      return respond(state.routineRows.filter(row => row.user_id === owner))
    }
    if (url.pathname.endsWith('/xensi_import_sensitivity_presets')) {
      state.importCalls++
      if (state.delayImport) await new Promise(resolve => setTimeout(resolve, 250))
      const existingPrimary = state.rows.find(row => row.user_id === owner && row.is_primary)
      const guestPrimary = body.presets.find((item: { is_primary: boolean }) => item.is_primary)?.id
      for (const item of body.presets) if (!state.rows.some(row => row.id === item.id)) state.rows.push({ ...item, user_id: owner, is_primary: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      if (!existingPrimary) state.rows = state.rows.map(row => row.user_id === owner ? { ...row, is_primary: row.id === guestPrimary } : row)
    } else if (url.pathname.endsWith('/xensi_save_sensitivity_preset')) {
      if (body.preset_primary) state.rows = state.rows.map(row => row.user_id === owner ? { ...row, is_primary: false } : row)
      const previous = state.rows.find(row => row.id === body.preset_id && row.user_id === owner)
      const row: Row = { id: body.preset_id, user_id: owner, game_id: body.preset_game_id, name: body.preset_name,
        sensitivity: body.preset_sensitivity, dpi: body.preset_dpi, is_primary: body.preset_primary,
        created_at: previous?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }
      state.rows = state.rows.filter(row => row.id !== body.preset_id).concat(row)
    } else if (url.pathname.endsWith('/xensi_set_primary_sensitivity_preset')) {
      state.rows = state.rows.map(row => row.user_id === owner ? { ...row, is_primary: row.id === body.preset_id } : row)
    } else return respond({ message: 'Unexpected fixture endpoint' }, 404)
    return respond(state.rows.filter(row => row.user_id === owner))
  })
  return state
}

export async function seedGuest(page: Page) {
  await page.evaluate(preset => localStorage.setItem('xensi-player-profile', JSON.stringify({ nickname: 'Guest', presets: [preset] })), localPreset)
}
export async function login(page: Page, email = 'a@example.invalid') {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
  await page.getByLabel('Senha', { exact: true }).fill('FixturePassword1!')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
}

export type RoutineRow = { id: string; user_id: string; name: string; game_id: string; preset_id: string | null; created_at: string; updated_at: string; training_routine_steps: { id: string; position: number; exercise_id: string; duration_seconds: number; difficulty: string }[] }
export type HistoryRow = { id: string; user_id: string; [key: string]: unknown }
