-- Isolated fixtures: users and Sessions are rolled back, never retained.
begin;
select set_config('xensi.micro_a',gen_random_uuid()::text,true),set_config('xensi.micro_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
select id,id::text||'@example.invalid',jsonb_build_object('nickname','micro_'||substr(id::text,1,8)),now(),now()
from (values(current_setting('xensi.micro_a')::uuid),(current_setting('xensi.micro_b')::uuid)) ids(id);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.micro_a'),'role','authenticated')::text,true);
select set_config('xensi.micro_defs','[{"exercise_id":"micro_flick","primary_metric":"meanAcquisitionTimeMs","direction":"lower","min_accuracy":90,"min_hits":5}]',true);
insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason,context,configuration,metrics,comparison_signature,schema_version,exercise_version)
select gen_random_uuid(),current_setting('xensi.micro_a')::uuid,'micro_flick',now()+n*interval '1 minute',now()+(n+1)*interval '1 minute',60000,status,reason,
 '{"gameId":"cs2","sensitivity":1,"dpi":800}', '{"durationSeconds":60,"micro":{"radius":0.02068,"minRadius":0.07,"maxRadius":0.12,"referenceRadius":0.1,"timeoutMs":2000,"respawnMs":150}}',
 jsonb_build_object('meanAcquisitionTimeMs',acquisition,'accuracy',accuracy,'hits',hits),signature,1,version
from (values
 (1,300.4,100,10,'completed',null::text,'micro-60',1),
 (2,300.2,100,10,'completed',null,'micro-60',1),
 (3,100,89.9,10,'completed',null,'micro-60',1),
 (4,90,100,4,'completed',null,'micro-60',1),
 (5,80,100,10,'invalid','pointer_lock_lost','micro-60',1),
 (6,70,100,10,'interrupted','manual_abort','micro-60',1),
 (7,200,100,10,'completed',null,'micro-120',1),
 (8,250,100,10,'completed',null,'micro-60',2),
 (9,300.2,100,10,'completed',null,'micro-60',1)
) fixtures(n,acquisition,accuracy,hits,status,reason,signature,version);
do $$ declare a uuid:=current_setting('xensi.micro_a')::uuid; d jsonb:=current_setting('xensi.micro_defs')::jsonb; winner public.training_sessions;
begin
 if (select count(*) from public.xensi_personal_best_sessions(a,d))<>3 then raise exception 'Micro signature/version separation failed'; end if;
 select * into winner from public.xensi_personal_best_sessions(a,d,'micro-60',1);
 if (winner.metrics->>'meanAcquisitionTimeMs')::numeric<>300.2 then raise exception 'Raw lower/quality eligibility failed'; end if;
 if exists(select 1 from public.training_sessions s where s.comparison_signature='micro-60' and s.exercise_version=1 and s.metrics=winner.metrics and s.finished_at<winner.finished_at) then raise exception 'Tie did not preserve earliest result'; end if;
 delete from public.training_sessions where id=winner.id;
 select * into winner from public.xensi_personal_best_sessions(a,d,'micro-60',1);
 if (winner.metrics->>'meanAcquisitionTimeMs')::numeric<>300.2 then raise exception 'Delete recalculation failed'; end if;
 begin perform public.xensi_personal_best_sessions(current_setting('xensi.micro_b')::uuid,d); raise exception 'Other owner accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.micro_b'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.training_sessions where exercise_id='micro_flick') then raise exception 'Micro RLS leaked'; end if;
 if exists(select 1 from public.xensi_personal_best_sessions(current_setting('xensi.micro_b')::uuid,current_setting('xensi.micro_defs')::jsonb)) then raise exception 'Micro PB leaked'; end if;
end $$;
reset role;
select 'PASS: Micro insert, raw mean, quality gates, invalid/interrupted, tie, signature/version separation, deletion and owner isolation' as result;
rollback;
