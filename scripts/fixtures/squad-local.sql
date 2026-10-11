-- Disposable local PostgreSQL only. Never apply this fixture to hosted projects.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users(id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean default false, banned_until timestamptz);
create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
grant usage on schema auth to authenticated;
create table public.profiles(id uuid primary key references auth.users, nickname text, avatar_id text);
alter table public.profiles enable row level security;
create policy profiles_own on public.profiles to authenticated using(id=auth.uid());
grant select on public.profiles to authenticated;
