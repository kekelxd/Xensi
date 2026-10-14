-- lfg_private is not an exposed API schema; the Edge Function reaches subscriptions only via these service-only RPCs.
create function public.xensi_push_targets(p_user uuid)
returns table(id uuid, endpoint text, p256dh text, auth text, lang text)
language sql security definer set search_path='' as $$
 select s.id,s.endpoint,s.p256dh,s.auth,s.lang from lfg_private.push_subscriptions s where s.user_id=p_user;
$$;
create function public.xensi_push_drop(p_id uuid) returns void
language sql security definer set search_path='' as $$
 delete from lfg_private.push_subscriptions where id=p_id;
$$;
revoke all on function public.xensi_push_targets(uuid), public.xensi_push_drop(uuid) from public, anon, authenticated;
grant execute on function public.xensi_push_targets(uuid), public.xensi_push_drop(uuid) to service_role;
