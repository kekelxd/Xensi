-- Run as postgres. Fixtures and assertions are entirely rolled back.
begin;
select set_config('xensi.ra',gen_random_uuid()::text,true),set_config('xensi.rb',gen_random_uuid()::text,true),
 set_config('xensi.rid',gen_random_uuid()::text,true),set_config('xensi.sid',gen_random_uuid()::text,true),set_config('xensi.sid2',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
select current_setting('xensi.ra')::uuid,'routines-a-'||current_setting('xensi.ra')||'@example.invalid',jsonb_build_object('nickname','rt_'||substr(current_setting('xensi.ra'),1,8)),now(),now()
union all select current_setting('xensi.rb')::uuid,'routines-b-'||current_setting('xensi.rb')||'@example.invalid',jsonb_build_object('nickname','rt_'||substr(current_setting('xensi.rb'),1,8)),now(),now();
select set_config('xensi.def',jsonb_build_object('id',current_setting('xensi.rid'),'name','Routine A','game_id','cs2','steps',jsonb_build_array(
 jsonb_build_object('id',current_setting('xensi.sid'),'position',0,'exercise_id','flick','duration_seconds',120,'difficulty','hard'),
 jsonb_build_object('id',current_setting('xensi.sid2'),'position',1,'exercise_id','tracking','duration_seconds',180,'difficulty','adaptive')))::text,true);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.ra'),'role','authenticated')::text,true);
select public.xensi_save_training_routine(current_setting('xensi.def')::jsonb,true,current_setting('xensi.ra')::uuid);
do $$ declare definition jsonb := current_setting('xensi.def')::jsonb; invalid jsonb; n integer; begin
 if not exists(select 1 from public.training_routines where id=current_setting('xensi.rid')::uuid) then raise exception 'Own read failed'; end if;
 if (select count(*) from public.training_routine_steps) <> 2 then raise exception 'Step creation failed'; end if;
 definition := jsonb_set(definition,'{name}','"Renamed"');
 definition := jsonb_set(definition,'{steps}',jsonb_build_array(jsonb_set(definition->'steps'->1,'{position}','0'),jsonb_set(definition->'steps'->0,'{position}','1')));
 perform public.xensi_save_training_routine(definition,false,current_setting('xensi.ra')::uuid);
 if not exists(select 1 from public.training_routine_steps where id=current_setting('xensi.sid2')::uuid and position=0 and difficulty='adaptive' and duration_seconds=180) then raise exception 'Reorder/config failed'; end if;
 update public.training_routines set updated_at='2000-01-01';
 update public.training_routine_steps set updated_at='2000-01-01';
 if exists(select 1 from public.training_routines where updated_at<>now()) or exists(select 1 from public.training_routine_steps where updated_at<>now()) then raise exception 'Timestamp trigger failed'; end if;
 invalid := jsonb_set(jsonb_set(definition,'{name}','"Invalid save"'),'{steps,1,duration_seconds}','61');
 begin perform public.xensi_save_training_routine(invalid,false,current_setting('xensi.ra')::uuid); raise exception 'Bad duration accepted'; exception when check_violation then null; end;
 if not exists(select 1 from public.training_routines where name='Renamed') or (select count(*) from public.training_routine_steps)<>2 then raise exception 'Atomic rollback failed'; end if;
 perform public.xensi_import_training_routines(jsonb_build_array(current_setting('xensi.def')::jsonb),current_setting('xensi.ra')::uuid);
 perform public.xensi_import_training_routines(jsonb_build_array(current_setting('xensi.def')::jsonb),current_setting('xensi.ra')::uuid);
 if (select count(*) from public.training_routines)<>1 or not exists(select 1 from public.training_routines where name='Renamed') then raise exception 'Import overwrote existing UUID'; end if;
 definition := jsonb_set(current_setting('xensi.def')::jsonb,'{id}',to_jsonb(gen_random_uuid()::text));
 definition := jsonb_set(definition,'{steps,0,id}',to_jsonb(gen_random_uuid()::text));
 definition := jsonb_set(definition,'{steps,1,id}',to_jsonb(gen_random_uuid()::text));
 perform public.xensi_import_training_routines(jsonb_build_array(definition),current_setting('xensi.ra')::uuid);
 if (select count(*) from public.training_routines)<>2 then raise exception 'Different UUID with same configuration was lost'; end if;
 delete from public.training_routines where id=(definition->>'id')::uuid;
 begin update public.training_routines set user_id=current_setting('xensi.rb')::uuid; raise exception 'Ownership reassignment allowed'; exception when insufficient_privilege then null; end;
 begin perform public.xensi_save_training_routine(definition,false,current_setting('xensi.rb')::uuid); raise exception 'Wrong session accepted'; exception when raise_exception then if sqlerrm='Wrong session accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.rb'),'role','authenticated')::text,true);
do $$ declare n integer; begin
 if exists(select 1 from public.training_routines) or exists(select 1 from public.training_routine_steps) then raise exception 'Cross-user read allowed'; end if;
 update public.training_routines set name='Hacked' where id=current_setting('xensi.rid')::uuid; get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user update allowed'; end if;
 delete from public.training_routines where id=current_setting('xensi.rid')::uuid; get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user delete allowed'; end if;
 update public.training_routine_steps set duration_seconds=60; get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user step update allowed'; end if;
 delete from public.training_routine_steps; get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user step delete allowed'; end if;
 begin insert into public.training_routine_steps(id,routine_id,position,exercise_id,duration_seconds,difficulty) values(gen_random_uuid(),current_setting('xensi.rid')::uuid,2,'flick',60,'easy'); raise exception 'Cross-user step insert allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.training_routines(id,user_id,name,game_id) values(gen_random_uuid(),current_setting('xensi.ra')::uuid,'Hacked','cs2'); raise exception 'Cross-user routine insert allowed'; exception when insufficient_privilege then null; end;
 begin perform public.xensi_save_training_routine(current_setting('xensi.def')::jsonb,false,current_setting('xensi.rb')::uuid); raise exception 'Cross-user RPC accepted'; exception when raise_exception then if sqlerrm='Cross-user RPC accepted' then raise; end if; end;
 begin perform public.xensi_import_training_routines(jsonb_build_array(current_setting('xensi.def')::jsonb),current_setting('xensi.rb')::uuid); raise exception 'Cross-owner import accepted'; exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.ra'),'role','authenticated')::text,true);
delete from public.training_routines where id=current_setting('xensi.rid')::uuid;
do $$ begin if exists(select 1 from public.training_routine_steps) then raise exception 'Routine cascade failed'; end if; end $$;
select public.xensi_save_training_routine(current_setting('xensi.def')::jsonb,true,current_setting('xensi.ra')::uuid);
reset role;
delete from auth.users where id=current_setting('xensi.ra')::uuid;
do $$ begin if exists(select 1 from public.training_routines where id=current_setting('xensi.rid')::uuid) or exists(select 1 from public.training_routine_steps where routine_id=current_setting('xensi.rid')::uuid) then raise exception 'User cascade failed'; end if; end $$;
set local role anon;
do $$ begin begin perform * from public.training_routines; raise exception 'Anon read allowed'; exception when insufficient_privilege then null; end; begin perform public.xensi_get_training_routines(); raise exception 'Anon RPC allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
select jsonb_build_object('rls',true,'crud',true,'step_order_and_config',true,'atomic_rollback',true,'import_idempotence',true,'cross_user_denied',true,'cascades',true,'anon_denied',true,'fixtures','rolled back') as results;
rollback;
