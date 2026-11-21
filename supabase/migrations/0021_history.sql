-- History that doesn't change after the fact.
--
-- 1. When each return-to-running gate was ticked, so the Score judges a past day by the gates as they stood then
--    (ticking them used to re-score the weeks walked while they were pending as missed runs).
-- 2. Custom exercises are hidden, not removed, when deleted: past workouts that used one keep its name and credit.
-- 3. A day's workout as it was shown when it was logged. The plan is rebuilt from the templates every time, so
--    without this a template edit would re-score everyone's past workouts.

alter table public.profiles add column gates_at jsonb not null default '{}'::jsonb;

create or replace function public.set_gate(p_key text, p_value boolean) returns void
language sql security invoker set search_path = '' as $$
  update public.profiles
     set gates = gates || jsonb_build_object(p_key, p_value),
         gates_at = case when p_value then gates_at || jsonb_build_object(p_key, now()) else gates_at - p_key end
   where id = auth.uid();
$$;

alter table public.exercises add column deleted_at timestamptz;

create table public.day_snapshots (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The date the workout was shown on (set_logs.plan_date, or its date)
  plan_date date not null,
  -- The day's blocks as shown, without the exercise-swap overlay (swaps are applied on top when read)
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array' and pg_column_size(blocks) < 60000),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);
alter table public.day_snapshots enable row level security;
create policy "own snapshots: read" on public.day_snapshots for select to authenticated using (auth.uid() = user_id);
create policy "own snapshots: insert" on public.day_snapshots for insert to authenticated with check (auth.uid() = user_id);
create policy "own snapshots: update" on public.day_snapshots for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own snapshots: delete" on public.day_snapshots for delete to authenticated using (auth.uid() = user_id);
