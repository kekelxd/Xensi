// Native PostgreSQL, independent connections, synthetic identities. No remote URL input.
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'

const dir = await mkdtemp(join(tmpdir(), 'xensi-squad-security-'))
assert.equal(dirname(resolve(dir)), resolve(tmpdir()))
const port = await new Promise((resolvePort, reject) => {
 const socket = createServer()
 socket.on('error', reject)
 socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolvePort(port)) })
})
const password = randomUUID()
const server = new EmbeddedPostgres({ databaseDir: join(dir, 'db'), port, user: 'fixture', password, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
const clients = []
const ids = Object.fromEntries(['A','B','C','D','M'].map((name,i) => [name, `10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]))
const sessions = Object.fromEntries(Object.values(ids).map(id => [id, randomUUID()]))
let admin, passed = 0, started = false
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function connect() {
 const c = new pg.Client({host:'127.0.0.1', port, user:'fixture', password, database:'postgres'})
 await c.connect(); await c.query("set statement_timeout='5s'"); clients.push(c); return c
}
async function rpc(c, user, action, payload = {}, override = {}) {
 await c.query('begin')
 try {
  await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:user,role:'authenticated',session_id:sessions[user],exp:Math.floor(Date.now()/1000)+3600,...override})])
  await c.query('set local role authenticated')
  const data = (await c.query('select public.xensi_lfg($1,$2::jsonb,$3::uuid) result',[action,JSON.stringify(payload),user])).rows[0].result
  await c.query('commit')
  if(data?.error) throw new Error(data.error)
  return data
 } catch(e) { await c.query('rollback'); throw e }
}
async function check(name, fn) { await reset(); await fn(); passed++; console.log(`PASS ${name}`) }
async function reset() {
 await admin.query("truncate public.lfg_rooms,public.lfg_requests,public.lfg_reports,public.lfg_blocks,public.lfg_moderation_actions,lfg_private.events,lfg_private.audit,lfg_private.attempts,lfg_private.restrictions cascade")
 await admin.query("update lfg_private.settings set enabled=true,creation_enabled=true,legal_reviewed=true,moderation_ready=true,age_providers=array['fixture-only']")
 await admin.query("update lfg_private.age_assurances set revoked_at=null,valid_until=clock_timestamp()+interval '1 day'")
 await admin.query('delete from auth.sessions')
 for(const id of Object.values(ids)) await admin.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[id],id])
 await admin.query('update auth.users set banned_until=null')
}
const create = {game_id:'valorant',platform:'pc',region:'br',game_mode:'competitive',rank_info:'unranked',microphone_required:true,crossplay:false,discord_username:'fixture.host'}
let a,b,c,d,other,lock
async function room() { return (await rpc(a,ids.A,'create',create)).id }
async function request(r, client=b, user=ids.B) {
 await rpc(client,user,'request',{room_id:r,platform:'pc',discord_username:'fixture.requester',consent:true})
 return (await rpc(client,user,'requests'))[0].id
}
async function reservation() { const r=await room(),q=await request(r); await rpc(a,ids.A,'accept',{room_id:r,request_id:q}); return {r,q} }
async function waitForLock(client) {
 for(let i=0;i<200;i++) {
  if((await admin.query("select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",[client.processID])).rowCount) return
  await delay(10)
 }
 throw new Error('Expected independent connection lock wait was not observed')
}
async function holdRoom(r, fn) {
 await lock.query('begin'); await lock.query('select id from public.lfg_rooms where id=$1 for update',[r])
 try { await fn() } finally { await lock.query('rollback') }
}
async function holdApi(fn) {
 await lock.query('begin'); await lock.query("select pg_advisory_xact_lock(hashtextextended('xensi:lfg:transaction',0))")
 try { await fn() } finally { await lock.query('rollback') }
}
async function delayed(r, client, user, action, payload, mutate) {
 let pending
 await holdRoom(r, async() => {
  pending=rpc(client,user,action,{room_id:r,...payload}).then(value=>({value}),error=>({error:error.message}))
  await waitForLock(client); await mutate()
 })
 return pending
}
try {
 await server.initialise(); await server.start(); started=true
 admin=await connect()
 await admin.query(await readFile(new URL('./fixtures/squad-local.sql',import.meta.url),'utf8'))
 for(const file of ['20261011163626_squad_finder_v1.sql','20261011173736_squad_finder_security_hardening.sql'])
  await admin.query(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 for(const [name,id] of Object.entries(ids)) {
  await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id])
  await admin.query('insert into public.profiles values($1,$2,null)',[id,'Fixture '+name])
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[id],id])
 }
 await admin.query('insert into lfg_private.moderators values($1)',[ids.M])
 a=await connect();b=await connect();c=await connect();d=await connect();other=await connect();lock=await connect()
 const gates=(await rpc(a,ids.A,'access'))
 assert.equal(gates.enabled,false);assert.equal(gates.eligible,false)
 console.log('PASS migration defaults disabled; seven independent connections')
 await admin.query("update lfg_private.settings set age_providers=array['fixture-only']")
 for(const id of Object.values(ids))await admin.query("select public.xensi_lfg_record_age($1,'fixture-only','synthetic-local',clock_timestamp()+interval '1 day')",[id])
 await check('RLS, direct table grants, private helpers and age issuance deny clients', async() => {
  const tables=(await admin.query("select schemaname,tablename,rowsecurity from pg_tables where schemaname='lfg_private' or (schemaname='public' and tablename like 'lfg_%')")).rows
  assert.ok(tables.length>=14);assert.ok(tables.every(t=>t.rowsecurity))
  for(const role of ['anon','authenticated']) {
   await c.query('begin');await c.query('set local role '+role)
   for(const t of tables) {
    await c.query('savepoint denied')
    await assert.rejects(c.query(`select * from "${t.schemaname}"."${t.tablename}"`),e=>e.code==='42501')
    await c.query('rollback to denied')
   }
   await c.query('rollback')
  }
  const privileges=(await admin.query("select has_function_privilege('authenticated','lfg_private.api_core(text,jsonb,uuid)','execute') core,has_function_privilege('authenticated','lfg_private.session_valid(uuid)','execute') session,has_function_privilege('authenticated','public.xensi_lfg_record_age(uuid,text,text,timestamptz)','execute') age")).rows[0]
  assert.deepEqual(privileges,{core:false,session:false,age:false})
 })
 await check('IDOR: third party and requester cannot manage host objects or read contacts',async()=>{
  const r=await room(),q=await request(r)
  for(const action of ['accept','decline','confirm','release','cancel','host_contact'])
   await assert.rejects(rpc(c,ids.C,action,{room_id:r,request_id:q}),/lfg_forbidden/)
  for(const action of ['accept','confirm'])await assert.rejects(rpc(b,ids.B,action,{room_id:r,request_id:q}),/lfg_forbidden/)
  assert.deepEqual(await rpc(c,ids.C,'requests',{room_id:r}),[])
  assert.equal((await rpc(a,ids.A,'requests',{room_id:r}))[0].discord_username,'fixture.requester')
  assert.equal((await rpc(a,ids.A,'host_contact',{room_id:r})).discord_username,'fixture.host')
 })
 await check('two independent approvals and duplicate retry reserve exactly one slot',async()=>{
  const r=await room(),q1=await request(r),q2=await request(r,c,ids.C)
  const outcomes=await Promise.allSettled([rpc(a,ids.A,'accept',{room_id:r,request_id:q1}),rpc(other,ids.A,'accept',{room_id:r,request_id:q2})])
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1)
  const winner=(await admin.query("select id,requester_user_id from public.lfg_requests where status='accepted'")).rows
  assert.equal(winner.length,1)
  await assert.rejects(rpc(a,ids.A,'accept',{room_id:r,request_id:winner[0].id}),/lfg_transition/)
  const loser=winner[0].requester_user_id===ids.B?ids.C:ids.B
  await assert.rejects(rpc(d,loser,'host_contact',{room_id:r}),/lfg_forbidden/)
 })
 await check('approve racing cancel leaves no reservation',async()=>{
  const r=await room(),q=await request(r)
  await Promise.allSettled([rpc(a,ids.A,'accept',{room_id:r,request_id:q}),rpc(other,ids.A,'cancel',{room_id:r})])
  const state=(await admin.query('select status,accepted_request_id from public.lfg_rooms where id=$1',[r])).rows[0]
  assert.deepEqual(state,{status:'cancelled',accepted_request_id:null})
 })
 await check('confirmation racing release produces one valid terminal transition',async()=>{
  const {r}=await reservation()
  const outcomes=await Promise.allSettled([rpc(a,ids.A,'confirm',{room_id:r}),rpc(other,ids.A,'release',{room_id:r})])
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1)
  const state=(await admin.query('select status,accepted_request_id from public.lfg_rooms where id=$1',[r])).rows[0]
  assert.ok(['open','closed'].includes(state.status));assert.equal(state.accepted_request_id,null)
 })
 await check('expired locked parent hides requester Discord without physical cleanup',async()=>{
  const r=await room();await request(r)
  await admin.query("update public.lfg_rooms set expires_at=clock_timestamp()-interval '1 second' where id=$1",[r])
  await holdRoom(r,async()=>assert.equal((await rpc(a,ids.A,'requests',{room_id:r}))[0].discord_username,null))
 })
 await check('host contact is denied when reservation expires during real lock wait',async()=>{
  const {r}=await reservation()
  await admin.query("update public.lfg_rooms set reserved_until=clock_timestamp()+interval '400 milliseconds' where id=$1",[r])
  const outcome=await delayed(r,b,ids.B,'host_contact',{},()=>delay(650))
  assert.equal(outcome.error,'lfg_forbidden')
 })
 await check('confirmation denied when reservation expires during lock wait',async()=>{
  const {r}=await reservation()
  await admin.query("update public.lfg_rooms set reserved_until=clock_timestamp()+interval '400 milliseconds' where id=$1",[r])
  assert.equal((await delayed(r,a,ids.A,'confirm',{},()=>delay(650))).error,'lfg_transition')
 })
 await check('approval denied when room expires during lock wait',async()=>{
  const r=await room(),q=await request(r)
  await admin.query("update public.lfg_rooms set expires_at=clock_timestamp()+interval '400 milliseconds' where id=$1",[r])
  assert.equal((await delayed(r,a,ids.A,'accept',{request_id:q},()=>delay(650))).error,'lfg_expired')
 })
 await check('actor suspension committed while waiting prevents new request',async()=>{
  const r=await room()
  const result=await delayed(r,b,ids.B,'request',{platform:'pc',discord_username:'fixture.requester',consent:true},()=>admin.query('insert into lfg_private.restrictions(user_id,suspended) values($1,true)',[ids.B]))
  assert.equal(result.error,'lfg_ineligible');assert.equal((await admin.query('select count(*)::int n from public.lfg_requests')).rows[0].n,0)
 })
 await check('missing, foreign, expired, revoked and banned sessions are rejected',async()=>{
  for(const override of [{session_id:null},{session_id:'bad'},{session_id:sessions[ids.C]},{exp:0}])
   await assert.rejects(rpc(b,ids.B,'access',{},override),/lfg_auth/)
  await admin.query('update auth.sessions set not_after=clock_timestamp()-interval \'1 second\' where id=$1',[sessions[ids.B]])
  await assert.rejects(rpc(b,ids.B,'access'),/lfg_auth/)
  await admin.query('update auth.sessions set not_after=null where id=$1',[sessions[ids.B]])
  await admin.query('delete from auth.sessions where id=$1',[sessions[ids.B]])
  await assert.rejects(rpc(b,ids.B,'access'),/lfg_auth/)
  await admin.query('update auth.users set banned_until=clock_timestamp()+interval \'1 day\' where id=$1',[ids.M])
  await assert.rejects(rpc(d,ids.M,'mod_list'),/lfg_auth/)
 })
 await check('session deleted during room lock wait cannot disclose host contact',async()=>{
  const {r}=await reservation()
  assert.equal((await delayed(r,b,ids.B,'host_contact',{},()=>admin.query('delete from auth.sessions where id=$1',[sessions[ids.B]]))).error,'lfg_auth')
 })
 await check('age revoked and feature disabled during wait deny contact',async()=>{
  const {r}=await reservation()
  assert.equal((await delayed(r,b,ids.B,'host_contact',{},()=>admin.query('update lfg_private.age_assurances set revoked_at=clock_timestamp() where user_id=$1',[ids.B]))).error,'lfg_ineligible')
  await admin.query('update lfg_private.age_assurances set revoked_at=null where user_id=$1',[ids.B])
  assert.equal((await delayed(r,b,ids.B,'host_contact',{},()=>admin.query('update lfg_private.settings set enabled=false'))).error,'lfg_ineligible')
 })
 await check('API admission revalidates eligibility after advisory wait',async()=>{
  const r=await room();let pending
  await holdApi(async()=>{pending=rpc(b,ids.B,'request',{room_id:r,platform:'pc',discord_username:'fixture.requester',consent:true}).catch(e=>e.message);await waitForLock(b);await admin.query('update lfg_private.age_assurances set revoked_at=clock_timestamp() where user_id=$1',[ids.B])})
  assert.equal(await pending,'lfg_ineligible')
 })
 await check('blocking and suspension cancel interactions and revoke both contacts',async()=>{
  const {r,q}=await reservation();await rpc(a,ids.A,'block',{room_id:r,request_id:q})
  await assert.rejects(rpc(b,ids.B,'host_contact',{room_id:r}),/lfg_forbidden/)
  assert.equal((await rpc(a,ids.A,'requests',{room_id:r}))[0].discord_username,null)
  await rpc(a,ids.A,'unblock',{id:ids.B})
  await rpc(c,ids.C,'report',{room_id:r,category:'spam'})
  const report=(await rpc(d,ids.M,'mod_list')).reports[0]
  await rpc(d,ids.M,'mod_decide',{report_id:report.id,decision:'suspend',reason:'spam'})
  await assert.rejects(rpc(a,ids.A,'create',create),/lfg_ineligible/)
  assert.equal((await admin.query('select result from public.lfg_moderation_actions')).rows[0].result,'applied')
  await assert.rejects(rpc(c,ids.C,'mod_decide',{report_id:report.id,decision:'restore',reason:'spam'}),/lfg_forbidden/)
 })
 await check('failed attempts survive rollback and concurrent connections share limiter',async()=>{
  await admin.query('truncate lfg_private.attempts')
  for(let i=0;i<30;i++)await assert.rejects(rpc(c,ids.C,'host_contact',{room_id:randomUUID()}),/lfg_unavailable/)
  await assert.rejects(rpc(other,ids.C,'host_contact',{room_id:randomUUID()}),/lfg_rate_limit/)
  assert.equal((await admin.query('select count(*)::int n from lfg_private.attempts where user_id=$1',[ids.C])).rows[0].n,30)
  await admin.query('truncate lfg_private.attempts')
  for(let i=0;i<60;i++)await rpc(c,ids.C,'list')
  await assert.rejects(rpc(other,ids.C,'list'),/lfg_rate_limit/)
 })
 await check('malicious structured inputs return generic errors and no sensitive DTO fields',async()=>{
  for(const discord of ['<script>alert(1)</script>','https://evil.invalid','a'.repeat(9000),'user\u200bname'])
   await assert.rejects(rpc(a,ids.A,'create',{...create,discord_username:discord}),/lfg_invalid/)
  const r=await room()
  await assert.rejects(rpc(b,ids.B,'request',{room_id:r,platform:'pc',discord_username:'fixture.requester',consent:'true'}),/lfg_consent/)
  const data=JSON.stringify(await rpc(c,ids.C,'list'))
  for(const field of ['fixture.host','email','evidence_reference','access_token','host_user_id'])assert.ok(!data.includes(field))
  assert.equal((await admin.query("select count(*)::int n from pg_publication_tables where schemaname='lfg_private' or tablename like 'lfg_%'")).rows[0].n,0)
 })
 console.log(`${passed+1} native PostgreSQL security checks passed. Auth claims are synthetic; HTTP signature verification remains staging-only.`)
} finally {
 for(const client of clients)await client.end()
 if(started)await server.stop()
 assert.equal(dirname(resolve(dir)),resolve(tmpdir()))
 await rm(dir,{recursive:true,force:true})
}
