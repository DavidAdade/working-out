-- Only signed-in people read the exercise database (the anon key alone sees nothing).
drop policy "exercises: read built-in and own" on public.exercises;
create policy "exercises: read built-in and own" on public.exercises for select to authenticated using (owner is null or owner = auth.uid());
