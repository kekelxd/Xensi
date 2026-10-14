-- Web Push endpoints must belong to a known push service (SSRF defence): https only, port 443, no userinfo, no IP literals.
create or replace function lfg_private.push_endpoint_ok(p_endpoint text)
returns boolean language plpgsql immutable set search_path='' as $$
declare m text[]; h text;
begin
 if p_endpoint is null or length(p_endpoint)>2048 then return false; end if;
 m := regexp_match(lower(p_endpoint), '^https://([a-z0-9.-]+)(:443)?([/?#]|$)');
 if m is null then return false; end if;
 h := m[1];
 if h ~ '^[0-9.]+$' then return false; end if;
 return h in ('fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com')
  or h ~ '^([a-z0-9-]+\.)+push\.services\.mozilla\.com$'
  or h ~ '^([a-z0-9-]+\.)+notify\.windows\.com$'
  or h ~ '^([a-z0-9-]+\.)+push\.apple\.com$';
end $$;
revoke all on function lfg_private.push_endpoint_ok(text) from public, anon, authenticated;

create or replace function public.xensi_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_lang text default 'pt')
returns void language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'lfg_auth'; end if;
 if not lfg_private.eligible(u) then raise exception 'lfg_ineligible'; end if;
 if not lfg_private.push_endpoint_ok(p_endpoint) then raise exception 'lfg_invalid_endpoint'; end if;
 if (select count(*) from lfg_private.push_subscriptions where user_id=u and endpoint<>p_endpoint)>=5 then raise exception 'lfg_rate_limit'; end if;
 insert into lfg_private.push_subscriptions(user_id,endpoint,p256dh,auth,lang)
 values(u,p_endpoint,p_p256dh,p_auth,case when p_lang='en' then 'en' else 'pt' end)
 on conflict (endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,lang=excluded.lang;
end $$;

revoke all on function public.xensi_push_subscribe(text,text,text,text) from public, anon, authenticated;
grant execute on function public.xensi_push_subscribe(text,text,text,text) to authenticated;
