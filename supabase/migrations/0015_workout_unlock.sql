/* ---------- "Unlock to edit" on a locked workout ---------- */
-- Sets lock 12 hours after a workout ends. Unlocking sets unlocked_at, which opens them for another 12 hours
-- from that moment (lib/plan/workout.ts: locked once now >= greatest(ended_at, unlocked_at) + 12 h). Then they lock again.
alter table public.workout_sessions add column unlocked_at timestamptz;
