-- What each exercise needs (lib/plan/equipment.ts), for the Library and swap filters. Main one first.
-- Built-ins get theirs from the sync; custom exercises from the Library form. Empty means not tagged.
alter table public.exercises
  add column equipment text[] not null default '{}'
    check (equipment <@ array['bodyweight', 'dumbbell', 'barbell', 'kettlebell', 'cable', 'machine', 'band', 'other']);
