-- Squad Finder V1. Disabled until legal review, real age assurance and moderation.
create schema if not exists lfg_private;
revoke all on schema lfg_private from public, anon, authenticated;
grant usage on schema lfg_private to authenticated, service_role;

create table lfg_private.settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  creation_enabled boolean not null default false,
  legal_reviewed boolean not null default false,
  moderation_ready boolean not null default false,
  age_providers text[] not null default '{}',
  room_minutes integer not null default 30 check (room_minutes between 5 and 60),
  reservation_minutes integer not null default 10 check (reservation_minutes between 1 and 20)
);
insert into lfg_private.settings default values;
create table lfg_private.age_assurances (
  user_id uuid primary key references auth.users on delete cascade,
  provider text not null,
  evidence_reference text not null check (length(evidence_reference) between 1 and 200),
  verified_at timestamptz not null default now(),
  valid_until timestamptz not null,
  revoked_at timestamptz,
  check (valid_until > verified_at)
);
create table lfg_private.moderators (user_id uuid primary key references auth.users on delete cascade);
create table lfg_private.restrictions (
  user_id uuid primary key references auth.users on delete cascade,
  publication_restricted boolean not null default false,
  suspended boolean not null default false
);
create table lfg_private.registry (
  game_id text primary key,
  platforms text[] not null,
  modes text[] not null,
  ranks text[] not null
);
insert into lfg_private.registry values
 ('valorant',array['pc','xbox_series','ps5'],array['competitive','unrated'],array['unranked','iron','bronze','silver','gold','platinum','diamond','ascendant','immortal','radiant']),
 ('cs2',array['pc'],array['premier','competitive','wingman'],array['unranked','silver','gold_nova','master_guardian','distinguished','legendary','supreme','global','rating_0_4999','rating_5000_9999','rating_10000_14999','rating_15000_19999','rating_20000_plus']),
 ('fortnite',array['pc','xbox_series','ps5','xbox_one','ps4'],array['battle_royale','zero_build','ranked_br','ranked_zero_build'],array['unranked','bronze','silver','gold','platinum','diamond','elite','champion','unreal']);

create table public.lfg_rooms (
 id uuid primary key default gen_random_uuid(),
 host_user_id uuid not null references public.profiles on delete cascade,
 game_id text not null references lfg_private.registry,
 platform text not null,
 crossplay boolean not null default false,
 region text not null check (region in ('br','na','eu','latam','asia','oce')),
 game_mode text not null,
 rank_info text not null,
 microphone_required boolean not null,
 max_open_slots integer not null default 1 check (max_open_slots=1),
 status text not null default 'open' check (status in ('open','reserved','closed','expired','cancelled')),
 accepted_request_id uuid,
 reserved_until timestamptz,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closed_at timestamptz,
 check ((status='reserved') = (accepted_request_id is not null and reserved_until is not null)),
 check (status='reserved' or (accepted_request_id is null and reserved_until is null))
);
create unique index lfg_one_active_room on public.lfg_rooms(host_user_id) where status in ('open','reserved');
create index lfg_room_listing on public.lfg_rooms(status,created_at desc) where status in ('open','reserved');
create table public.lfg_requests (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.lfg_rooms on delete cascade,
 requester_user_id uuid not null references public.profiles on delete cascade,
 platform text not null,
 status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn','cancelled','joined')),
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 joined_at timestamptz,
 unique(room_id,requester_user_id),
 unique(room_id,id)
);
alter table public.lfg_rooms add constraint lfg_accepted_request_room_fk foreign key (id,accepted_request_id) references public.lfg_requests(room_id,id) deferrable initially deferred;
create unique index lfg_one_accepted on public.lfg_requests(room_id) where status='accepted';
create index lfg_request_owner on public.lfg_requests(requester_user_id,requested_at desc);
create table public.lfg_room_contacts (
 room_id uuid primary key references public.lfg_rooms on delete cascade,
 discord_username text not null check (discord_username ~ '^[a-z0-9_.]{2,32}$' and position('..' in discord_username)=0)
);
create table public.lfg_request_contacts (
 request_id uuid primary key references public.lfg_requests on delete cascade,
 discord_username text not null check (discord_username ~ '^[a-z0-9_.]{2,32}$' and position('..' in discord_username)=0)
);
create table public.lfg_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_user_id uuid not null references auth.users on delete cascade,
 reported_user_id uuid not null references auth.users on delete cascade,
 room_id uuid not null references public.lfg_rooms on delete cascade,
 category text not null check (category in ('harassment','abuse','spam','suspicious','privacy','other')),
 created_at timestamptz not null default now(),
 status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
 unique(reporter_user_id,reported_user_id,room_id,category),
 check(reporter_user_id<>reported_user_id)
);
create table public.lfg_blocks (
 blocker_user_id uuid not null references auth.users on delete cascade,
 blocked_user_id uuid not null references auth.users on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_user_id,blocked_user_id),
 check(blocker_user_id<>blocked_user_id)
);
create index lfg_blocks_reverse on public.lfg_blocks(blocked_user_id,blocker_user_id);
create table public.lfg_moderation_actions (
 id uuid primary key default gen_random_uuid(),
 moderator_id uuid not null references auth.users,
 target_user_id uuid references auth.users on delete set null,
 report_id uuid references public.lfg_reports on delete set null,
 action_type text not null,
 reason text not null check(reason in ('harassment','abuse','spam','suspicious','privacy','other','capacity')),
 created_at timestamptz not null default now()
);
create table lfg_private.events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 kind text not null,
 room_id uuid references public.lfg_rooms on delete cascade,
 created_at timestamptz not null default now()
);
create index lfg_events_user_time on lfg_private.events(user_id,created_at desc);
create table lfg_private.audit (
 user_id uuid not null references auth.users on delete cascade,
 action text not null,
 created_at timestamptz not null default now()
);
create index lfg_audit_rate on lfg_private.audit(user_id,action,created_at);

