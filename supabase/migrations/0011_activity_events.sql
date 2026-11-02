/* ---------- accountability: the deletes that otherwise leave no trace ---------- */
-- Everything else (misses, short sets, extras, weight trends) is derived by comparing the generated plan to the logs.
-- Append-only: there is no update or delete policy, so a person can't quietly rewrite their history.
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('log_deleted', 'set_deleted')),
  date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_user_date on public.activity_events (user_id, date desc);
alter table public.activity_events enable row level security;
create policy "own events: read" on public.activity_events for select using (auth.uid() = user_id);
create policy "own events: insert" on public.activity_events for insert with check (auth.uid() = user_id);
