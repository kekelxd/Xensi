// Focused release-gate test. Disposable PostgreSQL/PGlite; no hosted connection.
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const db = new PGlite()
const ids = ['A','B','C','D'].map((_, i) => `10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const [host, guest, outsider, newcomer] = ids
async function rpc(user, action, payload = {}) {
 await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:user,role:'authenticated',session_id:user,exp:Math.floor(Date.now()/1000)+3600})])
 await db.exec('set role authenticated')
 try {
  const result = (await db.query('select public.xensi_lfg($1,$2::jsonb,$3::uuid) result',[action,JSON.stringify(payload),user])).rows[0].result
  if(result?.error) throw new Error(result.error)
  return result
 } finally { await db.exec('reset role') }
}
try {
 await db.exec(await readFile(new URL('./fixtures/squad-local.sql',import.meta.url),'utf8'))
 await db.exec("alter table auth.users add column created_at timestamptz not null default '2026-10-01 00:00:00+00'")
 for(const file of ['20261011163626_squad_finder_v1.sql','20261011173736_squad_finder_security_hardening.sql','20261011180903_squad_finder_controlled_testing.sql','20261011182551_squad_finder_remove_age_gate.sql']) {
  await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 }
 for(const [i,id] of ids.entries()) {
  await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id])
  await db.query('insert into public.profiles values($1,$2,null)',[id,'Fixture '+i])
  await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id])
 }
 assert.equal((await rpc(host,'access')).eligible,false)
 assert.equal((await db.query('select count(*)::int n from lfg_private.test_accounts')).rows[0].n,0)
 console.log('PASS four migrations apply; homologation defaults deny everyone')

 await db.exec("update lfg_private.settings set test_enabled=true,test_creation_enabled=true")
 for(const id of [host,guest,newcomer]) await db.query("insert into lfg_private.test_accounts(user_id,approved_by,approval_reference,valid_until) values($1,'fixture-admin','synthetic-approval',clock_timestamp()+interval '1 day')",[id])
 const access = await rpc(host,'access')
 assert.equal(access.eligible,true)
 assert.equal('age_verified' in access,false)
 assert.equal((await db.query('select count(*)::int n from lfg_private.age_assurances')).rows[0].n,0)
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[guest])
 assert.equal((await rpc(guest,'access')).eligible,false)
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[guest])
 console.log('PASS authorization needs no age record; email confirmation still required')

 await db.query("update auth.users set created_at='2026-10-12 00:00:00+00' where id=$1",[newcomer])
 assert.equal((await rpc(host,'access')).eligible,true)
 assert.equal((await rpc(outsider,'access')).eligible,false)
 assert.equal((await rpc(newcomer,'access')).eligible,false)
 await assert.rejects(rpc(outsider,'list'),/lfg_ineligible/)
 console.log('PASS account outside allowlist and new registration remain denied')

 await db.exec("update lfg_private.settings set enabled=true,legal_reviewed=true,moderation_ready=true,creation_enabled=true")
 assert.equal((await rpc(outsider,'access')).eligible,false)
 await db.exec("update lfg_private.settings set enabled=false,legal_reviewed=false,moderation_ready=false,creation_enabled=false")
 console.log('PASS homologation mode cannot become public through production flags')

 const room=(await rpc(host,'create',{game_id:'valorant',platform:'pc',region:'br',game_mode:'competitive',rank_info:'unranked',microphone_required:true,crossplay:false,discord_username:'fixture.host'})).id
 await rpc(guest,'request',{room_id:room,platform:'pc',discord_username:'fixture.guest',consent:true})
 const request=(await rpc(host,'requests',{room_id:room}))[0].id
 await rpc(host,'accept',{room_id:room,request_id:request})
 assert.equal((await rpc(guest,'host_contact',{room_id:room})).discord_username,'fixture.host')
 console.log('PASS authorized accounts create, request, accept and fetch contact without age records')

 await db.query('update lfg_private.test_accounts set revoked_at=clock_timestamp() where user_id=$1',[guest])
 await assert.rejects(rpc(guest,'host_contact',{room_id:room}),/lfg_ineligible/)
 await db.query('update lfg_private.test_accounts set revoked_at=null where user_id=$1',[guest])
 await db.query("update lfg_private.test_accounts set valid_until=clock_timestamp()-interval '1 second',approved_at=clock_timestamp()-interval '1 day' where user_id=$1",[guest])
 assert.equal((await rpc(guest,'access')).eligible,false)
 await db.query("update lfg_private.test_accounts set approved_at=clock_timestamp(),valid_until=clock_timestamp()+interval '1 day' where user_id=$1",[guest])
 await db.query('insert into lfg_private.restrictions(user_id,suspended) values($1,true)',[guest])
 assert.equal((await rpc(guest,'access')).eligible,false)
 console.log('PASS authorization revocation, expiry and suspension remove access')

 await db.query('insert into lfg_private.moderators values($1)',[host])
 await rpc(host,'mod_capacity',{enabled:false})
 assert.equal((await rpc(host,'access')).creation_enabled,false)
 const flags=(await db.query('select enabled,creation_enabled,legal_reviewed,moderation_ready from lfg_private.settings')).rows[0]
 assert.ok(Object.values(flags).every(value=>value===false))
 await db.exec('update lfg_private.settings set test_enabled=false')
 assert.equal((await rpc(host,'access')).eligible,false)
 console.log('PASS test creation pause and kill switch preserve closed production gates')

 await db.exec('set role authenticated')
 await assert.rejects(db.query('select * from lfg_private.test_accounts'),/permission denied/)
 await assert.rejects(db.query("insert into lfg_private.test_accounts(user_id,approved_by,approval_reference,valid_until) values($1,'client','self-declared',clock_timestamp()+interval '1 day')",[outsider]),/permission denied/)
 console.log('PASS client cannot read or grant test authorization')
 await db.exec('reset role; set role anon')
 await assert.rejects(db.query("select public.xensi_lfg('access','{}',null)"),/permission denied/)
 console.log('PASS unsigned-in guest cannot call the Squad API; 9 focused checks passed')
 await db.exec('reset role')
 await db.exec(await readFile(new URL('../supabase/migrations/20261011184403_squad_finder_registered_access.sql',import.meta.url),'utf8'))
 assert.equal((await rpc(outsider,'access')).eligible,true)
 assert.equal((await rpc(newcomer,'access')).eligible,true)
 await rpc(outsider,'create',{game_id:'valorant',platform:'pc',region:'br',game_mode:'competitive',rank_info:'unranked',microphone_required:true,crossplay:false,discord_username:'fixture.registered'})
 assert.equal((await rpc(guest,'access')).eligible,false)
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[newcomer])
 assert.equal((await rpc(newcomer,'access')).eligible,false)
 console.log('PASS registered release admits confirmed accounts without allowlist; suspension and email gates remain')
 await db.exec("update lfg_private.settings set creation_enabled=false")
 await assert.rejects(rpc(outsider,'create',{game_id:'valorant',platform:'pc',region:'br',game_mode:'competitive',rank_info:'unranked',microphone_required:true,crossplay:false,discord_username:'fixture.registered'}),/lfg_creation_disabled/)
 await db.exec('update lfg_private.settings set enabled=false')
 await assert.rejects(rpc(outsider,'list'),/lfg_ineligible/)
 console.log('PASS registered release preserves creation pause and module kill switch')
 await db.exec('set role anon')
 await assert.rejects(db.query("select public.xensi_lfg('access','{}',null)"),/permission denied/)
 await db.exec('reset role; set role authenticated')
 await db.query("select set_config('request.jwt.claims','{}',false)")
 assert.equal((await db.query("select public.xensi_lfg('access','{}',null) result")).rows[0].result.error,'lfg_auth')
 console.log('PASS registered release denies anonymous calls and missing sessions; 12 focused checks passed')
} finally { await db.close() }
