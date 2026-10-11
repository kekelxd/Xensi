// Isolated real PostgreSQL engine (PGlite). Never connects to hosted Supabase.
// Install test-only dependency: npm install --no-save --package-lock=false @electric-sql/pglite@0.3.14
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
process.on('uncaughtException', e => { console.error(e.message, e.internalQuery ?? '', e.where ?? ''); process.exit(1) })
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create table auth.users(id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean default false);
 create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.profiles(id uuid primary key references auth.users, nickname text, avatar_id text);
 alter table public.profiles enable row level security;
 create policy profiles_own on public.profiles to authenticated using(id=auth.uid());
 grant select on public.profiles to authenticated;
`)
await db.exec(readFileSync('supabase/migrations/20261011163626_squad_finder_v1.sql','utf8'))
await db.exec(readFileSync('supabase/migrations/20261011173736_squad_finder_security_hardening.sql','utf8'))
console.log('PASS migration applies on PostgreSQL')
const host='10000000-0000-4000-8000-000000000001', a='10000000-0000-4000-8000-000000000002', b='10000000-0000-4000-8000-000000000003', mod='10000000-0000-4000-8000-000000000004', young='10000000-0000-4000-8000-000000000005', unconfirmed='10000000-0000-4000-8000-000000000006'
for (const [i,id] of [host,a,b,mod,young,unconfirmed].entries()) await db.query(`insert into auth.users values($1,case when $2=5 then null else now() end,false);`,[id,i])
for (const [i,id] of [host,a,b,mod,young,unconfirmed].entries()) await db.query(`insert into public.profiles values($1,$2,'dog-happy')`,[id,`Player ${i}`])
await db.query(`insert into lfg_private.moderators values($1)`,[mod])
let passed=0
async function as(user, fn) {
 if(user) await db.query('insert into auth.sessions(id,user_id) values($1,$1) on conflict do nothing',[user])
 await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user ?? ''])
 await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:user,role:'authenticated',session_id:user,exp:Math.floor(Date.now()/1000)+3600})])
 await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
 try { return await fn() } finally { await db.exec('reset role') }
}
const rpc=(user,action,payload={})=>as(user,async()=> {const data=(await db.query('select public.xensi_lfg($1,$2::jsonb,$3::uuid) as result',[action,JSON.stringify(payload),user])).rows[0].result;if(data?.error)throw new Error(data.error);return data})
async function check(name,fn){ await fn(); passed++; console.log(`PASS ${name}`) }
async function fails(fn,code){ await assert.rejects(fn,code) }
const create=(platform='pc',game_id='valorant',extra={})=>({game_id,platform,region:'br',game_mode:'competitive',rank_info:'unranked',microphone_required:true,crossplay:false,discord_username:'host.private',...extra})
await check('anonymous cannot call API',()=>fails(()=>rpc(null,'list'),/permission denied/))
await check('production defaults deny all social access',async()=>{assert.equal((await rpc(host,'access')).eligible,false); await fails(()=>rpc(host,'create',create()),/lfg_ineligible/)})
await db.exec(`update lfg_private.settings set enabled=true,creation_enabled=true,legal_reviewed=true,moderation_ready=true,age_providers=array['test-provider'];`)
for (const id of [host,a,b,mod,unconfirmed]) await db.query(`select public.xensi_lfg_record_age($1,'test-provider','signed-provider-event',now()+interval '1 day')`,[id])
await check('real assurance required; confirmed email alone fails',()=>fails(()=>rpc(young,'list'),/lfg_ineligible/))
await check('unconfirmed email with assurance fails',()=>fails(()=>rpc(unconfirmed,'list'),/lfg_ineligible/))
await check('user cannot write own age assurance',()=>as(a,()=>fails(()=>db.query(`select public.xensi_lfg_record_age($1,'test-provider','fake',now()+interval '1 day')`,[a]),/permission denied/)))
await check('session identity mismatch fails',()=>as(a,async()=>assert.equal((await db.query(`select public.xensi_lfg('list','{}',$1) result`,[host])).rows[0].result.error,'lfg_auth')))
await check('invalid game/platform and rank rejected',async()=>{await fails(()=>rpc(host,'create',create('ps4')),/lfg_invalid/);await fails(()=>rpc(host,'create',create('pc','cs2',{game_mode:'premier',rank_info:'gold_nova'})),/lfg_invalid/)})
await check('Discord rejects arbitrary links and text without raw constraint details',()=>fails(()=>rpc(host,'create',create('pc','valorant',{discord_username:'https://evil.invalid'})),/lfg_invalid/))
const room=(await rpc(host,'create',create())).id
await check('one active room constraint',()=>fails(()=>rpc(host,'create',create()),/lfg_active_room/))
await check('list returns profile nickname with no contacts or owner ids',async()=>{const rooms=await rpc(a,'list');assert.equal(rooms.length,1);assert.equal(rooms[0].nickname,'Player 0');assert.ok(!JSON.stringify(rooms).includes('host.private'));assert.ok(!('host_user_id' in rooms[0]))})
await check('all direct social tables deny client reads/writes',async()=>{for (const table of ['lfg_rooms','lfg_requests','lfg_room_contacts','lfg_request_contacts','lfg_reports','lfg_blocks','lfg_moderation_actions']) await as(b,()=>fails(()=>db.query(`select * from public.${table}`),/permission denied/)); await as(host,()=>fails(()=>db.query(`update public.lfg_rooms set status='closed'`),/permission denied/))})
await check('contact denied before approval',()=>fails(()=>rpc(a,'host_contact',{room_id:room}),/lfg_forbidden/))
await check('request requires explicit consent and compatible platform',async()=>{await fails(()=>rpc(a,'request',{room_id:room,platform:'pc',discord_username:'guest.a'}),/lfg_consent/);await fails(()=>rpc(a,'request',{room_id:room,platform:'ps5',discord_username:'guest.a',consent:true}),/lfg_platform/)})
await rpc(a,'request',{room_id:room,platform:'pc',discord_username:'guest.a',consent:true})
await rpc(b,'request',{room_id:room,platform:'pc',discord_username:'guest.b',consent:true})
const ownA=(await rpc(a,'requests'))[0], ownB=(await rpc(b,'requests'))[0]
await check('duplicate request denied',()=>fails(()=>rpc(a,'request',{room_id:room,platform:'pc',discord_username:'guest.a',consent:true}),/lfg_duplicate/))
await check('only owning requester and room host see requester Discord',async()=>{assert.equal((await rpc(host,'requests',{room_id:room})).find(q=>q.id===ownA.id).discord_username,'guest.a');assert.equal(ownA.discord_username,'guest.a');assert.deepEqual(await rpc(b,'requests',{room_id:room}),[])})
await check('nonhost cannot accept/confirm/cancel',async()=>{for(const action of ['accept','confirm','cancel']) await fails(()=>rpc(b,action,{room_id:room,request_id:ownA.id}),/lfg_forbidden/)})
await check('rapid competing approvals produce only one accepted request',async()=>{const outcomes=await Promise.allSettled([rpc(host,'accept',{room_id:room,request_id:ownA.id}),rpc(host,'accept',{room_id:room,request_id:ownB.id})]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal((await db.query(`select count(*)::int n from public.lfg_requests where status='accepted'`)).rows[0].n,1)})
await check('only approved user can query host contact',async()=>{assert.equal((await rpc(a,'host_contact',{room_id:room})).discord_username,'host.private');await fails(()=>rpc(b,'host_contact',{room_id:room}),/lfg_forbidden/)})
await check('reservation expires and contact access revoked',async()=>{await db.query(`update public.lfg_rooms set reserved_until=now()-interval '1 second' where id=$1`,[room]);assert.equal((await rpc(host,'mine'))[0].status,'open');assert.equal((await rpc(a,'requests'))[0].status,'cancelled');await fails(()=>rpc(a,'host_contact',{room_id:room}),/lfg_forbidden/)})
await rpc(host,'accept',{room_id:room,request_id:ownB.id})
await check('manual release reopens slot within room TTL',async()=>{await rpc(host,'release',{room_id:room});assert.equal((await rpc(host,'mine'))[0].status,'open')})
await rpc(young,'access')
await db.query(`select public.xensi_lfg_record_age($1,'test-provider','signed',now()+interval '1 day')`,[young])
await rpc(young,'request',{room_id:room,platform:'pc',discord_username:'guest.c',consent:true})
const qYoung=(await rpc(young,'requests'))[0]
await check('withdraw pending request notifies host',async()=>{await rpc(young,'withdraw',{room_id:room,request_id:qYoung.id});assert.equal((await rpc(young,'requests'))[0].status,'withdrawn');assert.ok((await rpc(host,'notifications')).some(e=>e.kind==='request_withdrawn'))})
await rpc(unconfirmed,'access')
await db.query(`update auth.users set email_confirmed_at=now() where id=$1`,[unconfirmed])
await rpc(unconfirmed,'request',{room_id:room,platform:'pc',discord_username:'guest.d',consent:true})
const qD=(await rpc(unconfirmed,'requests'))[0]
await check('decline leaves room open and host contact private',async()=>{await rpc(host,'decline',{room_id:room,request_id:qD.id});assert.equal((await rpc(unconfirmed,'requests'))[0].status,'declined');assert.equal((await rpc(host,'mine'))[0].status,'open');await fails(()=>rpc(unconfirmed,'host_contact',{room_id:room}),/lfg_forbidden/)})
// New account for join + pending cancellation.
const joined='10000000-0000-4000-8000-000000000007', pending='10000000-0000-4000-8000-000000000008'
for(const id of [joined,pending]){await db.query(`insert into auth.users values($1,now(),false)`,[id]);await db.query(`insert into public.profiles values($1,'New Player',null)`,[id]);await db.query(`select public.xensi_lfg_record_age($1,'test-provider','signed',now()+interval '1 day')`,[id]);await rpc(id,'request',{room_id:room,platform:'pc',discord_username:'new.player',consent:true})}
const qJ=(await rpc(joined,'requests'))[0]
await rpc(host,'accept',{room_id:room,request_id:qJ.id})
await check('confirm closes room, joins winner and cancels pending',async()=>{await rpc(host,'confirm',{room_id:room});assert.equal((await rpc(host,'mine'))[0].status,'closed');assert.equal((await rpc(joined,'requests'))[0].status,'joined');assert.equal((await rpc(pending,'requests'))[0].status,'cancelled');assert.deepEqual(await rpc(a,'list'),[]);await fails(()=>rpc(host,'release',{room_id:room}),/lfg_transition/);await fails(()=>rpc(joined,'host_contact',{room_id:room}),/lfg_forbidden/)})
const room2=(await rpc(host,'create',create())).id
await check('report is private and moderation rejects ordinary users',async()=>{await rpc(a,'report',{room_id:room2,category:'spam'});await fails(()=>rpc(a,'mod_list'),/lfg_forbidden/);assert.equal((await rpc(mod,'mod_list')).reports.length,1)})
await check('blocking prevents both directions and listing',async()=>{await rpc(a,'block',{room_id:room2});assert.deepEqual(await rpc(a,'list'),[]);await fails(()=>rpc(a,'request',{room_id:room2,platform:'pc',discord_username:'guest.a',consent:true}),/lfg_unavailable/);assert.equal((await rpc(a,'blocks')).length,1);await rpc(a,'unblock',{id:host});assert.equal((await rpc(a,'list')).length,1)})
const report=(await rpc(mod,'mod_list')).reports[0]
await check('moderator suspension cancels room and denies access',async()=>{await rpc(mod,'mod_decide',{report_id:report.id,decision:'suspend',reason:'spam'});assert.equal((await rpc(host,'access')).suspended,true);await fails(()=>rpc(host,'list'),/lfg_ineligible/);assert.equal((await db.query(`select status from public.lfg_rooms where id=$1`,[room2])).rows[0].status,'cancelled')})
await rpc(mod,'mod_decide',{report_id:report.id,decision:'restore',reason:'spam'})
await check('emergency control disables room creation',async()=>{await rpc(mod,'mod_capacity',{enabled:false});await fails(()=>rpc(host,'create',create()),/lfg_creation_disabled/);await rpc(mod,'mod_capacity',{enabled:true})})
const room3=(await rpc(host,'create',create())).id
await check('automatic room expiry removes listing and contacts',async()=>{await db.query(`update public.lfg_rooms set expires_at=now()-interval '1 second' where id=$1`,[room3]);assert.deepEqual(await rpc(a,'list'),[]);assert.equal((await db.query(`select status from public.lfg_rooms where id=$1`,[room3])).rows[0].status,'expired');assert.equal((await db.query(`select count(*)::int n from public.lfg_room_contacts where room_id=$1`,[room3])).rows[0].n,0)})
await check('creation frequency enforced server-side',()=>fails(()=>rpc(host,'create',create()),/lfg_rate_limit/))
await check('request rate enforced independently of frontend',async()=>{await db.query(`insert into lfg_private.audit select $1,'request',now() from generate_series(1,5)`,[a]);const rb=(await rpc(b,'create',create())).id;await fails(()=>rpc(a,'request',{room_id:rb,platform:'pc',discord_username:'guest.a',consent:true}),/lfg_rate_limit/)})
await check('expired or revoked age evidence revokes access',async()=>{await db.query(`update lfg_private.age_assurances set revoked_at=now() where user_id=$1`,[a]);await fails(()=>rpc(a,'list'),/lfg_ineligible/)})
console.log(`${passed} database checks passed; role/RLS and transitions executed on PostgreSQL.`)
await db.close()
