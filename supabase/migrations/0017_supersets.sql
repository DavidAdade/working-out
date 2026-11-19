/* ---------- supersets, saved for the workout: a group of exercises done back to back, round by round ---------- */
-- Replaces superset_links (0013, "this line is linked to the next line on one plan date"), which could only pair
-- neighbours, had to be rebuilt every week and couldn't take one exercise out of a group of three. That table is
-- left in place, unused.
-- One row per group. keys are exercise keys: the TEMPLATE's key for a plan exercise (never a swapped-in one, so
-- swapping keeps the group) or the key of an exercise added mid-workout. A group shows on any day that has two
-- or more of its exercises; the app ignores it everywhere else. id is made on the phone, so a write replayed
-- from the offline outbox lands on the same row. Logged sets are never touched.
create table public.supersets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  keys text[] not null check (cardinality(keys) between 2 and 8),
  created_at timestamptz not null default now()
);
create index supersets_user on public.supersets (user_id, created_at);
alter table public.supersets enable row level security;
create policy "own supersets: read" on public.supersets for select using (auth.uid() = user_id);
create policy "own supersets: insert" on public.supersets for insert with check (auth.uid() = user_id);
create policy "own supersets: update" on public.supersets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own supersets: delete" on public.supersets for delete using (auth.uid() = user_id);
