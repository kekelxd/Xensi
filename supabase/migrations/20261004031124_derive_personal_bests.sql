-- Read-only projection of Sessions. Metric selectors come from SESSION_REGISTRY;
-- no PB rows, duplicated metric registry, or new table privileges are introduced.
create function public.xensi_personal_best_sessions(
  expected_user_id uuid,
  definitions jsonb,
  target_signature text default null,
  target_exercise_version integer default null,
  before_session_id uuid default null,
  page_offset integer default 0,
  page_size integer default 100
)
returns setof public.training_sessions
language plpgsql stable security invoker set search_path = '' as $$
declare
  boundary public.training_sessions;
begin
  if auth.uid() is null or expected_user_id is distinct from auth.uid() then
    raise exception 'Account mismatch' using errcode = '42501';
  end if;
  if jsonb_typeof(definitions) is distinct from 'array' or jsonb_array_length(definitions) not between 1 and 7 then
    raise exception 'Invalid metric selectors' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(definitions) d
    where jsonb_typeof(d) is distinct from 'object'
      or coalesce(d->>'exercise_id','') not in ('switch','tracking','flick','reflex','gridshot','strafetrack','sniper-reaction')
      or coalesce(d->>'primary_metric','') not in ('score','accuracy','bestReactionMs')
      or coalesce(d->>'direction','') not in ('higher','lower')
  ) or (select count(distinct d->>'exercise_id') from jsonb_array_elements(definitions) d) <> jsonb_array_length(definitions) then
    raise exception 'Invalid metric selectors' using errcode = '22023';
  end if;
  if page_offset is null or page_offset < 0 or page_size is null or page_size not between 1 and 200 then
    raise exception 'Invalid page' using errcode = '22023';
  end if;
  if before_session_id is not null then
    select * into boundary from public.training_sessions where id = before_session_id and user_id = expected_user_id;
    if not found then raise exception 'Session unavailable' using errcode = '42501'; end if;
  end if;
  return query
  with candidates as (
    select s as document, d.direction,
      case when jsonb_typeof(s.metrics->d.primary_metric) = 'number'
        then (s.metrics->>d.primary_metric)::numeric end as metric_value
    from public.training_sessions s
    join jsonb_to_recordset(definitions) as d(exercise_id text, primary_metric text, direction text) on d.exercise_id = s.exercise_id
    where s.user_id = expected_user_id and s.status = 'completed' and s.invalid_reason is null
      and s.schema_version = 1 and s.exercise_version > 0
      and s.configuration is not null and s.context is not null and length(btrim(s.comparison_signature)) > 0
      and (target_signature is null or s.comparison_signature = target_signature)
      and (target_exercise_version is null or s.exercise_version = target_exercise_version)
      and (before_session_id is null or (s.finished_at,s.id) < (boundary.finished_at,boundary.id))
  ), ranked as (
    select document, row_number() over (
      partition by (document).exercise_id, (document).exercise_version, (document).comparison_signature
      order by case when direction = 'higher' then -metric_value else metric_value end,
        (document).finished_at, (document).id
    ) as position
    from candidates
    where metric_value between 0 and 1.7976931348623157e308
      and (direction <> 'lower' or metric_value > 0)
  )
  select (document).* from ranked where position = 1
  order by (document).exercise_id, (document).exercise_version, (document).comparison_signature
  limit page_size offset page_offset;
end;
$$;
revoke all on function public.xensi_personal_best_sessions(uuid,jsonb,text,integer,uuid,integer,integer) from public, anon;
grant execute on function public.xensi_personal_best_sessions(uuid,jsonb,text,integer,uuid,integer,integer) to authenticated;
