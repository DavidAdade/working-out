-- Runs from the person's own running plan (another app, a coach), as [{date, km, title, hard?, race?}].
-- From the week of the first to the week of the last, these are the plan's running days and the lifting is
-- placed around them (lib/plan/ownruns.ts). Rides on the profile row, so the owner-only policies and the
-- calendar feed (which returns the profile) already cover it.
alter table public.profiles add column own_runs jsonb not null default '[]'::jsonb;
