-- Per-set strength logging (weight × reps, or seconds), display settings, and an auto "strength" log per lifting day.

alter table public.profiles
  add column hide_dates boolean not null default false,
  add column weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb'));

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  -- stable id from lib/plan/exercises.ts, never the template text
  exercise_key text not null check (exercise_key ~ '^[a-z0-9-]{1,40}$'),
  set_no smallint not null check (set_no between 1 and 20),
  weight numeric(6, 2) check (weight is null or weight >= 0),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  -- every comparison uses kg, so switching units never looks like a drop
  weight_kg numeric(7, 2) generated always as (case when unit = 'lb' then round(weight * 0.45359237, 2) else weight end) stored,
  reps smallint check (reps is null or reps between 0 and 200),
  duration_sec smallint check (duration_sec is null or duration_sec between 0 and 3600),
  -- snapshot of whether this was a light/cutback/recovery session, since the plan itself is never stored
  light_week boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, exercise_key, set_no),
  check (reps is not null or duration_sec is not null)
);
create index set_logs_user_ex_date on public.set_logs (user_id, exercise_key, date desc);

alter table public.set_logs enable row level security;
create policy "own sets: read" on public.set_logs for select using (auth.uid() = user_id);
create policy "own sets: insert" on public.set_logs for insert with check (auth.uid() = user_id);
create policy "own sets: update" on public.set_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sets: delete" on public.set_logs for delete using (auth.uid() = user_id);

create trigger set_logs_touch before update on public.set_logs
  for each row execute function public.touch_updated_at();

-- The first set on a date creates one "strength" entry in the Log tab.
alter table public.logs add column auto boolean not null default false;
create unique index logs_auto_strength on public.logs (user_id, date) where kind = 'strength' and auto;