-- No direct table grants, including SELECT on contacts. All client writes are RPCs.
do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname='lfg_private' or (schemaname='public' and tablename like 'lfg_%') loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('revoke all on %I.%I from public,anon,authenticated',t.schemaname,t.tablename);
 end loop;
end $$;

create function lfg_private.eligible(u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users a join lfg_private.age_assurances v on v.user_id=a.id
 cross join lfg_private.settings s
 where a.id=u and a.email_confirmed_at is not null and not coalesce(a.is_anonymous,false)
 and v.revoked_at is null and v.valid_until>now() and v.provider=any(s.age_providers)
 and s.enabled and s.legal_reviewed and s.moderation_ready)
 and not exists(select 1 from lfg_private.restrictions where user_id=u and suspended);
$$;
create function lfg_private.blocked(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.lfg_blocks where (blocker_user_id=a and blocked_user_id=b) or (blocker_user_id=b and blocked_user_id=a));
$$;
create function lfg_private.notify(u uuid,k text,r uuid) returns void language sql set search_path='' as $$
 insert into lfg_private.events(user_id,kind,room_id) values(u,k,r);
$$;
create function lfg_private.finish(r uuid,s text) returns void language plpgsql set search_path='' as $$
begin
 insert into lfg_private.events(user_id,kind,room_id) select requester_user_id,'room_'||s,room_id from public.lfg_requests where room_id=r and status in ('pending','accepted');
 update public.lfg_requests set status='cancelled',reviewed_at=now() where room_id=r and status in ('pending','accepted');
 update public.lfg_rooms set status=s,accepted_request_id=null,reserved_until=null,closed_at=now(),updated_at=now() where id=r;
end $$;
create function lfg_private.release(r uuid,k text) returns void language plpgsql set search_path='' as $$
declare q public.lfg_requests;
begin
 select * into q from public.lfg_requests where room_id=r and status='accepted';
 if q.id is not null then
  update public.lfg_requests set status='cancelled',reviewed_at=now() where id=q.id;
  perform lfg_private.notify(q.requester_user_id,k,r);
 end if;
 update public.lfg_rooms set status='open',accepted_request_id=null,reserved_until=null,updated_at=now() where id=r;
