-- Spatial Hunt V1: extend existing Sessions and read-only PB/Analysis projections.
alter table public.training_sessions drop constraint training_sessions_exercise_id_check;
alter table public.training_sessions add constraint training_sessions_exercise_id_check
  check (exercise_id in ('switch','tracking','flick','reflex','gridshot','strafetrack','sniper-reaction','micro_flick','spatial_hunt'));

-- Read-only projection of Sessions. Metric selectors come from SESSION_REGISTRY;
-- no PB rows, duplicated metric registry, or new table privileges are introduced.
create or replace function public.xensi_personal_best_sessions(
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
  if jsonb_typeof(definitions) is distinct from 'array' or jsonb_array_length(definitions) not between 1 and 9 then
    raise exception 'Invalid metric selectors' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(definitions) d
    where jsonb_typeof(d) is distinct from 'object'
      or coalesce(d->>'exercise_id','') not in ('switch','tracking','flick','reflex','gridshot','strafetrack','sniper-reaction','micro_flick','spatial_hunt')
      or coalesce(d->>'primary_metric','') not in ('score','accuracy','bestReactionMs','meanAcquisitionTimeMs','mean_angular_error_deg')
      or coalesce(d->>'direction','') not in ('higher','lower')
      or (d ? 'min_accuracy' and jsonb_typeof(d->'min_accuracy') not in ('number','null'))
      or (d ? 'min_hits' and jsonb_typeof(d->'min_hits') not in ('number','null'))
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
    join jsonb_to_recordset(definitions) as d(exercise_id text, primary_metric text, direction text, min_accuracy numeric, min_hits numeric) on d.exercise_id = s.exercise_id
    where s.user_id = expected_user_id and s.status = 'completed' and s.invalid_reason is null
      and s.schema_version = 1 and s.exercise_version > 0
      and s.configuration is not null and s.context is not null and length(btrim(s.comparison_signature)) > 0
      and (d.min_accuracy is null or case when jsonb_typeof(s.metrics->'accuracy') = 'number' then (s.metrics->>'accuracy')::numeric >= d.min_accuracy else false end)
      and (d.min_hits is null or case when jsonb_typeof(s.metrics->'hits') = 'number' then (s.metrics->>'hits')::numeric >= d.min_hits else false end)
      and (s.exercise_id <> 'spatial_hunt' or (
        d.primary_metric = 'mean_angular_error_deg' and d.direction = 'lower'
        and s.metrics->'round_count' = '8'::jsonb and s.metrics->'timeouts' = '0'::jsonb
        and case when jsonb_typeof(s.metrics->'rounds') = 'array' then jsonb_array_length(s.metrics->'rounds') = 8 else false end
        and not jsonb_path_exists(s.metrics, '$.rounds[*] ? (@.timedOut != false)')
      ))
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
      and (direction <> 'lower' or metric_value > 0 or (document).exercise_id = 'spatial_hunt')
      and ((document).exercise_id <> 'spatial_hunt' or metric_value <= 180)
  )
  select (document).* from ranked where position = 1
  order by (document).exercise_id, (document).exercise_version, (document).comparison_signature
  limit page_size offset page_offset;
end;
$$;
revoke all on function public.xensi_personal_best_sessions(uuid,jsonb,text,integer,uuid,integer,integer) from public, anon;
grant execute on function public.xensi_personal_best_sessions(uuid,jsonb,text,integer,uuid,integer,integer) to authenticated;


