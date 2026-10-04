create table public.training_routines (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 48),
  game_id text not null check (length(btrim(game_id)) > 0),
  preset_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.training_routine_steps (
  id uuid primary key,
  routine_id uuid not null references public.training_routines(id) on delete cascade,
  position integer not null check (position >= 0),
  exercise_id text not null check (length(btrim(exercise_id)) > 0),
  duration_seconds integer not null check (duration_seconds in (60,120,180,240,300)),
  difficulty text not null check (difficulty in ('easy','medium','hard','adaptive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_routine_step_difficulty check (exercise_id <> 'sniper-reaction' or difficulty <> 'adaptive'),
  constraint training_routine_step_position unique (routine_id,position) deferrable initially deferred
);
create index training_routines_owner_updated on public.training_routines(user_id,updated_at desc,id);
create trigger training_routines_updated_at before update on public.training_routines for each row execute function public.xensi_set_updated_at();
create trigger training_routine_steps_updated_at before update on public.training_routine_steps for each row execute function public.xensi_set_updated_at();
alter table public.training_routines enable row level security;
alter table public.training_routine_steps enable row level security;
revoke all on public.training_routines, public.training_routine_steps from public, anon, authenticated;
grant select,insert,update,delete on public.training_routines, public.training_routine_steps to authenticated;
create policy training_routines_select_own on public.training_routines for select to authenticated using ((select auth.uid()) = user_id);
create policy training_routines_insert_own on public.training_routines for insert to authenticated with check ((select auth.uid()) = user_id);
create policy training_routines_update_own on public.training_routines for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy training_routines_delete_own on public.training_routines for delete to authenticated using ((select auth.uid()) = user_id);
create policy training_routine_steps_select_own on public.training_routine_steps for select to authenticated using (routine_id in (select id from public.training_routines where user_id = (select auth.uid())));
create policy training_routine_steps_insert_own on public.training_routine_steps for insert to authenticated with check (routine_id in (select id from public.training_routines where user_id = (select auth.uid())));
create policy training_routine_steps_update_own on public.training_routine_steps for update to authenticated using (routine_id in (select id from public.training_routines where user_id = (select auth.uid()))) with check (routine_id in (select id from public.training_routines where user_id = (select auth.uid())));
create policy training_routine_steps_delete_own on public.training_routine_steps for delete to authenticated using (routine_id in (select id from public.training_routines where user_id = (select auth.uid())));

create function public.xensi_get_training_routines() returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(definition order by updated_at desc,id),'[]'::jsonb) from (
    select r.id,r.updated_at,to_jsonb(r) || jsonb_build_object('training_routine_steps',
      coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from public.training_routine_steps s where s.routine_id=r.id),'[]'::jsonb)) definition
    from public.training_routines r where r.user_id=(select auth.uid())
  ) definitions;
$$;
create function public.xensi_save_training_routine(definition jsonb, create_new boolean, expected_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  target_id uuid := (definition->>'id')::uuid;
  step jsonb;
  step_count integer;
begin
  if owner_id is null or owner_id is distinct from expected_user_id then raise exception 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':routines',0));
  if definition is null or jsonb_typeof(definition->'steps') is distinct from 'array' then raise exception 'Invalid definition'; end if;
  step_count := jsonb_array_length(definition->'steps');
  if step_count=0 or (select count(distinct value->>'id') from jsonb_array_elements(definition->'steps')) <> step_count
    or exists (select 1 from jsonb_array_elements(definition->'steps') with ordinality e(value,n) where (value->>'position')::integer is distinct from (n-1)::integer)
    then raise exception 'Invalid steps'; end if;
  if create_new then
    insert into public.training_routines(id,user_id,name,game_id,preset_id)
    values(target_id,owner_id,btrim(definition->>'name'),definition->>'game_id',nullif(definition->>'preset_id',''));
  else
    update public.training_routines set name=btrim(definition->>'name'),game_id=definition->>'game_id',preset_id=nullif(definition->>'preset_id','')
    where id=target_id and user_id=owner_id;
    if not found then raise exception 'Routine not found'; end if;
  end if;
  delete from public.training_routine_steps where routine_id=target_id and id not in (select (value->>'id')::uuid from jsonb_array_elements(definition->'steps'));
  for step in select value from jsonb_array_elements(definition->'steps') loop
    insert into public.training_routine_steps(id,routine_id,position,exercise_id,duration_seconds,difficulty)
    values((step->>'id')::uuid,target_id,(step->>'position')::integer,step->>'exercise_id',(step->>'duration_seconds')::integer,step->>'difficulty')
    on conflict(id) do update set position=excluded.position,exercise_id=excluded.exercise_id,duration_seconds=excluded.duration_seconds,difficulty=excluded.difficulty
    where training_routine_steps.routine_id=target_id;
    if not found then raise exception 'Step belongs to another routine'; end if;
  end loop;
  return public.xensi_get_training_routines();
end;
$$;
create function public.xensi_import_training_routines(definitions jsonb, expected_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); definition jsonb;
begin
  if owner_id is null or owner_id is distinct from expected_user_id then raise exception 'Authentication required'; end if;
  if jsonb_typeof(definitions) is distinct from 'array' then raise exception 'Invalid definitions'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':routines',0));
  for definition in select value from jsonb_array_elements(definitions) loop
    -- Existing UUIDs are authoritative cloud entities; retries never replace their steps.
    if not exists(select 1 from public.training_routines where id=(definition->>'id')::uuid and user_id=owner_id) then
      perform public.xensi_save_training_routine(definition,true,expected_user_id);
    end if;
  end loop;
  return public.xensi_get_training_routines();
end;
$$;
revoke all on function public.xensi_get_training_routines(), public.xensi_save_training_routine(jsonb,boolean,uuid), public.xensi_import_training_routines(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.xensi_get_training_routines(), public.xensi_save_training_routine(jsonb,boolean,uuid), public.xensi_import_training_routines(jsonb,uuid) to authenticated;
