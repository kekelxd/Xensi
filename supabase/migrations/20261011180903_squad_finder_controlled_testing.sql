-- Controlled functional testing only. Production gates and existing data stay intact.
-- Empty allowlist and disabled test flags: applying this file admits nobody.
alter table lfg_private.settings
 add column test_enabled boolean not null default false,
 add column test_creation_enabled boolean not null default false,
 add column test_registration_cutoff timestamptz not null default '2026-10-11 18:09:03+00';

create table lfg_private.test_accounts (
 user_id uuid primary key references auth.users on delete cascade,
 approved_by text not null check(length(btrim(approved_by)) between 3 and 120),
 approval_reference text not null check(length(btrim(approval_reference)) between 3 and 200),
 approved_at timestamptz not null default clock_timestamp(),
 valid_until timestamptz not null,
 revoked_at timestamptz,
 check(valid_until > approved_at and valid_until <= approved_at + interval '30 days')
);
alter table lfg_private.test_accounts enable row level security;
revoke all on lfg_private.test_accounts from public,anon,authenticated,service_role;

create function lfg_private.test_authorized(u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from lfg_private.test_accounts t
 join auth.users a on a.id=t.user_id cross join lfg_private.settings s
 where t.user_id=u and t.revoked_at is null and t.approved_at<=clock_timestamp()
 and t.valid_until>clock_timestamp() and a.created_at<=s.test_registration_cutoff);
$$;

create function lfg_private.access_enabled(u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from lfg_private.settings s where
 case when s.test_enabled then lfg_private.test_authorized(u)
 else s.enabled and s.legal_reviewed and s.moderation_ready end);
$$;

create function lfg_private.creation_allowed(u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from lfg_private.settings s where
 case when s.test_enabled then s.test_creation_enabled and lfg_private.test_authorized(u)
 else s.enabled and s.legal_reviewed and s.moderation_ready and s.creation_enabled end);
$$;

-- Test authorization is additional to trusted adult evidence, never a substitute.
-- User metadata, email confirmation and a self-declaration cannot grant eligibility.
create or replace function lfg_private.eligible(u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from auth.users a
 join lfg_private.age_assurances v on v.user_id=a.id
 cross join lfg_private.settings s
 where a.id=u and a.email_confirmed_at is not null and not coalesce(a.is_anonymous,false)
 and v.revoked_at is null and v.valid_until>clock_timestamp()
 and v.provider=any(s.age_providers) and lfg_private.access_enabled(u))
 and not exists(select 1 from lfg_private.restrictions where user_id=u and suspended);
$$;

-- Preserve the hardened dispatcher body. Patch only its existing release gates.
-- Abort rather than silently accepting a different dispatcher revision.
do $patch$
declare original text; patched text;
begin
 original:=pg_get_functiondef('lfg_private.api_core(text,jsonb,uuid)'::regprocedure);
 if position('s.enabled and s.legal_reviewed and s.moderation_ready' in original)=0
 or position('not s.creation_enabled' in original)=0
 or position('''creation_enabled'',s.creation_enabled' in original)=0
 or position('update lfg_private.settings set creation_enabled=(payload->>''enabled'')::boolean;' in original)=0
 or position('if action=''access'' then' in original)=0
 then raise exception 'Unexpected Squad dispatcher revision; review migration before applying'; end if;
 patched:=replace(original,'s.enabled and s.legal_reviewed and s.moderation_ready','lfg_private.access_enabled(u)');
 patched:=replace(patched,'''creation_enabled'',s.creation_enabled','''creation_enabled'',lfg_private.creation_allowed(u)');
 patched:=replace(patched,'not s.creation_enabled','not lfg_private.creation_allowed(u)');
 patched:=replace(patched,'if action=''access'' then',
 'moderator:=moderator and (not s.test_enabled or lfg_private.eligible(u)); if action=''access'' then');
 patched:=replace(patched,'update lfg_private.settings set creation_enabled=(payload->>''enabled'')::boolean;',
 'update lfg_private.settings set test_creation_enabled=case when test_enabled then (payload->>''enabled'')::boolean else test_creation_enabled end, creation_enabled=case when test_enabled then creation_enabled else (payload->>''enabled'')::boolean end;');
 execute patched;
end $patch$;

revoke all on function lfg_private.test_authorized(uuid),
 lfg_private.access_enabled(uuid),lfg_private.creation_allowed(uuid)
 from public,anon,authenticated,service_role;
-- No accounts, providers, moderator memberships or flags are populated here.
