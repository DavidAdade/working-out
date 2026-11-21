-- A new profile's time zone was the first person's (America/Toronto). Setup fills in the phone's own zone;
-- until then a new row is in UTC. Existing profiles keep what they have.
alter table public.profiles alter column timezone set default 'UTC';
