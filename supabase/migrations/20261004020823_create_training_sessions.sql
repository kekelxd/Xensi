create table public.routine_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.training_routines(id) on delete set null,
  routine_name text not null check (length(routine_name) between 1 and 48),
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  status text not null check (status in ('running','completed','invalid','interrupted')),
  invalid_reason text,
  schema_version integer not null default 1 check (schema_version = 1),
  created_at timestamptz not null default now(),
  constraint routine_run_time check (finished_at >= started_at),
  constraint routine_run_terminal check ((status = 'running' and finished_at is null and invalid_reason is null)
    or (status = 'completed' and finished_at is not null and invalid_reason is null)
    or (status in ('invalid','interrupted') and finished_at is not null and invalid_reason is not null and invalid_reason in
      ('pointer_lock_lost','escape','visibility_hidden','manual_abort','navigation','account_changed','page_reload','legacy_unverified','configuration_changed')))
);
create table public.training_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null check (exercise_id in ('switch','tracking','flick','reflex','gridshot','strafetrack','sniper-reaction')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms bigint not null check (duration_ms >= 0),
  status text not null check (status in ('completed','invalid','interrupted')),
  invalid_reason text,
  routine_run_id uuid references public.routine_runs(id) on delete set null,
  routine_id uuid references public.training_routines(id) on delete set null,
  routine_step_id uuid references public.training_routine_steps(id) on delete set null,
  preset_id uuid references public.sensitivity_presets(id) on delete set null,
  context jsonb,
  configuration jsonb,
  metrics jsonb,
  comparison_signature text,
  schema_version integer not null default 1 check (schema_version = 1),
  exercise_version integer not null default 1 check (exercise_version > 0),
  created_at timestamptz not null default now(),
  constraint training_session_time check (finished_at >= started_at),
  constraint training_session_objects check ((context is null or jsonb_typeof(context) = 'object')
    and (configuration is null or jsonb_typeof(configuration) = 'object') and (metrics is null or jsonb_typeof(metrics) = 'object')),
  constraint training_session_terminal check ((status = 'completed' and invalid_reason is null
    and metrics is not null and configuration is not null and context is not null and comparison_signature is not null and length(comparison_signature) > 0)
    or (status in ('invalid','interrupted') and invalid_reason is not null and invalid_reason in
      ('pointer_lock_lost','escape','visibility_hidden','manual_abort','navigation','account_changed','page_reload','legacy_unverified','configuration_changed')))
);
create index training_sessions_owner_time on public.training_sessions(user_id, finished_at desc, id);
create index training_sessions_owner_exercise_time on public.training_sessions(user_id, exercise_id, finished_at desc);
create index training_sessions_run on public.training_sessions(routine_run_id);
create index training_sessions_routine on public.training_sessions(routine_id);
create index training_sessions_step on public.training_sessions(routine_step_id);
create index training_sessions_preset on public.training_sessions(preset_id);
create index routine_runs_owner_time on public.routine_runs(user_id, started_at desc, id);
create index routine_runs_routine on public.routine_runs(routine_id);

alter table public.training_sessions enable row level security;
alter table public.routine_runs enable row level security;
revoke all on public.training_sessions, public.routine_runs from public, anon, authenticated;
grant select, insert, delete on public.training_sessions, public.routine_runs to authenticated;
grant update(status, finished_at, duration_ms, invalid_reason) on public.routine_runs to authenticated;

create policy training_sessions_select_own on public.training_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy training_sessions_insert_own on public.training_sessions for insert to authenticated
  with check (user_id = (select auth.uid())
    and (preset_id is null or exists (select 1 from public.sensitivity_presets p where p.id = preset_id and p.user_id = (select auth.uid())))
    and (routine_id is null or exists (select 1 from public.training_routines r where r.id = routine_id and r.user_id = (select auth.uid())))
    and (routine_run_id is null or exists (select 1 from public.routine_runs r where r.id = routine_run_id and r.user_id = (select auth.uid())
      and (training_sessions.routine_id is null or r.routine_id is null or r.routine_id = training_sessions.routine_id)))
    and (routine_step_id is null or exists (select 1 from public.training_routine_steps s join public.training_routines r on r.id = s.routine_id
      where s.id = routine_step_id and r.user_id = (select auth.uid()) and (training_sessions.routine_id is null or r.id = training_sessions.routine_id))));
create policy training_sessions_delete_own on public.training_sessions for delete to authenticated
  using (user_id = (select auth.uid()));
create policy routine_runs_select_own on public.routine_runs for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_runs_insert_own on public.routine_runs for insert to authenticated
  with check (user_id = (select auth.uid()) and (routine_id is null or exists
    (select 1 from public.training_routines r where r.id = routine_id and r.user_id = (select auth.uid()))));