end $$;
create function lfg_private.sweep() returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare r public.lfg_rooms;
begin
 for r in select * from public.lfg_rooms where status in ('open','reserved') and (expires_at<=now() or reserved_until<=now()) order by id for update skip locked loop
  if r.expires_at<=now() then perform lfg_private.finish(r.id,'expired');
  else perform lfg_private.release(r.id,'reservation_expired'); perform lfg_private.notify(r.host_user_id,'reservation_expired',r.id); end if;
 end loop;
 -- Contacts disappear after finalization; a reservation grants temporary access only.
 delete from public.lfg_room_contacts c using public.lfg_rooms r where c.room_id=r.id and r.status in ('closed','cancelled','expired');
 delete from public.lfg_request_contacts c using public.lfg_requests q where c.request_id=q.id and q.status not in ('pending','accepted');
 delete from lfg_private.events where created_at<now()-interval '30 days';
 delete from lfg_private.audit where created_at<now()-interval '30 days';
end $$;

create function lfg_private.room_dto(r public.lfg_rooms) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'game_id',r.game_id,'platform',r.platform,'crossplay',r.crossplay,'region',r.region,'game_mode',r.game_mode,'rank_info',r.rank_info,'microphone_required',r.microphone_required,'status',r.status,'slots',case when r.status='open' then 1 else 0 end,'expires_at',r.expires_at,'reserved_until',r.reserved_until,'created_at',r.created_at,'nickname',p.nickname,'avatar_id',p.avatar_id) from public.profiles p where p.id=r.host_user_id;
$$;

