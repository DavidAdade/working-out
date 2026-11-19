-- A template can come with supersets of its own (Block.supersets). A saved row with off = true is not a group:
-- it switches the plan's superset with exactly those exercises off for that person ("Remove from superset").
alter table public.supersets add column off boolean not null default false;

-- The day a person's plan switched to their own runs (profiles.own_runs). Days before it keep what the plan
-- had, so a week already under way isn't rewritten. Null (no default) takes the whole list.
alter table public.profiles add column own_runs_from date;
