-- Squad Finder: 17 competitive games, host-chosen platform, free-text mode/rank,
-- region codes SA/NA/EU/AS/OC and rooms with 1-4 slots (host decides how many).
--
-- Slot model: each accepted request occupies one slot and carries its own reservation
-- deadline (reserved_until). The host confirms every join. A room is 'open' while it has
-- free slots, 'reserved' when every slot is taken but some are still unconfirmed, and
-- 'closed' once every slot is joined (or the host closes it). When the last free slot is
-- accepted, remaining pending requests are declined automatically.

-- ---------------------------------------------------------------- games, text, regions
-- Free text is shown to other players, so keep it short and free of links/contact hints.
create function lfg_private.free_text_ok(t text) returns boolean
language sql immutable set search_path='' as $$
 select t is not null and length(t)<=24 and t !~ '[@#:/\\<>]' and t !~* '(http|www|discord|\.gg|\.com|\.net)'
$$;
revoke all on function lfg_private.free_text_ok(text) from public, anon, authenticated;

alter table public.lfg_rooms drop constraint lfg_rooms_region_check;
update public.lfg_rooms set region=case region when 'br' then 'sa' when 'latam' then 'sa' when 'asia' then 'as' when 'oce' then 'oc' else region end;
alter table public.lfg_rooms add constraint lfg_rooms_region_check check (region in ('sa','na','eu','as','oc'));

update lfg_private.registry set platforms=array['pc','xbox_series','ps5','xbox_one','ps4'];
insert into lfg_private.registry(game_id,platforms,modes,ranks)
select g,array['pc','xbox_series','ps5','xbox_one','ps4'],array[]::text[],array[]::text[]
from unnest(array['rainbow6','cod','apex','pubg','overwatch2','marvel_rivals','delta_force','the_finals','battlefield6','lol','dota2','deadlock','rocket_league','ea_fc']) g
on conflict (game_id) do nothing;

-- ---------------------------------------------------------------- schema for slots
do $$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='public.lfg_rooms'::regclass and contype='c'
  and (pg_get_constraintdef(oid) ilike '%max_open_slots%' or pg_get_constraintdef(oid) ilike '%accepted_request_id%') loop
  execute format('alter table public.lfg_rooms drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.lfg_rooms add constraint lfg_rooms_slots_check check (max_open_slots between 1 and 4);
alter table public.lfg_rooms drop constraint lfg_accepted_request_room_fk;
drop index public.lfg_one_accepted;

alter table public.lfg_requests add column reserved_until timestamptz;
update public.lfg_requests q set reserved_until=r.reserved_until from public.lfg_rooms r where r.id=q.room_id and q.status='accepted';
update public.lfg_rooms set accepted_request_id=null,reserved_until=null;
alter table public.lfg_requests add constraint lfg_request_reservation check ((status='accepted')=(reserved_until is not null) or status in ('joined'));
create index lfg_request_reservation_due on public.lfg_requests(reserved_until) where status='accepted';

-- ---------------------------------------------------------------- helpers
create or replace function lfg_private.room_dto(r public.lfg_rooms) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'game_id',r.game_id,'platform',r.platform,'crossplay',r.crossplay,'region',r.region,'game_mode',r.game_mode,'rank_info',r.rank_info,'microphone_required',r.microphone_required,'status',r.status,
  'capacity',r.max_open_slots,'filled',f.n,'slots',case when r.status='open' then greatest(r.max_open_slots-f.n,0) else 0 end,
  'expires_at',r.expires_at,'reserved_until',f.due,'created_at',r.created_at,'nickname',p.nickname,'avatar_id',p.avatar_id)
 from public.profiles p cross join lateral (select count(*) n, min(q.reserved_until) filter (where q.status='accepted') due from public.lfg_requests q where q.room_id=r.id and q.status in ('accepted','joined')) f
 where p.id=r.host_user_id;
$$;

drop function lfg_private.release(uuid,text);
-- Cancels accepted (unconfirmed) requests, optionally only for the given users, and reopens the room.
create function lfg_private.release(r uuid,k text,only_users uuid[] default null) returns void language plpgsql set search_path='' as $$
declare q record;
begin
 for q in select id,requester_user_id from public.lfg_requests where room_id=r and status='accepted' and (only_users is null or requester_user_id=any(only_users)) order by id for update loop
  update public.lfg_requests set status='cancelled',reserved_until=null,reviewed_at=clock_timestamp() where id=q.id;
  perform lfg_private.notify(q.requester_user_id,k,r);
 end loop;
 update public.lfg_rooms set status='open',updated_at=clock_timestamp() where id=r and status='reserved'
  and max_open_slots>(select count(*) from public.lfg_requests where room_id=r and status in ('accepted','joined'));
