-- Schedule the existing Squad expiry/retention routine; no business rules change.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Do not overwrite an unrelated job with the same name.
do $$
begin
 if exists(select 1 from cron.job where jobname='xensi-lfg-expiry'
  and (username<>'postgres' or command not in (
   'select lfg_private.sweep()',
   'select lfg_private.sweep();',
   'set lock_timeout=''2s''; set statement_timeout=''30s''; select lfg_private.sweep();'
  ))) then
  raise exception 'Unexpected xensi-lfg-expiry job; inspect before rescheduling';
 end if;
end $$;

select cron.schedule(
 'xensi-lfg-expiry',
 '* * * * *',
 'set lock_timeout=''2s''; set statement_timeout=''30s''; select lfg_private.sweep();'
);
