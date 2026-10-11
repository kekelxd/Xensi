-- Release decision: registered, confirmed accounts may use Squad Finder.
-- Session validation, suspensions, RLS and contact authorization stay intact.
-- Do not fabricate legal/moderation approvals or age verification.
create or replace function lfg_private.access_enabled(u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from lfg_private.settings s where
 case when s.test_enabled then lfg_private.test_authorized(u)
 else s.enabled end);
$$;

create or replace function lfg_private.creation_allowed(u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from lfg_private.settings s where
 case when s.test_enabled then s.test_creation_enabled and lfg_private.test_authorized(u)
 else s.enabled and s.creation_enabled end);
$$;

revoke all on function lfg_private.access_enabled(uuid),lfg_private.creation_allowed(uuid)
 from public,anon,authenticated,service_role;

update lfg_private.settings
 set enabled=true,creation_enabled=true,test_enabled=false,test_creation_enabled=false;
