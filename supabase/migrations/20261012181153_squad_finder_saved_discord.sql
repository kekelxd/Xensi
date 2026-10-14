-- Optional saved Discord username per account, so it is not retyped for every room or request.
-- Private table: readable/writable only through the two owner-scoped RPCs below.
create table lfg_private.discord_handles (
 user_id uuid primary key references auth.users on delete cascade,
 discord_username text not null check (discord_username ~ '^[a-z0-9_.]{2,32}$' and position('..' in discord_username)=0),
 updated_at timestamptz not null default now()
);
alter table lfg_private.discord_handles enable row level security;
revoke all on lfg_private.discord_handles from public, anon, authenticated;

create function public.xensi_discord_get() returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'lfg_auth'; end if;
 return (select discord_username from lfg_private.discord_handles where user_id=auth.uid());
end $$;

create function public.xensi_discord_set(p_username text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'lfg_auth'; end if;
 if not lfg_private.eligible(u) then raise exception 'lfg_ineligible'; end if;
 if p_username is null or p_username !~ '^[a-z0-9_.]{2,32}$' or position('..' in p_username)>0 then raise exception 'lfg_invalid'; end if;
 insert into lfg_private.discord_handles(user_id,discord_username) values(u,p_username)
 on conflict (user_id) do update set discord_username=excluded.discord_username,updated_at=now();
end $$;

revoke all on function public.xensi_discord_get(), public.xensi_discord_set(text) from public, anon, authenticated;
grant execute on function public.xensi_discord_get(), public.xensi_discord_set(text) to authenticated;
