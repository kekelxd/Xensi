-- Remove age assurance as an access prerequisite, per the current release decision.
-- No tables, evidence records, release flags or tester approvals are changed.
create or replace function lfg_private.eligible(u uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from auth.users a
 where a.id=u and a.email_confirmed_at is not null
 and not coalesce(a.is_anonymous,false) and lfg_private.access_enabled(u))
 and not exists(select 1 from lfg_private.restrictions where user_id=u and suspended);
$$;

-- Stop exposing the unused age status; never fabricate verified-age evidence.
create or replace function public.xensi_lfg(action text,payload jsonb default '{}',expected_user_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select case when action='access' then lfg_private.api(action,payload,expected_user_id)-'age_verified'
 else lfg_private.api(action,payload,expected_user_id) end;
$$;
