-- Run as postgres; only generated fixtures are modified, and every change is rolled back.
begin;
select set_config('xensi.sa',gen_random_uuid()::text,true),set_config('xensi.sb',gen_random_uuid()::text,true),
 set_config('xensi.srun',gen_random_uuid()::text,true),set_config('xensi.sroutine',gen_random_uuid()::text,true),
 set_config('xensi.sstep',gen_random_uuid()::text,true),set_config('xensi.spreset',gen_random_uuid()::text,true),set_config('xensi.session',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
select current_setting('xensi.sa')::uuid,'sessions-a-'||current_setting('xensi.sa')||'@example.invalid',jsonb_build_object('nickname','ss_'||substr(current_setting('xensi.sa'),1,8)),now(),now()
union all select current_setting('xensi.sb')::uuid,'sessions-b-'||current_setting('xensi.sb')||'@example.invalid',jsonb_build_object('nickname','ss_'||substr(current_setting('xensi.sb'),1,8)),now(),now();
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.sa'),'role','authenticated')::text,true);
insert into public.sensitivity_presets(id,user_id,name,game_id,sensitivity,dpi,is_primary)
 values(current_setting('xensi.spreset')::uuid,current_setting('xensi.sa')::uuid,'Snapshot preset','cs2',1.5,800,false);
insert into public.training_routines(id,user_id,name,game_id) values(current_setting('xensi.sroutine')::uuid,current_setting('xensi.sa')::uuid,'Snapshot routine','cs2');
insert into public.training_routine_steps(id,routine_id,position,exercise_id,duration_seconds,difficulty)
 values(current_setting('xensi.sstep')::uuid,current_setting('xensi.sroutine')::uuid,0,'flick',60,'medium');
select set_config('xensi.shistory',jsonb_build_object('runs',jsonb_build_array(jsonb_build_object(
 'id',current_setting('xensi.srun'),'user_id',current_setting('xensi.sa'),'routine_id',current_setting('xensi.sroutine'),
 'routine_name','Snapshot routine','started_at',now(),'finished_at',null,'duration_ms',0,'status','running','invalid_reason',null,'schema_version',1)),
 'sessions',jsonb_build_array(jsonb_build_object('id',current_setting('xensi.session'),'user_id',current_setting('xensi.sa'),
 'exercise_id','flick','started_at',now(),'finished_at',now()+interval '60 seconds','duration_ms',60000,'status','completed','invalid_reason',null,
 'routine_run_id',current_setting('xensi.srun'),'routine_id',current_setting('xensi.sroutine'),'routine_step_id',current_setting('xensi.sstep'),'preset_id',current_setting('xensi.spreset'),
 'context',jsonb_build_object('gameId','cs2','sensitivity',1.5,'dpi',800),'configuration',jsonb_build_object('durationSeconds',60,'effectiveDifficulty','medium'),
 'metrics',jsonb_build_object('score',100,'accuracy',50,'hits',1,'shots',2),'comparison_signature','["flick",1,60,"medium"]','schema_version',1,'exercise_version',1)))::text,true);
do $$ declare p jsonb := current_setting('xensi.shistory')::jsonb; begin
 perform public.xensi_append_training_history(current_setting('xensi.sa')::uuid,p);
 perform public.xensi_append_training_history(current_setting('xensi.sa')::uuid,p);
 if (select count(*) from public.training_sessions) <> 1 or (select count(*) from public.routine_runs) <> 1 then raise exception 'Idempotent append failed'; end if;
 begin update public.training_sessions set metrics='{}'; raise exception 'Session UPDATE permitted'; exception when insufficient_privilege then null; end;
 begin update public.routine_runs set routine_name='Changed'; raise exception 'Run snapshot UPDATE permitted'; exception when insufficient_privilege then null; end;
 p := jsonb_set(p,'{runs,0,status}','"completed"');
 p := jsonb_set(p,'{runs,0,finished_at}',to_jsonb(now()+interval '60 seconds'));
 p := jsonb_set(p,'{runs,0,duration_ms}','60000');
 perform public.xensi_append_training_history(current_setting('xensi.sa')::uuid,p);
 perform public.xensi_append_training_history(current_setting('xensi.sa')::uuid,p);
 if not exists(select 1 from public.routine_runs where status='completed' and duration_ms=60000) then raise exception 'Run terminal transition failed'; end if;
 p := jsonb_set(p,'{sessions,0,metrics,score}','999');
 perform public.xensi_append_training_history(current_setting('xensi.sa')::uuid,p);
 if not exists(select 1 from public.training_sessions where metrics->>'score'='100') then raise exception 'Retry overwrote immutable metrics'; end if;
 begin perform public.xensi_append_training_history(current_setting('xensi.sb')::uuid,p); raise exception 'Wrong expected owner accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.sb'),'role','authenticated')::text,true);
