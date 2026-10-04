-- Run as postgres against the migration. Every fixture is rolled back.
begin;
select set_config('xensi.test_a', gen_random_uuid()::text, true),
       set_config('xensi.test_b', gen_random_uuid()::text, true),
       set_config('xensi.test_preset', gen_random_uuid()::text, true),
       set_config('xensi.test_guest', gen_random_uuid()::text, true);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
select current_setting('xensi.test_a')::uuid, 'presets-a-' || current_setting('xensi.test_a') || '@example.invalid',
  jsonb_build_object('nickname', 'ptest_' || substr(current_setting('xensi.test_a'), 1, 8)), now(), now()
union all
select current_setting('xensi.test_b')::uuid, 'presets-b-' || current_setting('xensi.test_b') || '@example.invalid',
  jsonb_build_object('nickname', 'ptest_' || substr(current_setting('xensi.test_b'), 1, 8)), now(), now();

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('xensi.test_a'), 'role', 'authenticated')::text, true);
select count(*) from public.xensi_save_sensitivity_preset(
  current_setting('xensi.test_preset')::uuid, 'cs2', 'Test A', .65, 800, true, true, current_setting('xensi.test_a')::uuid);
do $$
declare n integer;
begin
  select count(*) into n from public.sensitivity_presets where id = current_setting('xensi.test_preset')::uuid;
  if n <> 1 then raise exception 'Own select failed'; end if;
  update public.sensitivity_presets set sensitivity = .7, updated_at = '2000-01-01' where id = current_setting('xensi.test_preset')::uuid;
  if not exists (select 1 from public.sensitivity_presets where sensitivity = .7 and updated_at = now()) then
    raise exception 'Own update/updated_at failed';
  end if;
  begin
    update public.sensitivity_presets set user_id = current_setting('xensi.test_b')::uuid;
    raise exception 'Ownership reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.sensitivity_presets (id, user_id, game_id, sensitivity, dpi, is_primary)
      values (gen_random_uuid(), auth.uid(), 'valorant', .4, 800, true);
    raise exception 'Two primary presets allowed';
  exception when unique_violation then null; end;
  begin
    insert into public.sensitivity_presets (id, user_id, game_id, sensitivity, dpi)
      values (gen_random_uuid(), auth.uid(), 'cs2', .7, 0);
    raise exception 'Invalid DPI allowed';
  exception when check_violation then null; end;
  begin
    perform public.xensi_set_primary_sensitivity_preset(current_setting('xensi.test_preset')::uuid, current_setting('xensi.test_b')::uuid);
    raise exception 'Session account mismatch allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('xensi.test_b'), 'role', 'authenticated')::text, true);
do $$
declare n integer;
begin
  select count(*) into n from public.sensitivity_presets where user_id = current_setting('xensi.test_a')::uuid;
  if n <> 0 then raise exception 'Cross-user select allowed'; end if;
  update public.sensitivity_presets set name = 'Hacked' where id = current_setting('xensi.test_preset')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-user update allowed'; end if;
  delete from public.sensitivity_presets where id = current_setting('xensi.test_preset')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-user delete allowed'; end if;
  begin
    insert into public.sensitivity_presets (id, user_id, game_id, sensitivity, dpi)
      values (gen_random_uuid(), current_setting('xensi.test_a')::uuid, 'cs2', .7, 800);
    raise exception 'Cross-user insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.xensi_set_primary_sensitivity_preset(current_setting('xensi.test_preset')::uuid, auth.uid());
    raise exception 'Cross-user primary RPC allowed';
  exception when no_data_found then null; end;
  begin
    perform public.xensi_import_sensitivity_presets(jsonb_build_array(jsonb_build_object(
      'id', current_setting('xensi.test_preset'), 'game_id', 'cs2', 'sensitivity', .7, 'dpi', 800)), auth.uid());
    raise exception 'Cross-account UUID collision accepted';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('xensi.test_a'), 'role', 'authenticated')::text, true);
do $$
declare payload jsonb;
begin
  payload := jsonb_build_array(jsonb_build_object('id', current_setting('xensi.test_guest'),
    'game_id', 'valorant', 'sensitivity', .4, 'dpi', 1600, 'is_primary', true));
  perform public.xensi_import_sensitivity_presets(payload, auth.uid());
  perform public.xensi_import_sensitivity_presets(payload, auth.uid());
  if (select count(*) from public.sensitivity_presets) <> 2 then raise exception 'Import retry duplicated records'; end if;
  if not exists (select 1 from public.sensitivity_presets where id = current_setting('xensi.test_preset')::uuid and is_primary) then
    raise exception 'Cloud primary lost';
  end if;
  perform public.xensi_set_primary_sensitivity_preset(current_setting('xensi.test_guest')::uuid, auth.uid());
  if (select count(*) from public.sensitivity_presets where is_primary) <> 1 then raise exception 'Primary RPC violated uniqueness'; end if;
  update public.sensitivity_presets set is_primary = false where is_primary;
  perform public.xensi_import_sensitivity_presets(payload, auth.uid());
  if not exists (select 1 from public.sensitivity_presets where id = current_setting('xensi.test_guest')::uuid and is_primary) then
    raise exception 'Guest primary not adopted';
  end if;
  perform public.xensi_save_sensitivity_preset(current_setting('xensi.test_guest')::uuid, 'valorant', 'Edited', .5, 800, true, false, auth.uid());
  if not exists (select 1 from public.sensitivity_presets where id = current_setting('xensi.test_guest')::uuid and name = 'Edited' and sensitivity = .5) then
    raise exception 'Own save RPC failed';
  end if;
  delete from public.sensitivity_presets where id = current_setting('xensi.test_guest')::uuid;
  if exists (select 1 from public.sensitivity_presets where id = current_setting('xensi.test_guest')::uuid) then raise exception 'Own delete failed'; end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.sensitivity_presets;
    raise exception 'Anon table access allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.xensi_import_sensitivity_presets('[]'::jsonb, null);
    raise exception 'Anon RPC access allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
delete from auth.users where id = current_setting('xensi.test_a')::uuid;
do $$
begin
  if exists (select 1 from public.sensitivity_presets where user_id = current_setting('xensi.test_a')::uuid) then
    raise exception 'Cascade failed';
  end if;
end;
$$;
select 'PASS: own CRUD; B cannot SELECT/UPDATE/DELETE/INSERT for A; owner reassignment denied; anon denied; UUID retry idempotent; primary conflict/adoption; timestamps; session mismatch; cascade' as result;
rollback;
