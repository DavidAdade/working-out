-- The exercise database. Built-in rows (owner is null) are copied from lib/plan/exercises.ts by
-- `npm run sync-exercises`, which also runs on every Vercel build. Each person can add their own (owner = them).

create table public.exercises (
  key text primary key check (key ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  load text not null check (load in ('weight', 'bodyweight', 'time')),
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  -- YouTube ids, best first; the player falls back through them
  video_ids text[] not null default '{}',
  video_query text,
  -- template lines that map to this exercise (built-ins only)
  lines text[] not null default '{}',
  owner uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exercises_owner on public.exercises (owner);

alter table public.exercises enable row level security;
-- Everyone signed in sees the built-ins; custom exercises are private to their owner
create policy "exercises: read built-in and own" on public.exercises for select using (owner is null or owner = auth.uid());
create policy "exercises: add own" on public.exercises for insert with check (owner = auth.uid());
create policy "exercises: edit own" on public.exercises for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "exercises: delete own" on public.exercises for delete using (owner = auth.uid());

create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();