end $$;

create function lfg_private.expire_reservations(r uuid) returns void language plpgsql set search_path='' as $$
declare q record; host uuid;
begin
 select host_user_id into host from public.lfg_rooms where id=r;
 for q in select id,requester_user_id from public.lfg_requests where room_id=r and status='accepted' and reserved_until<=clock_timestamp() order by id for update loop
  update public.lfg_requests set status='cancelled',reserved_until=null,reviewed_at=clock_timestamp() where id=q.id;
  perform lfg_private.notify(q.requester_user_id,'reservation_expired',r);
  perform lfg_private.notify(host,'reservation_expired',r);
 end loop;
 update public.lfg_rooms set status='open',updated_at=clock_timestamp() where id=r and status='reserved'
  and max_open_slots>(select count(*) from public.lfg_requests where room_id=r and status in ('accepted','joined'));
end $$;

create or replace function lfg_private.finish(r uuid,s text) returns void language plpgsql set search_path='' as $$
begin
 insert into lfg_private.events(user_id,kind,room_id) select requester_user_id,'room_'||s,room_id from public.lfg_requests where room_id=r and status in ('pending','accepted');
 update public.lfg_requests set status='cancelled',reserved_until=null,reviewed_at=now() where room_id=r and status in ('pending','accepted');
 update public.lfg_rooms set status=s,accepted_request_id=null,reserved_until=null,closed_at=now(),updated_at=now() where id=r;
end $$;

create or replace function lfg_private.sweep() returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare r public.lfg_rooms;
begin
 perform pg_advisory_xact_lock(hashtextextended('xensi:lfg:transaction',0));
 for r in select * from public.lfg_rooms z where z.status in ('open','reserved') and (z.expires_at<=clock_timestamp()
   or exists(select 1 from public.lfg_requests q where q.room_id=z.id and q.status='accepted' and q.reserved_until<=clock_timestamp())) order by z.id for update skip locked loop
  if r.expires_at<=clock_timestamp() then perform lfg_private.finish(r.id,'expired');
  else perform lfg_private.expire_reservations(r.id); end if;
 end loop;
 -- Contacts disappear after finalization; a reservation grants temporary access only.
 delete from public.lfg_room_contacts c using public.lfg_rooms r where c.room_id=r.id and r.status in ('closed','cancelled','expired');
 delete from public.lfg_request_contacts c using public.lfg_requests q where c.request_id=q.id and q.status not in ('pending','accepted');
 delete from lfg_private.events where created_at<clock_timestamp()-interval '30 days';
 delete from lfg_private.attempts where created_at<clock_timestamp()-interval '1 day';
 delete from lfg_private.audit where created_at<clock_timestamp()-interval '30 days';
end $$;

