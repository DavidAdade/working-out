-- A signed-in account with no profile row (made before the sign-up trigger, or the row removed by hand) had no
-- way in: profiles has no insert policy, so the app could only bounce between "/" and "/login". The app calls
-- this when the row is missing; it only ever makes the caller's own row, and does nothing when it exists.
create function public.ensure_profile() returns void
language sql security definer set search_path = '' as $$
  insert into public.profiles (id, display_name)
  select u.id, split_part(u.email, '@', 1) from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
$$;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