do $$ declare n integer; p jsonb := current_setting('xensi.shistory')::jsonb; begin
 if exists(select 1 from public.training_sessions) or exists(select 1 from public.routine_runs) then raise exception 'Cross-user SELECT permitted'; end if;
 delete from public.training_sessions; get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user session DELETE permitted'; end if;
 delete from public.routine_runs; get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user run DELETE permitted'; end if;
 update public.routine_runs set status='interrupted',invalid_reason='manual_abort',finished_at=now(); get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user run UPDATE permitted'; end if;
 begin update public.training_sessions set metrics='{}'; raise exception 'Cross-user session UPDATE permitted'; exception when insufficient_privilege then null; end;
 begin insert into public.routine_runs(id,user_id,routine_name,started_at,status) values(gen_random_uuid(),current_setting('xensi.sa')::uuid,'Forbidden',now(),'running'); raise exception 'Cross-owner run INSERT permitted'; exception when insufficient_privilege then null; end;
 begin insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason)
 values(gen_random_uuid(),current_setting('xensi.sa')::uuid,'flick',now(),now(),0,'interrupted','manual_abort'); raise exception 'Cross-owner session INSERT permitted'; exception when insufficient_privilege then null; end;
 begin insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,invalid_reason,routine_run_id)
 values(gen_random_uuid(),current_setting('xensi.sb')::uuid,'flick',now(),now(),0,'interrupted','manual_abort',current_setting('xensi.srun')::uuid); raise exception 'Foreign run reference permitted'; exception when insufficient_privilege then null; end;
 begin perform public.xensi_append_training_history(current_setting('xensi.sb')::uuid,p); raise exception 'Cross-owner payload accepted'; exception when insufficient_privilege then null; end;
 p := jsonb_set(p,'{runs,0,user_id}',to_jsonb(current_setting('xensi.sb')));
 p := jsonb_set(p,'{sessions,0,user_id}',to_jsonb(current_setting('xensi.sb')));
 begin perform public.xensi_append_training_history(current_setting('xensi.sb')::uuid,p); raise exception 'Foreign UUID collision accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.sa'),'role','authenticated')::text,true);
update public.sensitivity_presets set sensitivity=2 where id=current_setting('xensi.spreset')::uuid;
update public.training_routines set name='Renamed definition' where id=current_setting('xensi.sroutine')::uuid;
delete from public.sensitivity_presets where id=current_setting('xensi.spreset')::uuid;
delete from public.training_routine_steps where id=current_setting('xensi.sstep')::uuid;
do $$ begin
 if not exists(select 1 from public.training_sessions where preset_id is null and routine_step_id is null and context->>'sensitivity'='1.5') then raise exception 'Preset/step SET NULL or snapshot failed'; end if;
end $$;
delete from public.training_routines where id=current_setting('xensi.sroutine')::uuid;
do $$ begin
 if not exists(select 1 from public.training_sessions where routine_id is null and routine_run_id=current_setting('xensi.srun')::uuid) then raise exception 'Routine history removed'; end if;
 if not exists(select 1 from public.routine_runs where routine_id is null and routine_name='Snapshot routine') then raise exception 'Run snapshot removed'; end if;
end $$;
delete from public.routine_runs where id=current_setting('xensi.srun')::uuid;
do $$ begin if not exists(select 1 from public.training_sessions where routine_run_id is null) then raise exception 'Run SET NULL failed'; end if; end $$;
delete from public.training_sessions where id=current_setting('xensi.session')::uuid;
do $$ begin if exists(select 1 from public.training_sessions) then raise exception 'Own DELETE failed'; end if; end $$;
do $$ begin perform public.xensi_append_training_history(current_setting('xensi.sa')::uuid,current_setting('xensi.shistory')::jsonb); end $$;
reset role;
delete from auth.users where id=current_setting('xensi.sa')::uuid;
do $$ begin
 if exists(select 1 from public.training_sessions where user_id=current_setting('xensi.sa')::uuid) or exists(select 1 from public.routine_runs where user_id=current_setting('xensi.sa')::uuid) then raise exception 'Auth cascade failed'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.training_sessions; raise exception 'Anon SELECT permitted'; exception when insufficient_privilege then null; end;
 begin perform public.xensi_append_training_history(current_setting('xensi.sb')::uuid,'{}'); raise exception 'Anon RPC permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select jsonb_build_object('rls',true,'own_insert_select_delete',true,'sessions_immutable',true,'run_transition',true,
 'cross_user_denied',true,'foreign_run_denied',true,'idempotence',true,'snapshots',true,'set_null',true,'auth_cascade',true,'anon_denied',true,'fixtures','rolled back') as results;
rollback;
