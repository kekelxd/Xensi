-- Isolated transaction: all test users and sessions are rolled back.
begin;
select set_config('xensi.spatial_a',gen_random_uuid()::text,true),set_config('xensi.spatial_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
select id,id::text||'@example.invalid',jsonb_build_object('nickname','sh_'||substr(id::text,1,12)),now(),now()
from (values(current_setting('xensi.spatial_a')::uuid),(current_setting('xensi.spatial_b')::uuid)) ids(id);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.spatial_a'),'role','authenticated')::text,true);
select set_config('xensi.spatial_defs','[{"exercise_id":"spatial_hunt","primary_metric":"mean_angular_error_deg","direction":"lower"}]',true);
do $$
declare a uuid:=current_setting('xensi.spatial_a')::uuid; d jsonb:=current_setting('xensi.spatial_defs')::jsonb;
  angle numeric; rounds jsonb; m jsonb; payload jsonb; result jsonb; winner public.training_sessions;
begin
 foreach angle in array array[12.4,9.8,11.1] loop
  select jsonb_agg(jsonb_build_object('sector',sector,'relativeAzimuth',(n-1)*45,'referenceYaw',0,'sourceAzimuth',(n-1)*45,
    'responseAzimuth',(n-1)*45+angle,'responsePitch',0,'angularErrorDeg',angle,'localizationTimeMs',800,'timedOut',false)) into rounds
    from unnest(array['front','front-right','right','back-right','back','back-left','left','front-left']) with ordinality x(sector,n);
  m:=jsonb_build_object('mean_angular_error_deg',angle,'median_angular_error_deg',angle,'p95_angular_error_deg',angle,'best_angular_error_deg',angle,
    'mean_localization_time_ms',800,'median_localization_time_ms',800,'timeouts',0,'round_count',8,'rounds',rounds);
  payload:=jsonb_build_object('runs','[]'::jsonb,'sessions',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'user_id',a,'exercise_id','spatial_hunt',
    'started_at',now()-interval '1 minute','finished_at',now(),'duration_ms',60000,'status','completed','invalid_reason',null,
    'context',jsonb_build_object('gameId','cs2','sensitivity',1,'dpi',800),'configuration',jsonb_build_object('durationSeconds',0,'spatial',jsonb_build_object('roundCount',8)),
    'metrics',m,'comparison_signature','spatial-test-v1','schema_version',1,'exercise_version',1)));
  result:=public.xensi_append_training_history(a,payload);
  if jsonb_array_length(result->'sessions')<>1 then raise exception 'Append failed'; end if;
 end loop;
 select * into winner from public.xensi_personal_best_sessions(a,d,'spatial-test-v1',1);
 if (winner.metrics->>'mean_angular_error_deg')::numeric<>9.8 then raise exception 'Expected 9.8 degree PB'; end if;
 result:=public.xensi_analysis_v1(a,30,now(),'spatial_hunt','spatial-test-v1',1,'mean_angular_error_deg');
 if (result->>'total')::int<>3 or abs((result->'current'->>'mean')::numeric-11.1)>0.00001 then raise exception 'Analysis mismatch'; end if;
 -- Invalid/interrupted and timed-out results must not displace a genuine result.
 insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason,context,configuration,metrics,comparison_signature,schema_version,exercise_version)
 select gen_random_uuid(),a,'spatial_hunt',now()-interval '1 minute',now(),60000,status,reason,winner.context,winner.configuration,
  winner.metrics||jsonb_build_object('mean_angular_error_deg',0,'timeouts',timeouts),'spatial-test-v1',1,1
 from (values('invalid','escape',0),('interrupted','visibility_hidden',0),('completed',null,1)) x(status,reason,timeouts);
 select * into winner from public.xensi_personal_best_sessions(a,d,'spatial-test-v1',1);
 if (winner.metrics->>'mean_angular_error_deg')::numeric<>9.8 then raise exception 'Eligibility failed'; end if;
 -- A zero angular error is valid, unlike the positive-only reaction-time metrics.
 insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason,context,configuration,metrics,comparison_signature,schema_version,exercise_version)
 values(gen_random_uuid(),a,'spatial_hunt',now()-interval '1 minute',now(),60000,'completed',null,winner.context,winner.configuration,
  winner.metrics||jsonb_build_object('mean_angular_error_deg',0),'spatial-test-zero',1,1);
 if (select (metrics->>'mean_angular_error_deg')::numeric from public.xensi_personal_best_sessions(a,d,'spatial-test-zero',1))<>0 then raise exception 'Zero PB rejected'; end if;
 begin perform public.xensi_personal_best_sessions(current_setting('xensi.spatial_b')::uuid,d); raise exception 'Other owner PB accepted'; exception when insufficient_privilege then null; end;
 begin perform public.xensi_analysis_v1(current_setting('xensi.spatial_b')::uuid); raise exception 'Other owner analysis accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.spatial_b'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.training_sessions where user_id=current_setting('xensi.spatial_a')::uuid) then raise exception 'RLS leaked'; end if;
 if exists(select 1 from public.xensi_personal_best_sessions(current_setting('xensi.spatial_b')::uuid,current_setting('xensi.spatial_defs')::jsonb)) then raise exception 'PB leaked'; end if;
 if (public.xensi_analysis_v1(current_setting('xensi.spatial_b')::uuid)->>'total')::int<>0 then raise exception 'Analysis leaked'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.xensi_personal_best_sessions(uuid,jsonb,text,integer,uuid,integer,integer)','EXECUTE') then raise exception 'Anonymous PB access'; end if;
 if has_function_privilege('anon','public.xensi_analysis_v1(uuid,integer,timestamptz,text,text,integer,text)','EXECUTE') then raise exception 'Anonymous analysis access'; end if;
 if not (select relrowsecurity from pg_class where oid='public.training_sessions'::regclass) then raise exception 'RLS disabled'; end if;
end $$;
select 'PASS: Spatial append, 9.8 PB, zero error, timeout/interruption exclusion, analysis, owner isolation, anon grants and RLS' as result;
rollback;