-- ---------------------------------------------------------------- dispatcher
create or replace function lfg_private.api_core(action text, payload jsonb, expected_user_id uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
#variable_conflict use_column
declare
 u uuid:=auth.uid(); r public.lfg_rooms; q public.lfg_requests; g lfg_private.registry;
 s lfg_private.settings; moderator boolean; target uuid; result jsonb; rid uuid; slots integer; taken integer;
 off integer:=greatest(0,least(coalesce((payload->>'offset')::integer,0),10000));
begin
 if u is null or u is distinct from expected_user_id then raise exception 'lfg_auth'; end if;
 perform set_config('response.headers','[{"Cache-Control":"no-store, private"}]',true);
 select * into s from lfg_private.settings;
 moderator:=exists(select 1 from lfg_private.moderators m join auth.users a on a.id=m.user_id where m.user_id=u and a.email_confirmed_at is not null and not coalesce(a.is_anonymous,false));
 moderator:=moderator and (not s.test_enabled or lfg_private.eligible(u)); if action='access' then
  return jsonb_build_object('eligible',lfg_private.eligible(u),'enabled',lfg_private.access_enabled(u),'email_confirmed',exists(select 1 from auth.users where id=u and email_confirmed_at is not null),'age_verified',exists(select 1 from lfg_private.age_assurances where user_id=u and revoked_at is null and valid_until>clock_timestamp() and provider=any(s.age_providers)),'moderator',moderator,'creation_enabled',lfg_private.creation_allowed(u),'publication_restricted',exists(select 1 from lfg_private.restrictions where user_id=u and publication_restricted),'suspended',exists(select 1 from lfg_private.restrictions where user_id=u and suspended));
 end if;
 if action like 'mod_%' then
  if not moderator then raise exception 'lfg_forbidden'; end if;
 elsif not lfg_private.eligible(u) then raise exception 'lfg_ineligible'; end if;
 -- Serialize writes by actor. Room locks below serialize last-slot transitions.
 if action not in ('list','mine','requests','notifications','mod_list','blocks') then
  -- Shared API lock already held; no actor/room lock inversion.
  if (select count(*) from lfg_private.audit where user_id=u and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'lfg_rate_limit'; end if;
 end if;
 perform lfg_private.sweep();
 if action='list' then
  select coalesce(jsonb_agg(lfg_private.room_dto(x)),'[]') into result from
   (select r.* from public.lfg_rooms r where r.status in ('open','reserved') and r.expires_at>clock_timestamp()
    and lfg_private.eligible(r.host_user_id) and not lfg_private.blocked(u,r.host_user_id)
    and (coalesce(payload->>'game','')='' or r.game_id=payload->>'game')
    and (coalesce(payload->>'platform','')='' or r.platform=payload->>'platform')
    and (coalesce(payload->>'region','')='' or r.region=payload->>'region')
    and (coalesce(payload->>'mode','')='' or r.game_mode=payload->>'mode')
    order by (r.status='open') desc,r.created_at desc,r.id limit 21 offset off) x;
  return result;
 elsif action='mine' then
  select coalesce(jsonb_agg(lfg_private.room_dto(x)),'[]') into result from
   (select * from public.lfg_rooms where host_user_id=u order by created_at desc,id limit 21 offset off) x;
  return result;
 elsif action='requests' then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'room_id',x.room_id,'status',x.status,'requested_at',x.requested_at,'platform',x.platform,'nickname',x.nickname,'avatar_id',x.avatar_id,'room',lfg_private.room_dto(r),'reserved_until',x.reserved_until,
  'discord_username',case when (r.host_user_id=u or x.requester_user_id=u) and r.status in ('open','reserved') and r.expires_at>clock_timestamp() and (x.status='pending' or (x.status='accepted' and x.reserved_until>clock_timestamp())) and not lfg_private.blocked(u,x.requester_user_id) and lfg_private.eligible(x.requester_user_id) then c.discord_username else null end)),'[]') into result from
   (select q.*,p.nickname,p.avatar_id from public.lfg_requests q join public.lfg_rooms r on r.id=q.room_id join public.profiles p on p.id=q.requester_user_id
    where (payload->>'room_id' is not null and r.id=(payload->>'room_id')::uuid and r.host_user_id=u) or (payload->>'room_id' is null and q.requester_user_id=u)
    order by q.requested_at desc,q.id limit 21 offset off) x
   join public.lfg_rooms r on r.id=x.room_id left join public.lfg_request_contacts c on c.request_id=x.id;
  return result;
 elsif action='notifications' then
  select coalesce(jsonb_agg(to_jsonb(e)-'user_id'),'[]') into result from (select * from lfg_private.events where user_id=u order by created_at desc,id limit 20) e;
  return result;
 elsif action='blocks' then
  select coalesce(jsonb_agg(jsonb_build_object('id',b.blocked_user_id,'nickname',p.nickname,'created_at',b.created_at)),'[]') into result from (select * from public.lfg_blocks where blocker_user_id=u order by created_at desc limit 21 offset off) b join public.profiles p on p.id=b.blocked_user_id;
  return result;
 elsif action='mod_list' then
  return jsonb_build_object('reports',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select r.*,p.nickname from public.lfg_reports r join public.profiles p on p.id=r.reported_user_id where coalesce(payload->>'status','pending')='all' or r.status=payload->>'status' or (payload->>'status' is null and r.status='pending') order by created_at desc limit 21 offset off) x),
   'actions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.lfg_moderation_actions order by created_at desc limit 21 offset off) x),
   'blocks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.lfg_blocks order by created_at desc limit 21 offset off) x),
   'restrictions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select z.*,p.nickname from lfg_private.restrictions z join public.profiles p on p.id=z.user_id order by z.user_id limit 21 offset off) x),
   'creation_enabled',lfg_private.creation_allowed(u));
 elsif action='mod_capacity' then
  update lfg_private.settings set test_creation_enabled=case when test_enabled then (payload->>'enabled')::boolean else test_creation_enabled end, creation_enabled=case when test_enabled then creation_enabled else (payload->>'enabled')::boolean end;
  insert into public.lfg_moderation_actions(moderator_id,action_type,reason) values(u,'creation_'||coalesce(payload->>'enabled','false'),'capacity');
 elsif action='mod_decide' then
  select reported_user_id,room_id into target,rid from public.lfg_reports where id=(payload->>'report_id')::uuid for update;
  if target is null or payload->>'decision' not in ('dismiss','resolve','restrict','suspend','restore','cancel_room') or payload->>'reason' not in ('harassment','abuse','spam','suspicious','privacy','other') then raise exception 'lfg_invalid'; end if;
  if payload->>'decision' in ('restrict','suspend','restore') then
   insert into lfg_private.restrictions(user_id,publication_restricted,suspended) values(target,payload->>'decision'<>'restore',payload->>'decision'='suspend')
    on conflict(user_id) do update set publication_restricted=excluded.publication_restricted,suspended=excluded.suspended;
  end if;
  if payload->>'decision' in ('suspend','cancel_room','restrict') then
   for r in select * from public.lfg_rooms where status in ('open','reserved') and ((payload->>'decision'='cancel_room' and id=rid) or (payload->>'decision' in ('restrict','suspend') and host_user_id=target)) order by id for update loop perform lfg_private.finish(r.id,'cancelled'); end loop;
  end if;
  if payload->>'decision'='suspend' then
   for r in select z.* from public.lfg_rooms z where z.status in ('open','reserved') and exists(select 1 from public.lfg_requests t where t.room_id=z.id and t.requester_user_id=target and t.status in ('pending','accepted')) order by z.id for update loop
    perform lfg_private.release(r.id,'reservation_cancelled',array[target]);
    update public.lfg_requests set status='cancelled',reviewed_at=clock_timestamp() where room_id=r.id and requester_user_id=target and status='pending';
   end loop;
  end if;
  update public.lfg_reports set status=case when payload->>'decision'='dismiss' then 'dismissed' else 'resolved' end where id=(payload->>'report_id')::uuid;
  insert into public.lfg_moderation_actions(moderator_id,target_user_id,report_id,action_type,reason) values(u,target,(payload->>'report_id')::uuid,payload->>'decision',payload->>'reason');
 elsif action='unblock' then
  delete from public.lfg_blocks where blocker_user_id=u and blocked_user_id=(payload->>'id')::uuid;
 elsif action='create' then
  if not lfg_private.creation_allowed(u) or exists(select 1 from lfg_private.restrictions where user_id=u and publication_restricted) then raise exception 'lfg_creation_disabled'; end if;
  if (select count(*) from lfg_private.audit where user_id=u and action='create' and created_at>clock_timestamp()-interval '1 hour')>=3 then raise exception 'lfg_rate_limit'; end if;
  if exists(select 1 from public.lfg_rooms where host_user_id=u and status in ('open','reserved')) then raise exception 'lfg_active_room'; end if;
  select * into g from lfg_private.registry where game_id=payload->>'game_id';
  slots:=case when payload->'slots' is null then 1 when jsonb_typeof(payload->'slots')='number' and (payload->>'slots')::numeric between 1 and 4 and (payload->>'slots')::numeric=trunc((payload->>'slots')::numeric) then (payload->>'slots')::integer else 0 end;
  if g.game_id is null or slots not between 1 and 4 or not coalesce(payload->>'platform'=any(g.platforms),false) or not lfg_private.free_text_ok(payload->>'game_mode') or not lfg_private.free_text_ok(payload->>'rank_info')
   or not coalesce(payload->>'region'=any(array['sa','na','eu','as','oc']),false) or jsonb_typeof(payload->'microphone_required') is distinct from 'boolean' or jsonb_typeof(payload->'crossplay') is distinct from 'boolean' then raise exception 'lfg_invalid'; end if;
  insert into public.lfg_rooms(host_user_id,game_id,platform,crossplay,region,game_mode,rank_info,microphone_required,max_open_slots,expires_at)
   values(u,g.game_id,payload->>'platform',(payload->>'crossplay')::boolean,payload->>'region',payload->>'game_mode',payload->>'rank_info',(payload->>'microphone_required')::boolean,slots,clock_timestamp()+make_interval(mins=>s.room_minutes)) returning id into rid;
  insert into public.lfg_room_contacts values(rid,payload->>'discord_username');
  result:=jsonb_build_object('id',rid);
 else
  select * into r from public.lfg_rooms where id=(payload->>'room_id')::uuid for update;
  if r.id is null then raise exception 'lfg_unavailable'; end if;
  if not lfg_private.session_valid(u) then raise exception 'lfg_auth'; end if;
  if action not like 'mod_%' and not lfg_private.eligible(u) then raise exception 'lfg_ineligible'; end if;
  -- Sweep may skip a locked row: recheck deadlines after acquiring its lock.
  if r.status in ('open','reserved') and r.expires_at<=clock_timestamp() then perform lfg_private.finish(r.id,'expired'); return jsonb_build_object('error','lfg_expired'); end if;
  if r.status='reserved' or exists(select 1 from public.lfg_requests where room_id=r.id and status='accepted' and reserved_until<=clock_timestamp()) then perform lfg_private.expire_reservations(r.id); select * into r from public.lfg_rooms where id=r.id; end if;
  if action in ('report','block') then
   if u=r.host_user_id then select requester_user_id into target from public.lfg_requests where id=(payload->>'request_id')::uuid and room_id=r.id;
   elsif exists(select 1 from public.lfg_requests where room_id=r.id and requester_user_id=u) or (r.status in ('open','reserved') and r.expires_at>clock_timestamp()) then target:=r.host_user_id;
   end if;
   if target is null or target=u then raise exception 'lfg_forbidden'; end if;
   if action='report' then
    if (select count(*) from lfg_private.audit where user_id=u and action='report' and created_at>clock_timestamp()-interval '1 hour')>=5 then raise exception 'lfg_rate_limit'; end if;
    insert into public.lfg_reports(reporter_user_id,reported_user_id,room_id,category) values(u,target,r.id,payload->>'category');
   else
    insert into public.lfg_blocks values(u,target,clock_timestamp()) on conflict do nothing;
    -- Remove interactions in both directions, locking rooms in stable order.
    for r in select * from public.lfg_rooms z where z.status in ('open','reserved') and z.host_user_id in (u,target) order by id for update loop
     perform lfg_private.release(r.id,'reservation_cancelled',array[u,target]);
     update public.lfg_requests set status='cancelled',reviewed_at=clock_timestamp() where room_id=r.id and requester_user_id in (u,target) and status='pending';
    end loop;
   end if;
  elsif action='request' then
   if u=r.host_user_id or r.status<>'open' or not lfg_private.eligible(r.host_user_id) or lfg_private.blocked(u,r.host_user_id) then raise exception 'lfg_unavailable'; end if;
   if payload->'consent' is distinct from 'true'::jsonb then raise exception 'lfg_consent'; end if;
   select * into g from lfg_private.registry where game_id=r.game_id;
   if not coalesce(payload->>'platform'=any(g.platforms),false) then raise exception 'lfg_platform'; end if;
   if exists(select 1 from public.lfg_requests where room_id=r.id and requester_user_id=u) then raise exception 'lfg_duplicate'; end if;
   if (select count(*) from lfg_private.audit where user_id=u and action='request' and created_at>clock_timestamp()-interval '10 minutes')>=5 then raise exception 'lfg_rate_limit'; end if;
   insert into public.lfg_requests(room_id,requester_user_id,platform) values(r.id,u,payload->>'platform') returning id into rid;
   insert into public.lfg_request_contacts values(rid,payload->>'discord_username');
   perform lfg_private.notify(r.host_user_id,'new_request',r.id);
  elsif action='host_contact' then
   select * into q from public.lfg_requests where room_id=r.id and requester_user_id=u and status='accepted' and reserved_until>clock_timestamp();
   if r.status not in ('open','reserved') or r.expires_at<=clock_timestamp() or not lfg_private.eligible(r.host_user_id) or (u<>r.host_user_id and (q.id is null or lfg_private.blocked(u,r.host_user_id))) then raise exception 'lfg_forbidden'; end if;
   select jsonb_build_object('nickname',p.nickname,'discord_username',c.discord_username,'reserved_until',q.reserved_until) into result from public.lfg_room_contacts c join public.profiles p on p.id=r.host_user_id where c.room_id=r.id;
   insert into lfg_private.audit(user_id,action) values(u,action);
   return result;
  elsif action='withdraw' then
   update public.lfg_requests set status='withdrawn',reviewed_at=clock_timestamp() where id=(payload->>'request_id')::uuid and room_id=r.id and requester_user_id=u and status='pending';
   if not found then raise exception 'lfg_transition'; end if;
   perform lfg_private.notify(r.host_user_id,'request_withdrawn',r.id);
  else
   if u<>r.host_user_id then raise exception 'lfg_forbidden'; end if;
   if action in ('accept','decline') then
    select * into q from public.lfg_requests where id=(payload->>'request_id')::uuid and room_id=r.id for update;
    if q.id is null or q.status<>'pending' or r.status not in ('open','reserved') then raise exception 'lfg_transition'; end if;
    if action='accept' then
     select count(*) into taken from public.lfg_requests where room_id=r.id and status in ('accepted','joined');
     if r.status<>'open' or taken>=r.max_open_slots then raise exception 'lfg_reserved'; end if;
     if not lfg_private.eligible(q.requester_user_id) or lfg_private.blocked(u,q.requester_user_id) then raise exception 'lfg_unavailable'; end if;
     update public.lfg_requests set status='accepted',reviewed_at=clock_timestamp(),reserved_until=least(r.expires_at,clock_timestamp()+make_interval(mins=>s.reservation_minutes)) where id=q.id;
     perform lfg_private.notify(q.requester_user_id,'request_accepted',r.id);
     if taken+1>=r.max_open_slots then
      -- Last free slot taken: the room is full and the remaining pending requests are declined.
      update public.lfg_rooms set status='reserved',updated_at=clock_timestamp() where id=r.id;
      perform lfg_private.notify(t.requester_user_id,'request_declined',r.id) from public.lfg_requests t where t.room_id=r.id and t.status='pending' and t.id<>q.id;
      update public.lfg_requests set status='declined',reviewed_at=clock_timestamp() where room_id=r.id and status='pending';
     end if;
    else
     update public.lfg_requests set status='declined',reviewed_at=clock_timestamp() where id=q.id;
     perform lfg_private.notify(q.requester_user_id,'request_declined',r.id);
    end if;
   elsif action='release' then
    select * into q from public.lfg_requests where id=(payload->>'request_id')::uuid and room_id=r.id and status='accepted';
    if q.id is null then raise exception 'lfg_transition'; end if;
    perform lfg_private.release(r.id,'reservation_cancelled',array[q.requester_user_id]);
   elsif action='confirm' then
    select * into q from public.lfg_requests where id=(payload->>'request_id')::uuid and room_id=r.id and status='accepted' and reserved_until>clock_timestamp() for update;
    if q.id is null or r.status not in ('open','reserved') or not lfg_private.eligible(q.requester_user_id) or lfg_private.blocked(u,q.requester_user_id) then raise exception 'lfg_transition'; end if;
    update public.lfg_requests set status='joined',reserved_until=null,joined_at=clock_timestamp() where id=q.id;
    perform lfg_private.notify(q.requester_user_id,'joined',r.id);
    -- Room closes by itself once every slot is a confirmed join.
    if (select count(*) from public.lfg_requests where room_id=r.id and status='joined')>=r.max_open_slots then perform lfg_private.finish(r.id,'closed'); end if;
   elsif action='cancel' then
    if r.status not in ('open','reserved') then raise exception 'lfg_transition'; end if;
    -- Closing with confirmed players is a normal close; with nobody joined it is a cancellation.
    perform lfg_private.finish(r.id,case when exists(select 1 from public.lfg_requests where room_id=r.id and status='joined') then 'closed' else 'cancelled' end);
   else raise exception 'lfg_invalid'; end if;
  end if;
 end if;
 insert into lfg_private.audit(user_id,action) values(u,action);
 perform lfg_private.sweep();
 return coalesce(result,'{}');
end $function$;

revoke all on function lfg_private.release(uuid,text,uuid[]),lfg_private.expire_reservations(uuid),lfg_private.free_text_ok(text) from public,anon,authenticated;
