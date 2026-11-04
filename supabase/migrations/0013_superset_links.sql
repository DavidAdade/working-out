/* ---------- supersets: two or more exercises done back to back, round by round, on one plan day ---------- */
-- A row means "this template line is linked to the next line in its block"; a group of three is two rows.
-- plan_date is the date the PLAN put the workout on (before moves and folds), like exercise_swaps, so a
-- superset follows the workout when it moves. key is the TEMPLATE exercise key of the line, never the
-- swapped-in one, so swapping either exercise keeps the group. The plan engine ignores a row it can't place
-- (settings changed, the next line isn't an exercise). Logged sets are never touched.
create table public.superset_links (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  plan_date date not null,
  key text not null check (key ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, plan_date, key)
);
alter table public.superset_links enable row level security;
create policy "own supersets: read" on public.superset_links for select using (auth.uid() = user_id);
create policy "own supersets: insert" on public.superset_links for insert with check (auth.uid() = user_id);
create policy "own supersets: update" on public.superset_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own supersets: delete" on public.superset_links for delete using (auth.uid() = user_id);
