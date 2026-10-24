-- Road to Sub-30: one profile (plan settings) per person, their logs and skipped days.
-- Every table is locked to its owner with row-level security, so each person only sees their own data.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Toronto',
  -- plan settings (null until the person finishes setup)
  start_date date,
  recovery_start date,
  returning_from_injury boolean not null default false,
  time_trial_date date,
  race_date date,
  race_name text,
  current_5k_sec integer check (current_5k_sec between 600 and 7200),
  goal_5k_sec integer check (goal_5k_sec between 600 and 7200),
  half_goal_min_sec integer,
  half_goal_max_sec integer,
  pain_areas text[] not null default '{knee}',
  gates jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('run', 'test', 'strength', 'walk')),
  title text,
  km numeric(6, 2) check (km is null or km >= 0),
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  rpe smallint check (rpe is null or rpe between 1 and 10),
  pain jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create index logs_user_date on public.logs (user_id, date desc);

create table public.day_overrides (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  status text not null check (status in ('skipped')),
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.profiles enable row level security;
alter table public.logs enable row level security;
alter table public.day_overrides enable row level security;

create policy "own profile: read" on public.profiles for select using (auth.uid() = id);
create policy "own profile: update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "own logs: read" on public.logs for select using (auth.uid() = user_id);
create policy "own logs: insert" on public.logs for insert with check (auth.uid() = user_id);
create policy "own logs: update" on public.logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own logs: delete" on public.logs for delete using (auth.uid() = user_id);

create policy "own skips: read" on public.day_overrides for select using (auth.uid() = user_id);
create policy "own skips: insert" on public.day_overrides for insert with check (auth.uid() = user_id);
create policy "own skips: delete" on public.day_overrides for delete using (auth.uid() = user_id);

-- Create an empty profile whenever someone is invited / signs in for the first time.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