-- One private dispatch owner centralizes authorization and permitted state transitions.
create function lfg_private.api(action text,payload jsonb,expected_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare
 u uuid:=auth.uid(); r public.lfg_rooms; q public.lfg_requests; g lfg_private.registry;
 s lfg_private.settings; moderator boolean; target uuid; result jsonb; rid uuid;
 off integer:=greatest(0,least(coalesce((payload->>'offset')::integer,0),10000));
begin
 if u is null or u is distinct from expected_user_id then raise exception 'lfg_auth'; end if;
 perform set_config('response.headers','[{"Cache-Control":"no-store, private"}]',true);
 select * into s from lfg_private.settings;
 moderator:=exists(select 1 from lfg_private.moderators m join auth.users a on a.id=m.user_id where m.user_id=u and a.email_confirmed_at is not null and not coalesce(a.is_anonymous,false));
 if action='access' then
  return jsonb_build_object('eligible',lfg_private.eligible(u),'enabled',s.enabled and s.legal_reviewed and s.moderation_ready,'email_confirmed',exists(select 1 from auth.users where id=u and email_confirmed_at is not null),'age_verified',exists(select 1 from lfg_private.age_assurances where user_id=u and revoked_at is null and valid_until>now() and provider=any(s.age_providers)),'moderator',moderator,'creation_enabled',s.creation_enabled,'publication_restricted',exists(select 1 from lfg_private.restrictions where user_id=u and publication_restricted),'suspended',exists(select 1 from lfg_private.restrictions where user_id=u and suspended));
 end if;
 if action like 'mod_%' then
  if not moderator then raise exception 'lfg_forbidden'; end if;
 elsif not lfg_private.eligible(u) then raise exception 'lfg_ineligible'; end if;
 -- Serialize writes by actor. Room locks below serialize last-slot transitions.
 if action not in ('list','mine','requests','notifications','mod_list','blocks') then
  perform pg_advisory_xact_lock(hashtextextended('lfg:'||u::text,0));
  if (select count(*) from lfg_private.audit where user_id=u and created_at>now()-interval '1 minute')>=30 then raise exception 'lfg_rate_limit'; end if;
 end if;
 perform lfg_private.sweep();
 if action='list' then
  select coalesce(jsonb_agg(lfg_private.room_dto(x)),'[]') into result from
   (select r.* from public.lfg_rooms r where r.status in ('open','reserved') and r.expires_at>now()
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
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'room_id',x.room_id,'status',x.status,'requested_at',x.requested_at,'platform',x.platform,'nickname',x.nickname,'avatar_id',x.avatar_id,'room',lfg_private.room_dto(r),
  'discord_username',case when r.host_user_id=u and x.status in ('pending','accepted') and not lfg_private.blocked(u,x.requester_user_id) and lfg_private.eligible(x.requester_user_id) then c.discord_username else null end)),'[]') into result from
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
   'creation_enabled',s.creation_enabled);
 elsif action='mod_capacity' then
  update lfg_private.settings set creation_enabled=(payload->>'enabled')::boolean;
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
    if exists(select 1 from public.lfg_requests where room_id=r.id and requester_user_id=target and status='accepted') then perform lfg_private.release(r.id,'reservation_cancelled'); end if;
    update public.lfg_requests set status='cancelled',reviewed_at=now() where room_id=r.id and requester_user_id=target and status='pending';
   end loop;
  end if;
  update public.lfg_reports set status=case when payload->>'decision'='dismiss' then 'dismissed' else 'resolved' end where id=(payload->>'report_id')::uuid;
  insert into public.lfg_moderation_actions(moderator_id,target_user_id,report_id,action_type,reason) values(u,target,(payload->>'report_id')::uuid,payload->>'decision',payload->>'reason');
 elsif action='unblock' then
  delete from public.lfg_blocks where blocker_user_id=u and blocked_user_id=(payload->>'id')::uuid;
 elsif action='create' then
  if not s.creation_enabled or exists(select 1 from lfg_private.restrictions where user_id=u and publication_restricted) then raise exception 'lfg_creation_disabled'; end if;
  if (select count(*) from lfg_private.audit where user_id=u and action='create' and created_at>now()-interval '1 hour')>=3 then raise exception 'lfg_rate_limit'; end if;
  if exists(select 1 from public.lfg_rooms where host_user_id=u and status in ('open','reserved')) then raise exception 'lfg_active_room'; end if;
  select * into g from lfg_private.registry where game_id=payload->>'game_id';
  if g.game_id is null or not coalesce(payload->>'platform'=any(g.platforms),false) or not coalesce(payload->>'game_mode'=any(g.modes),false) or not coalesce(payload->>'rank_info'=any(g.ranks),false)
   or not coalesce(payload->>'region'=any(array['br','na','eu','latam','asia','oce']),false) or jsonb_typeof(payload->'microphone_required') is distinct from 'boolean' or jsonb_typeof(payload->'crossplay') is distinct from 'boolean' then raise exception 'lfg_invalid'; end if;
  if (g.game_id='valorant' and payload->>'game_mode'='unrated' or g.game_id='fortnite' and payload->>'game_mode' not like 'ranked_%') and payload->>'rank_info'<>'unranked' then raise exception 'lfg_invalid'; end if;
  if g.game_id='cs2' and payload->>'rank_info'<>'unranked' and ((payload->>'game_mode'='premier')<>(payload->>'rank_info' like 'rating_%')) then raise exception 'lfg_invalid'; end if;
  insert into public.lfg_rooms(host_user_id,game_id,platform,crossplay,region,game_mode,rank_info,microphone_required,expires_at)
   values(u,g.game_id,payload->>'platform',(payload->>'crossplay')::boolean,payload->>'region',payload->>'game_mode',payload->>'rank_info',(payload->>'microphone_required')::boolean,now()+make_interval(mins=>s.room_minutes)) returning id into rid;
  insert into public.lfg_room_contacts values(rid,payload->>'discord_username');
  result:=jsonb_build_object('id',rid);
 else
  select * into r from public.lfg_rooms where id=(payload->>'room_id')::uuid for update;
  if r.id is null then raise exception 'lfg_unavailable'; end if;
  -- Sweep may skip a locked row: recheck deadlines after acquiring its lock.
  if r.status in ('open','reserved') and r.expires_at<=now() then perform lfg_private.finish(r.id,'expired'); return jsonb_build_object('error','lfg_expired'); end if;
  if r.status='reserved' and r.reserved_until<=now() then perform lfg_private.release(r.id,'reservation_expired'); select * into r from public.lfg_rooms where id=r.id; end if;
  if action in ('report','block') then
   if u=r.host_user_id then select requester_user_id into target from public.lfg_requests where id=(payload->>'request_id')::uuid and room_id=r.id;
   elsif exists(select 1 from public.lfg_requests where room_id=r.id and requester_user_id=u) or (r.status in ('open','reserved') and r.expires_at>now()) then target:=r.host_user_id;
   end if;
   if target is null or target=u then raise exception 'lfg_forbidden'; end if;
   if action='report' then
    if (select count(*) from lfg_private.audit where user_id=u and action='report' and created_at>now()-interval '1 hour')>=5 then raise exception 'lfg_rate_limit'; end if;
    insert into public.lfg_reports(reporter_user_id,reported_user_id,room_id,category) values(u,target,r.id,payload->>'category');
   else
    insert into public.lfg_blocks values(u,target,now()) on conflict do nothing;
    -- Remove interactions in both directions, locking rooms in stable order.
    for r in select * from public.lfg_rooms z where z.status in ('open','reserved') and z.host_user_id in (u,target) order by id for update loop
     if exists(select 1 from public.lfg_requests where room_id=r.id and requester_user_id in (u,target) and status='accepted') then perform lfg_private.release(r.id,'reservation_cancelled'); end if;
     update public.lfg_requests set status='cancelled',reviewed_at=now() where room_id=r.id and requester_user_id in (u,target) and status='pending';
    end loop;
   end if;
  elsif action='request' then
   if u=r.host_user_id or r.status<>'open' or not lfg_private.eligible(r.host_user_id) or lfg_private.blocked(u,r.host_user_id) then raise exception 'lfg_unavailable'; end if;
   if payload->>'consent' is distinct from 'true' then raise exception 'lfg_consent'; end if;
   select * into g from lfg_private.registry where game_id=r.game_id;
   if not coalesce(payload->>'platform'=any(g.platforms),false) or (payload->>'platform'<>r.platform and (not r.crossplay or (r.game_id='valorant' and (r.platform='pc' or payload->>'platform'='pc')))) then raise exception 'lfg_platform'; end if;
   if exists(select 1 from public.lfg_requests where room_id=r.id and requester_user_id=u) then raise exception 'lfg_duplicate'; end if;
   if (select count(*) from lfg_private.audit where user_id=u and action='request' and created_at>now()-interval '10 minutes')>=5 then raise exception 'lfg_rate_limit'; end if;
   insert into public.lfg_requests(room_id,requester_user_id,platform) values(r.id,u,payload->>'platform') returning id into rid;
   insert into public.lfg_request_contacts values(rid,payload->>'discord_username');
   perform lfg_private.notify(r.host_user_id,'new_request',r.id);
  elsif action='host_contact' then
   if r.status<>'reserved' or not lfg_private.eligible(r.host_user_id) or lfg_private.blocked(u,r.host_user_id) or not exists(select 1 from public.lfg_requests where id=r.accepted_request_id and requester_user_id=u and status='accepted') then raise exception 'lfg_forbidden'; end if;
   select jsonb_build_object('nickname',p.nickname,'discord_username',c.discord_username,'reserved_until',r.reserved_until) into result from public.lfg_room_contacts c join public.profiles p on p.id=r.host_user_id where c.room_id=r.id;
   insert into lfg_private.audit(user_id,action) values(u,action);
   return result;
  elsif action='withdraw' then
   update public.lfg_requests set status='withdrawn',reviewed_at=now() where id=(payload->>'request_id')::uuid and room_id=r.id and requester_user_id=u and status='pending';
   if not found then raise exception 'lfg_transition'; end if;
   perform lfg_private.notify(r.host_user_id,'request_withdrawn',r.id);
  else
   if u<>r.host_user_id then raise exception 'lfg_forbidden'; end if;
   if action in ('accept','decline') then
    select * into q from public.lfg_requests where id=(payload->>'request_id')::uuid and room_id=r.id for update;
    if q.id is null or q.status<>'pending' or r.status not in ('open','reserved') then raise exception 'lfg_transition'; end if;
    if action='accept' then
     if r.status<>'open' then raise exception 'lfg_reserved'; end if;
     if not lfg_private.eligible(q.requester_user_id) or lfg_private.blocked(u,q.requester_user_id) then raise exception 'lfg_unavailable'; end if;
     update public.lfg_requests set status='accepted',reviewed_at=now() where id=q.id;
     update public.lfg_rooms set status='reserved',accepted_request_id=q.id,reserved_until=least(expires_at,now()+make_interval(mins=>s.reservation_minutes)),updated_at=now() where id=r.id;
    else update public.lfg_requests set status='declined',reviewed_at=now() where id=q.id; end if;
    perform lfg_private.notify(q.requester_user_id,case when action='accept' then 'request_accepted' else 'request_declined' end,r.id);
   elsif action='release' then
    if r.status<>'reserved' then raise exception 'lfg_transition'; end if;
    perform lfg_private.release(r.id,'reservation_cancelled');
   elsif action='confirm' then
    if r.status<>'reserved' or not exists(select 1 from public.lfg_requests where id=r.accepted_request_id and status='accepted' and lfg_private.eligible(requester_user_id) and not lfg_private.blocked(u,requester_user_id)) then raise exception 'lfg_transition'; end if;
    update public.lfg_requests set status='joined',joined_at=now() where id=r.accepted_request_id;
    perform lfg_private.notify((select requester_user_id from public.lfg_requests where id=r.accepted_request_id),'joined',r.id);
    perform lfg_private.finish(r.id,'closed');
   elsif action='cancel' then
    if r.status not in ('open','reserved') then raise exception 'lfg_transition'; end if;
    perform lfg_private.finish(r.id,'cancelled');
   else raise exception 'lfg_invalid'; end if;
  end if;
 end if;
 insert into lfg_private.audit(user_id,action) values(u,action);
 perform lfg_private.sweep();
 return coalesce(result,'{}');
