// Isolated PostgreSQL (PGlite) check of the games + multi-slot migration, on top of the real Squad migrations.
// Never connects to hosted Supabase. pg_cron / pg_net migrations are infrastructure-only and skipped.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
process.on('uncaughtException', e => { console.error(e.message, e.internalQuery ?? '', e.where ?? ''); process.exit(1) })
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create table auth.users(id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean default false, created_at timestamptz default now(), email text, raw_app_meta_data jsonb);
 create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.profiles(id uuid primary key references auth.users, nickname text, avatar_id text);
 alter table public.profiles enable row level security;
 create policy profiles_own on public.profiles to authenticated using(id=auth.uid());
 grant select on public.profiles to authenticated;
`)
for (const f of ['20261011163626_squad_finder_v1','20261011173736_squad_finder_security_hardening','20261011180903_squad_finder_controlled_testing','20261011182551_squad_finder_remove_age_gate','20261011184403_squad_finder_registered_access','20261012190000_squad_finder_games_and_slots'])
 await db.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8'))
console.log('PASS migrations apply in order on PostgreSQL')

const id = n => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const host = id(1), players = [id(2), id(3), id(4), id(5), id(6)], other = id(7)
for (const [i,u] of [host,...players,other].entries()) {
 await db.query(`insert into auth.users values($1,now(),false)`,[u])
 await db.query(`insert into public.profiles values($1,$2,'dog-happy')`,[u,`Player ${i}`])
}
let passed = 0
async function as(user, fn) {
 await db.query('insert into auth.sessions(id,user_id) values($1,$1) on conflict do nothing',[user])
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user])
 await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,role:'authenticated',session_id:user,exp:Math.floor(Date.now()/1000)+3600})])
 await db.exec('set role authenticated')
 try { return await fn() } finally { await db.exec('reset role') }
}
// Frequency limits are covered by test:squad:db; here they would only get in the way of scenario setup.
const rpc = async (user,action,payload={}) => { await db.exec('delete from lfg_private.audit; delete from lfg_private.attempts'); return as(user,async()=>{ const data=(await db.query('select public.xensi_lfg($1,$2::jsonb,$3::uuid) as result',[action,JSON.stringify(payload),user])).rows[0].result; if(data?.error) throw new Error(data.error); return data }) }
async function check(name,fn){ await fn(); passed++; console.log(`PASS ${name}`) }
const fails = (fn,code) => assert.rejects(fn,code)
const create = (extra={}) => ({game_id:'lol',platform:'ps5',region:'sa',game_mode:'Ranked Flex',rank_info:'Ouro II',microphone_required:true,crossplay:true,discord_username:'host.private',slots:3,...extra})
const request = (user,room,extra={}) => rpc(user,'request',{room_id:room,platform:'pc',discord_username:`guest.${user.slice(-2)}`,consent:true,...extra})
const mine = async u => (await rpc(u,'mine'))[0]
const reqs = (u,room) => rpc(u,'requests',room?{room_id:room}:{})
// Each helper test ends with the host room closed so the one-active-room rule never leaks across scenarios.

await check('all 17 games exist and accept any platform chosen by the host',async()=>{
 const rows=(await db.query(`select game_id,platforms from lfg_private.registry`)).rows
 assert.equal(rows.length,17)
 for (const r of rows) assert.deepEqual([...r.platforms].sort(),['pc','ps4','ps5','xbox_one','xbox_series'])
})
await check('slots must be an integer from 1 to 4',async()=>{
 for (const slots of [0,5,2.5,'3',-1,null]) await fails(()=>rpc(host,'create',create({slots})),/lfg_invalid/)
})
await check('mode/rank are free text but reject links and contact hints',async()=>{
 for (const bad of ['https://x.io','discord.gg','user@mail','a'.repeat(25),'www.site','tag#1234']) {
  await fails(()=>rpc(host,'create',create({game_mode:bad})),/lfg_invalid/)
  await fails(()=>rpc(host,'create',create({rank_info:bad})),/lfg_invalid/)
 }
})
await check('old region names are rejected and new codes accepted',async()=>{
 await fails(()=>rpc(host,'create',create({region:'br'})),/lfg_invalid/)
})
const room = (await rpc(host,'create',create({slots:3}))).id
await check('room exposes capacity, filled and free slots',async()=>{ const m=await mine(host); assert.equal(m.capacity,3); assert.equal(m.filled,0); assert.equal(m.slots,3); assert.equal(m.game_mode,'Ranked Flex') })
await check('request platform is chosen freely and validated against the list',async()=>{
 await fails(()=>request(players[0],room,{platform:'switch'}),/lfg_platform/)
 for (const [i,p] of ['pc','xbox_series','ps4','xbox_one'].entries()) await request(players[i],room,{platform:p})
})
const own = {}
for (const u of players.slice(0,4)) own[u]=(await reqs(u))[0]
await check('first approval keeps the room open with the remaining slots',async()=>{
 await rpc(host,'accept',{room_id:room,request_id:own[players[0]].id})
 const m=await mine(host); assert.equal(m.status,'open'); assert.equal(m.filled,1); assert.equal(m.slots,2)
})
await check('approved player gets the host Discord; pending players do not',async()=>{
 assert.equal((await rpc(players[0],'host_contact',{room_id:room})).discord_username,'host.private')
 await fails(()=>rpc(players[1],'host_contact',{room_id:room}),/lfg_forbidden/)
})
await check('each accepted request has its own deadline',async()=>{
 const list=await reqs(host,room); const a=list.find(q=>q.id===own[players[0]].id); assert.ok(a.reserved_until)
 assert.equal(list.find(q=>q.id===own[players[1]].id).reserved_until,null)
})
await check('filling the last slot reserves the room and declines everyone still pending',async()=>{
 await rpc(host,'accept',{room_id:room,request_id:own[players[1]].id})
 await rpc(host,'accept',{room_id:room,request_id:own[players[2]].id})
 const m=await mine(host); assert.equal(m.status,'reserved'); assert.equal(m.slots,0); assert.equal(m.filled,3)
 assert.equal((await reqs(players[3]))[0].status,'declined')
 assert.ok((await rpc(players[3],'notifications')).some(e=>e.kind==='request_declined'))
})
await check('a full room refuses new requests and extra approvals',async()=>{
 await fails(()=>request(players[4],room),/lfg_unavailable/)
 await fails(()=>rpc(host,'accept',{room_id:room,request_id:own[players[3]].id}),/lfg_transition/)
})
await check('only the host can confirm',()=>fails(()=>rpc(players[1],'confirm',{room_id:room,request_id:own[players[0]].id}),/lfg_forbidden/))
await check('confirming one player joins them without closing the room',async()=>{
 await rpc(host,'confirm',{room_id:room,request_id:own[players[0]].id})
 assert.equal((await reqs(players[0]))[0].status,'joined'); assert.equal((await mine(host)).status,'reserved')
})
await check('an unconfirmed reservation expires and returns the slot',async()=>{
 await db.query(`update public.lfg_requests set reserved_until=now()-interval '1 second' where id=$1`,[own[players[2]].id])
 const m=await mine(host); assert.equal(m.status,'open'); assert.equal(m.slots,1); assert.equal(m.filled,2)
 assert.equal((await reqs(players[2]))[0].status,'cancelled')
 await fails(()=>rpc(players[2],'host_contact',{room_id:room}),/lfg_forbidden/)
 assert.ok((await rpc(host,'notifications')).some(e=>e.kind==='reservation_expired'))
})
await check('manual release frees only that player slot',async()=>{
 await rpc(host,'release',{room_id:room,request_id:own[players[1]].id})
 const m=await mine(host); assert.equal(m.filled,1); assert.equal(m.slots,2); assert.equal((await reqs(players[0]))[0].status,'joined')
})
await check('room closes by itself when every slot is confirmed',async()=>{
 await request(players[4],room); const q=(await reqs(players[4]))[0]
 await rpc(host,'accept',{room_id:room,request_id:q.id})
 await request(other,room); const o=(await reqs(other))[0]
 await rpc(host,'accept',{room_id:room,request_id:o.id})
 assert.equal((await mine(host)).status,'reserved')
 await rpc(host,'confirm',{room_id:room,request_id:q.id}); assert.equal((await mine(host)).status,'reserved')
 await rpc(host,'confirm',{room_id:room,request_id:o.id}); assert.equal((await mine(host)).status,'closed')
 assert.equal((await db.query(`select count(*)::int n from public.lfg_room_contacts where room_id=$1`,[room])).rows[0].n,0)
})
const room2 = (await rpc(host,'create',create({slots:4,game_id:'valorant',platform:'pc'}))).id
await check('host can close a partly filled room: joined players keep the join',async()=>{
 await request(players[0],room2); const q=(await reqs(players[0],null)).find(x=>x.room_id===room2)
 await rpc(host,'accept',{room_id:room2,request_id:q.id}); await rpc(host,'confirm',{room_id:room2,request_id:q.id})
 await request(players[1],room2)
 await rpc(host,'cancel',{room_id:room2})
 assert.equal((await mine(host)).status,'closed')
 assert.equal((await reqs(players[0])).find(x=>x.room_id===room2).status,'joined')
 assert.equal((await reqs(players[1])).find(x=>x.room_id===room2).status,'cancelled')
})
const room3 = (await rpc(host,'create',create({slots:2}))).id
await check('closing a room nobody joined is a cancellation',async()=>{
 await request(players[0],room3); await rpc(host,'cancel',{room_id:room3}); assert.equal((await mine(host)).status,'cancelled')
})
const room4 = (await rpc(host,'create',create({slots:1}))).id
await check('single-slot rooms still work end to end',async()=>{
 await request(players[0],room4); const q=(await reqs(players[0])).find(x=>x.room_id===room4)
 await request(players[1],room4)
 await rpc(host,'accept',{room_id:room4,request_id:q.id})
 assert.equal((await mine(host)).status,'reserved')
 await rpc(host,'confirm',{room_id:room4,request_id:q.id}); assert.equal((await mine(host)).status,'closed')
})
await check('blocking releases the blocked accepted player only',async()=>{
 const r5=(await rpc(host,'create',create({slots:3}))).id
 for (const u of [players[0],players[1]]) await request(u,r5)
 const qs=(await reqs(host,r5)); for (const q of qs) await rpc(host,'accept',{room_id:r5,request_id:q.id})
 await rpc(host,'block',{room_id:r5,request_id:qs.find(q=>q.nickname==='Player 1').id})
 const after=await reqs(host,r5); assert.equal(after.filter(q=>q.status==='accepted').length,1)
 await rpc(host,'cancel',{room_id:r5})
})
await check('ordinary users cannot call the new helpers directly',async()=>{
 for (const fn of ['lfg_private.release(gen_random_uuid(),$$x$$)','lfg_private.expire_reservations(gen_random_uuid())','lfg_private.free_text_ok($$x$$)'])
  await as(players[0],()=>fails(()=>db.query(`select ${fn}`),/permission denied/))
})
console.log(`${passed} slot/game checks passed on PostgreSQL.`)
await db.close()
