begin;
select set_config('xensi.analysis_a',gen_random_uuid()::text,true),set_config('xensi.analysis_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
select id,id::text||'@example.invalid',jsonb_build_object('nickname','analysis_'||substr(id::text,1,8)),now(),now()
from (values(current_setting('xensi.analysis_a')::uuid),(current_setting('xensi.analysis_b')::uuid)) ids(id);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.analysis_a'),'role','authenticated')::text,true);
insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,context,configuration,metrics,comparison_signature)
select gen_random_uuid(),current_setting('xensi.analysis_a')::uuid,'micro_flick',now()-(days+1)*interval '1 day',now()-days*interval '1 day',60000,'completed',
 '{"gameId":"cs2","sensitivity":1,"dpi":800}', '{"durationSeconds":60}',jsonb_build_object('meanAcquisitionTimeMs',case when days<7 then 180 else 200 end),'micro-60'
from generate_series(1,13) days where days<>7;
insert into public.training_sessions(id,user_id,exercise_id,started_at,finished_at,duration_ms,status,context,configuration,metrics,comparison_signature)
select gen_random_uuid(),current_setting('xensi.analysis_a')::uuid,'gridshot',now()-interval '2 days',now()-interval '1 day',60000,'completed',
 '{"gameId":"cs2","sensitivity":1,"dpi":800}', '{"durationSeconds":60}',jsonb_build_object('score',n),'grid-60' from generate_series(1,351) n;
do $$ declare a uuid:=current_setting('xensi.analysis_a')::uuid; r jsonb;
begin
 r:=public.xensi_analysis_v1(a,7,now(),'micro_flick',null,null,'meanAcquisitionTimeMs');
 if (r#>>'{current,median}')::numeric<>180 or (r#>>'{previous,median}')::numeric<>200 or (r#>>'{current,count}')::int<>6 or (r#>>'{previous,count}')::int<>6 then raise exception 'Period split/median failed'; end if;
 if (r#>>'{current,variation}')::numeric<>0 then raise exception 'CV failed'; end if;
 r:=public.xensi_analysis_v1(a,null,now(),'gridshot',null,null,'score');
 if (r#>>'{current,count}')::int<>351 or (r#>>'{current,mean}')::numeric<>176 or jsonb_array_length(r->'points')<>300 or jsonb_array_length(r->'recent')<>20 then raise exception 'Full history stats/bounded payload failed'; end if;
 if (r#>>'{previous,count}')::int<>0 then raise exception 'All-time baseline fabricated'; end if;
 r:=public.xensi_analysis_v1(a,7,now(),'gridshot','different',1,'score');
 if (r->>'total')::int<>0 then raise exception 'Signature mixed'; end if;
 begin perform public.xensi_analysis_v1(current_setting('xensi.analysis_b')::uuid); raise exception 'Other owner accepted'; exception when insufficient_privilege then null; end;
 begin perform public.xensi_analysis_v1(a,8); raise exception 'Bad period accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.analysis_b'),'role','authenticated')::text,true);
do $$ declare r jsonb; n integer; begin
 r:=public.xensi_analysis_v1(current_setting('xensi.analysis_b')::uuid);
 if (r->>'total')::int<>0 or jsonb_array_length(r->'variants')<>0 then raise exception 'RLS leaked'; end if;
 with removed as (delete from public.training_sessions where user_id=current_setting('xensi.analysis_a')::uuid returning id) select count(*) into n from removed;
 if n<>0 then raise exception 'Other owner deletion permitted'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('xensi.analysis_a'),'role','authenticated')::text,true);
do $$ declare r jsonb; n integer; begin
 with removed as (delete from public.training_sessions where user_id=current_setting('xensi.analysis_a')::uuid and exercise_id='gridshot' and metrics->>'score'='351' returning id) select count(*) into n from removed;
 if n<>1 then raise exception 'Own session deletion failed'; end if;
 r:=public.xensi_analysis_v1(current_setting('xensi.analysis_a')::uuid,null,now(),'gridshot',null,null,'score');
 if (r#>>'{current,count}')::int<>350 then raise exception 'Analysis stale after deletion'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.xensi_analysis_v1(current_setting('xensi.analysis_a')::uuid); raise exception 'Anon permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: full aggregates >300, bounded points/recent, windows, median/CV, signature, owner/RLS/anon/filter validation, owner-only deletion/recalculation' as result;
rollback;