end $$;

-- Invoker wrapper exposes no privileged ownership; only guarded private dispatcher.
create function public.xensi_lfg(action text,payload jsonb default '{}',expected_user_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select lfg_private.api(action,payload,expected_user_id); $$;

-- Adapter contract: only a trusted provider webhook, after signature/event/subject
-- validation, may call this. No document images or birth date are stored.
create function public.xensi_lfg_record_age(user_id uuid,provider text,evidence_reference text,valid_until timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from lfg_private.settings s where provider=any(s.age_providers)) or valid_until<=now() or valid_until>now()+interval '1 year' then raise exception 'lfg_invalid_age_evidence'; end if;
 insert into lfg_private.age_assurances values(user_id,provider,evidence_reference,now(),valid_until,null)
 on conflict on constraint age_assurances_pkey do update set provider=excluded.provider,evidence_reference=excluded.evidence_reference,verified_at=now(),valid_until=excluded.valid_until,revoked_at=null;
end $$;

-- Strict defense-in-depth policies (tables still have no generic client grants).
create policy lfg_rooms_own on public.lfg_rooms for select to authenticated using (host_user_id=(select auth.uid()) and lfg_private.eligible((select auth.uid())));
create policy lfg_requests_own on public.lfg_requests for select to authenticated using (requester_user_id=(select auth.uid()) and lfg_private.eligible((select auth.uid())));
create policy lfg_blocks_own on public.lfg_blocks for select to authenticated using (blocker_user_id=(select auth.uid()) and lfg_private.eligible((select auth.uid())));
-- Contacts, reports, moderation and assurance tables intentionally have no policies.
revoke all on all functions in schema lfg_private from public,anon,authenticated;
grant execute on function lfg_private.api(text,jsonb,uuid),lfg_private.eligible(uuid) to authenticated;
revoke all on function public.xensi_lfg(text,jsonb,uuid),public.xensi_lfg_record_age(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.xensi_lfg(text,jsonb,uuid) to authenticated;
grant execute on function public.xensi_lfg_record_age(uuid,text,text,timestamptz),lfg_private.sweep() to service_role;

-- Install a physical cleanup job when pg_cron is already available. Every RPC also
-- sweeps; all reads and contact authorization check deadlines even without cron.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('xensi-lfg-expiry','* * * * *','select lfg_private.sweep()');
 end if;
end $$;
