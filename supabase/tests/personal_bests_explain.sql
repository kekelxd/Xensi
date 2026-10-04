-- Generated fixtures only. No test data survives this transaction.
begin;
select set_config('xensi.pb_a',gen_random_uuid()::text,true),set_config('xensi.pb_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
select id,id::text||'@example.invalid',jsonb_build_object('nickname','pb_'||substr(id::text,1,8)),now(),now()
from (values(current_setting('xensi.pb_a')::uuid),(current_setting('xensi.pb_b')::uuid)) ids(id);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.pb_a'),'role','authenticated')::text,true);
select set_config('xensi.pb_defs','[{"exercise_id":"flick","primary_metric":"score","direction":"higher"},{"exercise_id":"sniper-reaction","primary_metric":"bestReactionMs","direction":"lower"}]',true);
insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason,context,configuration,metrics,comparison_signature,schema_version,exercise_version)
select gen_random_uuid(),current_setting('xensi.pb_a')::uuid,'flick','2026-10-01'::timestamptz + n*interval '1 minute','2026-10-01'::timestamptz+(n+1)*interval '1 minute',60000,'completed',null,
 '{"gameId":"cs2","sensitivity":1,"dpi":800}','{"durationSeconds":60}',jsonb_build_object('score',case when n=0 then 10000 else 9900 end),'flick-60-mouse',1,1
from generate_series(0,350) n;
select set_config('xensi.pb_original',(select id::text from public.training_sessions where user_id=current_setting('xensi.pb_a')::uuid and metrics->>'score'='10000'),true);
insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason,context,configuration,metrics,comparison_signature,schema_version,exercise_version)
select gen_random_uuid(),current_setting('xensi.pb_a')::uuid,exercise,'2026-10-02'::timestamptz+n*interval '1 minute','2026-10-02'::timestamptz+(n+1)*interval '1 minute',60000,status,reason,
 '{"gameId":"cs2","sensitivity":2,"dpi":1600}','{"durationSeconds":60}',metrics,signature,1,version
from (values
 (1,'flick','completed',null::text,'{"score":10000}'::jsonb,'flick-60-mouse',1),
 (2,'flick','invalid','legacy_unverified','{"score":15000}'::jsonb,'flick-60-mouse',1),
 (3,'flick','interrupted','manual_abort','{"score":16000}'::jsonb,'flick-60-mouse',1),
 (4,'flick','completed',null,'{"score":20000}'::jsonb,'flick-30-mouse',1),
 (5,'flick','completed',null,'{"score":9000}'::jsonb,'flick-60-mouse',2),
 (6,'flick','completed',null,'{"score":21000}'::jsonb,'flick-60-controller',1),
 (7,'sniper-reaction','completed',null,'{"bestReactionMs":181.4}'::jsonb,'sniper',1),
 (8,'sniper-reaction','completed',null,'{"bestReactionMs":190}'::jsonb,'sniper',1),
 (9,'sniper-reaction','completed',null,'{"bestReactionMs":181.2}'::jsonb,'sniper',1),
 (10,'sniper-reaction','completed',null,'{"bestReactionMs":null,"meanReactionMs":100}'::jsonb,'sniper',1)
) fixtures(n,exercise,status,reason,metrics,signature,version);

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
with candidates as (
    select s as document, d.direction,
      case when jsonb_typeof(s.metrics->d.primary_metric) = 'number'
        then (s.metrics->>d.primary_metric)::numeric end as metric_value
    from public.training_sessions s
    join jsonb_to_recordset(current_setting('xensi.pb_defs')::jsonb) as d(exercise_id text, primary_metric text, direction text) on d.exercise_id = s.exercise_id
    where s.user_id = current_setting('xensi.pb_a')::uuid and s.status = 'completed' and s.invalid_reason is null
      and s.schema_version = 1 and s.exercise_version > 0
      and s.configuration is not null and s.context is not null and length(btrim(s.comparison_signature)) > 0
      and (null::text is null or s.comparison_signature = null::text)
      and (null::integer is null or s.exercise_version = null::integer)
      and (null::uuid is null or (s.finished_at,s.id) < (null::timestamptz,null::uuid))
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
  limit 100 offset 0;
rollback;
