create table public.sensitivity_presets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  game_id text not null check (length(btrim(game_id)) > 0),
  sensitivity numeric not null check (sensitivity > 0 and sensitivity < 'Infinity'::numeric),
  dpi integer not null check (dpi > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sensitivity_presets enable row level security;
revoke all on public.sensitivity_presets from public, anon, authenticated;
grant select, insert, update, delete on public.sensitivity_presets to authenticated;

create policy sensitivity_presets_select_own on public.sensitivity_presets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy sensitivity_presets_insert_own on public.sensitivity_presets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sensitivity_presets_update_own on public.sensitivity_presets
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy sensitivity_presets_delete_own on public.sensitivity_presets
  for delete to authenticated using ((select auth.uid()) = user_id);

create index sensitivity_presets_user_updated_idx on public.sensitivity_presets (user_id, updated_at desc, id);
create unique index sensitivity_presets_one_primary_idx on public.sensitivity_presets (user_id) where is_primary;
create trigger sensitivity_presets_set_updated_at before update on public.sensitivity_presets
  for each row execute function public.xensi_set_updated_at();

-- All compound writes share the same account lock. RLS remains in force.
create function public.xensi_save_sensitivity_preset(
  preset_id uuid, preset_game_id text, preset_name text, preset_sensitivity numeric,
  preset_dpi integer, preset_primary boolean, create_new boolean, expected_user_id uuid
) returns setof public.sensitivity_presets
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if owner_id is distinct from expected_user_id then raise exception 'Session changed' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  if not create_new and not exists (
    select 1 from public.sensitivity_presets where id = preset_id and user_id = owner_id
  ) then raise exception 'Preset not found' using errcode = 'P0002'; end if;
  if preset_primary then
    update public.sensitivity_presets set is_primary = false
      where user_id = owner_id and is_primary and id <> preset_id;
  end if;
  if create_new then
    insert into public.sensitivity_presets (id, user_id, game_id, name, sensitivity, dpi, is_primary)
    values (preset_id, owner_id, preset_game_id, nullif(btrim(preset_name), ''), preset_sensitivity, preset_dpi, preset_primary);
  else
    update public.sensitivity_presets set game_id = preset_game_id, name = nullif(btrim(preset_name), ''),
      sensitivity = preset_sensitivity, dpi = preset_dpi, is_primary = preset_primary
      where id = preset_id and user_id = owner_id;
  end if;
  return query select * from public.sensitivity_presets where user_id = owner_id order by created_at, id;
end;
$$;

create function public.xensi_set_primary_sensitivity_preset(preset_id uuid, expected_user_id uuid)
returns setof public.sensitivity_presets
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if owner_id is distinct from expected_user_id then raise exception 'Session changed' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  if not exists (select 1 from public.sensitivity_presets where id = preset_id and user_id = owner_id) then
    raise exception 'Preset not found' using errcode = 'P0002';
  end if;
  update public.sensitivity_presets set is_primary = false where user_id = owner_id and is_primary and id <> preset_id;
  update public.sensitivity_presets set is_primary = true where user_id = owner_id and id = preset_id;
  return query select * from public.sensitivity_presets where user_id = owner_id order by created_at, id;
end;
$$;

create function public.xensi_import_sensitivity_presets(presets jsonb, expected_user_id uuid)
returns setof public.sensitivity_presets
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item jsonb;
  guest_primary uuid;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if owner_id is distinct from expected_user_id then raise exception 'Session changed' using errcode = '42501'; end if;
  if jsonb_typeof(presets) <> 'array' or presets is null then raise exception 'Invalid presets'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  for item in select value from jsonb_array_elements(presets) loop
    insert into public.sensitivity_presets (id, user_id, game_id, name, sensitivity, dpi)
    values ((item->>'id')::uuid, owner_id, item->>'game_id', nullif(btrim(item->>'name'), ''),
      (item->>'sensitivity')::numeric, (item->>'dpi')::integer)
    on conflict (id) do nothing;
    -- A UUID already owned by another account must not count as a successful import.
    if not exists (select 1 from public.sensitivity_presets where id = (item->>'id')::uuid and user_id = owner_id) then
      raise exception 'Preset ID conflict' using errcode = '42501';
    end if;
    if guest_primary is null and coalesce((item->>'is_primary')::boolean, false) then
      guest_primary := (item->>'id')::uuid;
    end if;
  end loop;
  if guest_primary is not null and not exists (
    select 1 from public.sensitivity_presets where user_id = owner_id and is_primary
  ) then
    update public.sensitivity_presets set is_primary = true where id = guest_primary and user_id = owner_id;
  end if;
  return query select * from public.sensitivity_presets where user_id = owner_id order by created_at, id;
end;
$$;

revoke all on function public.xensi_save_sensitivity_preset(uuid, text, text, numeric, integer, boolean, boolean, uuid) from public, anon, authenticated;
revoke all on function public.xensi_set_primary_sensitivity_preset(uuid, uuid) from public, anon, authenticated;
revoke all on function public.xensi_import_sensitivity_presets(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.xensi_save_sensitivity_preset(uuid, text, text, numeric, integer, boolean, boolean, uuid) to authenticated;
grant execute on function public.xensi_set_primary_sensitivity_preset(uuid, uuid) to authenticated;
grant execute on function public.xensi_import_sensitivity_presets(jsonb, uuid) to authenticated;
