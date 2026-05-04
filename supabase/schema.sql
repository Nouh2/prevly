-- Prevly Supabase schema.
-- Run this file in Supabase SQL Editor after creating the project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb,
  fiscal_profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tft_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null,
  assumptions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.dashboard_states enable row level security;
alter table public.tft_states enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "dashboard_states_select_own" on public.dashboard_states;
create policy "dashboard_states_select_own"
  on public.dashboard_states for select
  using (auth.uid() = user_id);

drop policy if exists "dashboard_states_insert_own" on public.dashboard_states;
create policy "dashboard_states_insert_own"
  on public.dashboard_states for insert
  with check (auth.uid() = user_id);

drop policy if exists "dashboard_states_update_own" on public.dashboard_states;
create policy "dashboard_states_update_own"
  on public.dashboard_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tft_states_select_own" on public.tft_states;
create policy "tft_states_select_own"
  on public.tft_states for select
  using (auth.uid() = user_id);

drop policy if exists "tft_states_insert_own" on public.tft_states;
create policy "tft_states_insert_own"
  on public.tft_states for insert
  with check (auth.uid() = user_id);

drop policy if exists "tft_states_update_own" on public.tft_states;
create policy "tft_states_update_own"
  on public.tft_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
