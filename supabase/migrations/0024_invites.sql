-- Getting new people in, two ways (app/invite-actions.ts):
--   1. The owner invites someone by email from Settings and passes on a one-time link.
--   2. Someone with the invite code creates their own account at /signup.
--
-- app_owners    who may invite. A table of its own, not a column on profiles: people can update their own
--               profile row, and nobody may make themselves an owner. Readable by its own user only; written
--               by the service role only (npm run invite-setup).
-- invite_codes  the codes that open /signup, as SHA-256 hashes: the code itself is never stored, and never in
--               this repo. No policies at all: only the server (service role) reads or changes it.

create table public.app_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_owners enable row level security;
create policy "own owner row: read" on public.app_owners for select to authenticated using (auth.uid() = user_id);

create table public.invite_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  uses integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
