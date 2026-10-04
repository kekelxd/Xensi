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
do $$ declare a uuid := current_setting('xensi.pb_a')::uuid; d jsonb := current_setting('xensi.pb_defs')::jsonb; winner public.training_sessions; n integer;
begin
 select count(*) into n from public.xensi_personal_best_sessions(a,d); if n<>5 then raise exception 'Groups/version/input eligibility failed: %',n; end if;
 select * into winner from public.xensi_personal_best_sessions(a,d,'flick-60-mouse',1);
 if winner.id::text<>current_setting('xensi.pb_original') then raise exception 'Old record outside latest 300 or tie preservation failed'; end if;
 select * into winner from public.xensi_personal_best_sessions(a,d,'sniper',1);
 if (winner.metrics->>'bestReactionMs')::numeric<>181.2 then raise exception 'Raw lower-is-better failed'; end if;
 select * into winner from public.xensi_personal_best_sessions(a,d,'sniper',1,winner.id);
 if (winner.metrics->>'bestReactionMs')::numeric<>181.4 then raise exception 'Before-session query failed'; end if;
 if (select count(*) from public.xensi_personal_best_sessions(a,d,null,null,null,4,1))<>1 then raise exception 'Pagination failed'; end if;
 begin perform public.xensi_personal_best_sessions(current_setting('xensi.pb_b')::uuid,d); raise exception 'Owner mismatch permitted'; exception when insufficient_privilege then null; end;
end $$;
-- Deletion and imported Sessions use the exact same projection, without PB writes.
insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,context,configuration,metrics,comparison_signature)
select gen_random_uuid(),current_setting('xensi.pb_a')::uuid,'flick',now(),now()+interval '60 seconds',60000,'completed','{}','{}',jsonb_build_object('score',v),'delete-import'
from (values(100),(120),(110)) scores(v);
do $$ declare a uuid:=current_setting('xensi.pb_a')::uuid; d jsonb:=current_setting('xensi.pb_defs')::jsonb; s public.training_sessions;
begin
 select * into s from public.xensi_personal_best_sessions(a,d,'delete-import'); if s.metrics->>'score'<>'120' then raise exception 'Initial delete fixture failed'; end if;
 delete from public.training_sessions where id=s.id;
 select * into s from public.xensi_personal_best_sessions(a,d,'delete-import'); if s.metrics->>'score'<>'110' then raise exception 'Delete recalculation failed'; end if;
 insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,context,configuration,metrics,comparison_signature)
 values(gen_random_uuid(),a,'flick',now(),now()+interval '60 seconds',60000,'completed','{}','{}','{"score":140}','delete-import');
 select * into s from public.xensi_personal_best_sessions(a,d,'delete-import'); if s.metrics->>'score'<>'140' then raise exception 'Imported history recalculation failed'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.pb_b'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.xensi_personal_best_sessions(current_setting('xensi.pb_b')::uuid,current_setting('xensi.pb_defs')::jsonb)) then raise exception 'Cross-user PB leaked'; end if;
 begin perform public.xensi_personal_best_sessions(current_setting('xensi.pb_b')::uuid,current_setting('xensi.pb_defs')::jsonb,null,null,current_setting('xensi.pb_original')::uuid); raise exception 'Foreign boundary accepted'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.xensi_personal_best_sessions(current_setting('xensi.pb_a')::uuid,current_setting('xensi.pb_defs')::jsonb); raise exception 'Anon RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: old record >300, higher/lower/raw, tie, invalid/interrupted, signatures/input/version, pagination, prior record, delete, import, owner isolation, anonymous denial' as result;
rollback;
