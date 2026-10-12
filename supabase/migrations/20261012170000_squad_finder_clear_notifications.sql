-- Lets an account clear its own notification history (bell "Limpar tudo").
create function public.xensi_notifications_clear() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'lfg_auth'; end if;
 delete from lfg_private.events where user_id=auth.uid();
end $$;
revoke all on function public.xensi_notifications_clear() from public, anon, authenticated;
grant execute on function public.xensi_notifications_clear() to authenticated;
