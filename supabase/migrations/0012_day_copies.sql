/* ---------- doing another day's workout instead ("Swap for another day") ---------- */
-- The day the plan put on plan_date does the workout the plan put on source_date instead, anywhere in the program.
-- Both are the PLAN's own dates (before moves), so a copy follows its day when it moves, like exercise_swaps.
-- The plan engine always copies the template workout (copies never chain) and ignores rows that no longer fit
-- after a settings change, or that touch a test day, the time trial or the race. Logged sets are never touched.
create table public.day_copies (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  plan_date date not null,
  source_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_date),
  check (plan_date <> source_date)
);
alter table public.day_copies enable row level security;
create policy "own copies: read" on public.day_copies for select using (auth.uid() = user_id);
create policy "own copies: insert" on public.day_copies for insert with check (auth.uid() = user_id);
create policy "own copies: update" on public.day_copies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own copies: delete" on public.day_copies for delete using (auth.uid() = user_id);

-- Set (or clear, with a null source) one day's copy and drop that day's exercise swaps in one transaction:
-- the swaps were made on the workout being replaced.
create function public.set_day_copy(p_plan_date date, p_source date) returns void
language sql security invoker set search_path = '' as $$
  delete from public.exercise_swaps where user_id = auth.uid() and plan_date = p_plan_date;
  delete from public.day_copies where user_id = auth.uid() and plan_date = p_plan_date;
  insert into public.day_copies (user_id, plan_date, source_date)
  select auth.uid(), p_plan_date, p_source where p_source is not null;
$$;
revoke all on function public.set_day_copy(date, date) from public;
grant execute on function public.set_day_copy(date, date) to authenticated;

/* ---------- the calendar feed shows copied days too ---------- */
create or replace function public.calendar_feed(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  update public.user_tokens set last_used_at = now()
   where purpose = 'calendar' and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  returning user_id into uid;
  if uid is null then return null; end if;
  return (
    select jsonb_build_object(
      'profile', to_jsonb(p) - 'gates',
      'skips', coalesce((select jsonb_agg(d.date) from public.day_overrides d where d.user_id = uid and d.status = 'skipped'), '[]'::jsonb),
      'moves', coalesce((select jsonb_agg(jsonb_build_object('from', m.from_date, 'to', m.to_date)) from public.day_moves m where m.user_id = uid), '[]'::jsonb),
      'copies', coalesce((select jsonb_agg(jsonb_build_object('planDate', c.plan_date, 'source', c.source_date)) from public.day_copies c where c.user_id = uid), '[]'::jsonb),
      'swaps', coalesce((select jsonb_agg(jsonb_build_object('date', s.plan_date, 'from', s.from_key, 'to', s.to_key, 'name', e.name, 'load', e.load))
                           from public.exercise_swaps s
                           join public.exercises e on e.key = s.to_key and (e.owner is null or e.owner = uid)
                          where s.user_id = uid), '[]'::jsonb),
      'tests', coalesce((select jsonb_agg(jsonb_build_object('date', l.date, 'kind', l.kind, 'km', l.km, 'duration_sec', l.duration_sec))
                           from public.logs l where l.user_id = uid and l.kind = 'test'), '[]'::jsonb)
    )
    from public.profiles p where p.id = uid
  );
end;
$$;
