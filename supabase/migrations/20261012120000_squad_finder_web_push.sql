-- Web Push for Squad Finder: subscriptions + delivery trigger on private events.
-- Only `new_request` (host) and `request_accepted` (requester) are pushed.
-- The push payload is generic: Discord values never leave the guarded RPC path.

create extension if not exists pg_net with schema extensions;

create table lfg_private.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint)<=2048),
 p256dh text not null check (length(p256dh) between 20 and 200),
 auth text not null check (length(auth) between 8 and 100),
 lang text not null default 'pt' check (lang in ('pt','en')),
 created_at timestamptz not null default now()
);
create index lfg_push_user on lfg_private.push_subscriptions(user_id);
alter table lfg_private.push_subscriptions enable row level security;

-- Operator-managed delivery config: 'function_url' and 'shared_secret'. Never client readable.
create table lfg_private.push_config (key text primary key, value text not null);
alter table lfg_private.push_config enable row level security;

revoke all on lfg_private.push_subscriptions, lfg_private.push_config from public, anon, authenticated;
grant select, delete on lfg_private.push_subscriptions to service_role;

create function public.xensi_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_lang text default 'pt')
returns void language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'lfg_auth'; end if;
 if not lfg_private.eligible(u) then raise exception 'lfg_ineligible'; end if;
 if (select count(*) from lfg_private.push_subscriptions where user_id=u and endpoint<>p_endpoint)>=5 then raise exception 'lfg_rate_limit'; end if;
 insert into lfg_private.push_subscriptions(user_id,endpoint,p256dh,auth,lang)
 values(u,p_endpoint,p_p256dh,p_auth,case when p_lang='en' then 'en' else 'pt' end)
 on conflict (endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,lang=excluded.lang;
end $$;

create function public.xensi_push_unsubscribe(p_endpoint text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'lfg_auth'; end if;
 delete from lfg_private.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
end $$;

revoke all on function public.xensi_push_subscribe(text,text,text,text), public.xensi_push_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.xensi_push_subscribe(text,text,text,text), public.xensi_push_unsubscribe(text) to authenticated;

-- Fire-and-forget delivery. Must never roll back the social transaction.
create function lfg_private.push_dispatch() returns trigger language plpgsql security definer set search_path='' as $$
declare url text; secret text;
begin
 if new.kind not in ('new_request','request_accepted') then return new; end if;
 if not exists(select 1 from lfg_private.push_subscriptions where user_id=new.user_id) then return new; end if;
 select value into url from lfg_private.push_config where key='function_url';
 select value into secret from lfg_private.push_config where key='shared_secret';
 if url is null or secret is null then return new; end if;
 perform net.http_post(url:=url, headers:=jsonb_build_object('content-type','application/json','x-push-secret',secret),
  body:=jsonb_build_object('user_id',new.user_id,'kind',new.kind,'event_id',new.id), timeout_milliseconds:=3000);
 return new;
exception when others then return new;
end $$;

create trigger lfg_events_push after insert on lfg_private.events
 for each row execute function lfg_private.push_dispatch();

revoke all on function lfg_private.push_dispatch() from public, anon, authenticated;
