/* ---------- workout sessions: Start / End on a plan day ---------- */
-- One row per person per plan day that was started (the Start button, or the first set logged that day).
--
-- plan_date   the date the PLAN put the workout on, before moves (like exercise_swaps.plan_date), so a session
--             follows its workout when it moves. Map a shown date back with day_moves (to_date -> from_date).
--             Sets for it live in set_logs under coalesce(plan_date, date) = the day it was shown on.
-- started_at  when Start was tapped or the first set was ticked (the phone's clock, so offline starts keep their time)
-- ended_at    when End was tapped; null while in progress. An open session is treated as ended at
--             started_at + 4 hours (auto_ended) and saved that way the next time the app sees it, so a reader should
--             use coalesce(ended_at, least(now(), started_at + interval '4 hours')) for rows still null.
-- auto_ended  true when the 4-hour rule ended it rather than the End button
--
-- Sets of a session ended 12 hours ago or more are read-only (app and server actions refuse edits).
-- lib/plan/workout.ts has the same rules in TypeScript (sessionState, clampEnd).
create table public.workout_sessions (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  plan_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  auto_ended boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_date),
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or ended_at <= started_at + interval '4 hours'),
  check (not auto_ended or ended_at is not null)
);
alter table public.workout_sessions enable row level security;
create policy "own workout sessions: read" on public.workout_sessions for select using (auth.uid() = user_id);
create policy "own workout sessions: insert" on public.workout_sessions for insert with check (auth.uid() = user_id);
create policy "own workout sessions: update" on public.workout_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own workout sessions: delete" on public.workout_sessions for delete using (auth.uid() = user_id);
