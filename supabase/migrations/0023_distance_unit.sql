-- Distances and paces in kilometres or miles, like weights in kg or lb. Everything is still stored in km:
-- this is only how the person reads and types them.
alter table public.profiles add column distance_unit text not null default 'km' check (distance_unit in ('km', 'mi'));
