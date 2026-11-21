-- New accounts start with no pain area tracked: "knee" was the first person's, not everyone's. Existing profiles
-- keep what they have; the setup form no longer pre-fills it either.
alter table public.profiles alter column pain_areas set default '{}';
