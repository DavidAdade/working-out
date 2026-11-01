/* ---------- swapping one exercise for another on one plan day ---------- */
-- plan_date is the date the PLAN put the workout on (before moves and folds), so a swap follows the
-- workout when it moves. from_key is always the template's exercise key, so swaps never chain.
-- to_key has no foreign key: built-ins can leave the catalog and custom exercises can be deleted; the plan
-- engine ignores a swap it can't resolve, like a move that no longer fits. Logged sets are never touched.
create table public.exercise_swaps (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  plan_date date not null,
  from_key text not null check (from_key ~ '^[a-z0-9-]{1,40}$'),
  to_key text not null check (to_key ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, plan_date, from_key),
  check (from_key <> to_key)
);
alter table public.exercise_swaps enable row level security;
create policy "own swaps: read" on public.exercise_swaps for select using (auth.uid() = user_id);
create policy "own swaps: insert" on public.exercise_swaps for insert with check (auth.uid() = user_id);
create policy "own swaps: update" on public.exercise_swaps for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own swaps: delete" on public.exercise_swaps for delete using (auth.uid() = user_id);

/* ---------- the calendar feed shows swapped exercises too ---------- */
-- Names and load come from the exercises table (built-ins and the person's own), so the feed can name custom ones.
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