create policy routine_runs_finish_own on public.routine_runs for update to authenticated
  using (user_id = (select auth.uid()) and status = 'running')
  with check (user_id = (select auth.uid()) and status in ('completed','invalid','interrupted'));
create policy routine_runs_delete_own on public.routine_runs for delete to authenticated
  using (user_id = (select auth.uid()));

-- Invoker only: RLS and column grants remain enforced for direct REST and RPC alike.
-- Missing/deleted guest definition references become NULL; immutable snapshots retain their original IDs.
create function public.xensi_append_training_history(expected_user_id uuid, payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  saved_session public.training_sessions;
  saved_run public.routine_runs;
  sessions jsonb := '[]'::jsonb;
  runs jsonb := '[]'::jsonb;
  reference_routine uuid;
  reference_step uuid;
  reference_preset uuid;
begin
  if auth.uid() is null or auth.uid() <> expected_user_id then raise exception 'Account mismatch' using errcode = '42501'; end if;
  if jsonb_typeof(payload->'sessions') is distinct from 'array' or jsonb_typeof(payload->'runs') is distinct from 'array'
    or jsonb_array_length(payload->'sessions') > 100 or jsonb_array_length(payload->'runs') > 100 then
    raise exception 'Invalid history batch' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(payload->'runs') loop
    if (item->>'user_id')::uuid is distinct from expected_user_id then raise exception 'Account mismatch' using errcode = '42501'; end if;
    select id into reference_routine from public.training_routines where id = (item->>'routine_id')::uuid and user_id = expected_user_id;
    insert into public.routine_runs(id,user_id,routine_id,routine_name,started_at,finished_at,duration_ms,status,invalid_reason,schema_version)
      values ((item->>'id')::uuid,expected_user_id,reference_routine,item->>'routine_name',(item->>'started_at')::timestamptz,
        (item->>'finished_at')::timestamptz,(item->>'duration_ms')::bigint,item->>'status',item->>'invalid_reason',(item->>'schema_version')::integer)
      on conflict (id) do nothing;
    -- Separate UPDATE avoids touching INSERT-only snapshot columns and allows idempotent terminal retries.
    update public.routine_runs set status = item->>'status', finished_at = (item->>'finished_at')::timestamptz,
      duration_ms = (item->>'duration_ms')::bigint, invalid_reason = item->>'invalid_reason'
      where id = (item->>'id')::uuid and user_id = expected_user_id and status = 'running' and item->>'status' <> 'running';
    select * into saved_run from public.routine_runs where id = (item->>'id')::uuid and user_id = expected_user_id;
    if not found then raise exception 'Run UUID collision' using errcode = '42501'; end if;
    runs := runs || jsonb_build_array(to_jsonb(saved_run));
  end loop;
  for item in select value from jsonb_array_elements(payload->'sessions') loop
    if (item->>'user_id')::uuid is distinct from expected_user_id then raise exception 'Account mismatch' using errcode = '42501'; end if;
    select id into reference_routine from public.training_routines where id = (item->>'routine_id')::uuid and user_id = expected_user_id;
    select s.id into reference_step from public.training_routine_steps s join public.training_routines r on r.id = s.routine_id
      where s.id = (item->>'routine_step_id')::uuid and r.user_id = expected_user_id and (reference_routine is null or r.id = reference_routine);
    select id into reference_preset from public.sensitivity_presets where id = (item->>'preset_id')::uuid and user_id = expected_user_id;
    insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason,
      routine_run_id,routine_id,routine_step_id,preset_id,context,configuration,metrics,comparison_signature,schema_version,exercise_version)
      values ((item->>'id')::uuid,expected_user_id,item->>'exercise_id',(item->>'started_at')::timestamptz,(item->>'finished_at')::timestamptz,
        (item->>'duration_ms')::bigint,item->>'status',item->>'invalid_reason',(item->>'routine_run_id')::uuid,
        reference_routine,reference_step,reference_preset,nullif(item->'context','null'::jsonb),nullif(item->'configuration','null'::jsonb),
        nullif(item->'metrics','null'::jsonb),item->>'comparison_signature',(item->>'schema_version')::integer,(item->>'exercise_version')::integer)
      on conflict (id) do nothing;
    select * into saved_session from public.training_sessions where id = (item->>'id')::uuid and user_id = expected_user_id;
    if not found then raise exception 'Session UUID collision' using errcode = '42501'; end if;
    sessions := sessions || jsonb_build_array(to_jsonb(saved_session));
  end loop;
  return jsonb_build_object('sessions',sessions,'runs',runs);
end;
$$;
revoke all on function public.xensi_append_training_history(uuid,jsonb) from public, anon;
grant execute on function public.xensi_append_training_history(uuid,jsonb) to authenticated;