-- Read-only analysis over existing owner-scoped Sessions; no derived table/cache.
create or replace function public.xensi_analysis_v1(
  expected_user_id uuid, period_days integer default 30, as_of timestamptz default now(),
  target_exercise text default null, target_signature text default null,
  target_version integer default null, metric_key text default 'score'
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; cutoff timestamptz;
begin
  if auth.uid() is null or expected_user_id is distinct from auth.uid() then
    raise exception 'Account mismatch' using errcode='42501';
  end if;
  if (period_days is not null and period_days not in (7,30,90)) or as_of is null
    or as_of > now() + interval '5 minutes'
    or (target_exercise is not null and target_exercise not in ('switch','tracking','flick','reflex','gridshot','strafetrack','sniper-reaction','micro_flick','spatial_hunt'))
    or (target_version is not null and target_version < 1)
    or metric_key is null or metric_key not in ('score','accuracy','hits','bestReactionMs','meanAcquisitionTimeMs','medianReactionMs','medianAcquisitionTimeMs','meanOvershootPx','targetsPerSecond','mean_angular_error_deg','median_angular_error_deg','p95_angular_error_deg','best_angular_error_deg','mean_localization_time_ms','median_localization_time_ms') then
    raise exception 'Invalid analysis filters' using errcode='22023';
  end if;
  cutoff := case when period_days is null then '-infinity'::timestamptz else as_of - period_days * interval '1 day' end;
  with base as materialized (
    select s.* from public.training_sessions s
    where s.user_id=expected_user_id and s.status='completed' and s.invalid_reason is null
      and s.schema_version=1 and s.exercise_version>0 and s.configuration is not null and s.context is not null and s.metrics is not null
      and length(btrim(s.comparison_signature))>0 and s.finished_at<=as_of
      and (period_days is null or s.finished_at>=as_of - 2*period_days*interval '1 day')
  ), variants as (
    select distinct on (exercise_id,exercise_version,comparison_signature) b.*,
      count(*) over (partition by exercise_id,exercise_version,comparison_signature) as variant_count
    from base b where finished_at>=cutoff
    order by exercise_id,exercise_version,comparison_signature,finished_at desc,id desc
  ), selected as (
    select exercise_version,comparison_signature from variants where exercise_id=target_exercise
      and (target_signature is null or comparison_signature=target_signature)
      and (target_version is null or exercise_version=target_version)
    order by finished_at desc,id desc limit 1
  ), filtered as materialized (
    select b.* from base b where target_exercise is null or b.exercise_id=target_exercise
      and b.comparison_signature=coalesce(target_signature,(select comparison_signature from selected))
      and b.exercise_version=coalesce(target_version,(select exercise_version from selected))
  ), valued as materialized (
    select f.*, case when jsonb_typeof(metrics->metric_key)='number' then (metrics->>metric_key)::numeric end as value
    from filtered f where target_exercise is not null
  ), measured as (
    select * from valued where value between 0 and 1.7976931348623157e308
      and (metric_key not in ('bestReactionMs','meanAcquisitionTimeMs','medianReactionMs','medianAcquisitionTimeMs') or value>0)
  ), summaries as (
    select (finished_at>=cutoff) as current_period,count(*) as n,avg(value) as mean,
      percentile_cont(0.5) within group(order by value::double precision) as median,
      case when count(*)>=2 then stddev_pop(value) end as deviation,
      case when count(*)>=2 and avg(value)<>0 then stddev_pop(value)/abs(avg(value))*100 end as variation
    from measured group by (finished_at>=cutoff)
  ) select jsonb_build_object(
    'variants',coalesce((select jsonb_agg(jsonb_build_object('session',to_jsonb(v)-'variant_count','count',variant_count) order by finished_at desc,id desc) from variants v),'[]'),
    'selected', (select to_jsonb(f) from filtered f where finished_at>=cutoff order by finished_at desc,id desc limit 1),
    'total',(select count(*) from filtered where finished_at>=cutoff),
    'current',coalesce((select jsonb_build_object('count',n,'mean',mean,'median',median,'deviation',deviation,'variation',variation) from summaries where current_period),'{"count":0,"mean":null,"median":null,"deviation":null,"variation":null}'),
    'previous',coalesce((select jsonb_build_object('count',n,'mean',mean,'median',median,'deviation',deviation,'variation',variation) from summaries where not current_period),'{"count":0,"mean":null,"median":null,"deviation":null,"variation":null}'),
    'points',coalesce((select jsonb_agg(to_jsonb(p)-'value' order by finished_at,id) from (select * from measured where finished_at>=cutoff order by finished_at desc,id desc limit 300) p),'[]'),
    'pointCount',(select count(*) from measured where finished_at>=cutoff),
    'recent',coalesce((select jsonb_agg(to_jsonb(r) order by finished_at desc,id desc) from (select * from filtered where finished_at>=cutoff order by finished_at desc,id desc limit 20) r),'[]')
  ) into result;
  return result;
end $$;
revoke all on function public.xensi_analysis_v1(uuid,integer,timestamptz,text,text,integer,text) from public,anon;
grant execute on function public.xensi_analysis_v1(uuid,integer,timestamptz,text,text,integer,text) to authenticated;
