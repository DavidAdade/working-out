/* ---------- moving a workout to another day of the same week ---------- */
-- The workout the plan put on from_date is done on to_date. A swap is two rows.
-- Keyed by date like skips; the plan engine ignores rows that no longer fit after a settings change.
create table public.day_moves (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, from_date),
  unique (user_id, to_date),
  check (from_date <> to_date),
  -- Postgres weeks start on Monday, like the plan's
  check (date_trunc('week', from_date) = date_trunc('week', to_date))
);
alter table public.day_moves enable row level security;
create policy "own moves: read" on public.day_moves for select using (auth.uid() = user_id);
create policy "own moves: insert" on public.day_moves for insert with check (auth.uid() = user_id);
create policy "own moves: delete" on public.day_moves for delete using (auth.uid() = user_id);

-- Replace one week's moves in one transaction, so a swap never half-saves.
create function public.set_week_moves(p_week date, p_moves jsonb) returns void
language sql security invoker set search_path = '' as $$
  delete from public.day_moves where user_id = auth.uid() and from_date >= p_week and from_date < p_week + 7;
  insert into public.day_moves (user_id, from_date, to_date)
  select auth.uid(), (m ->> 'from')::date, (m ->> 'to')::date from jsonb_array_elements(p_moves) m;
$$;
revoke all on function public.set_week_moves(date, jsonb) from public;
grant execute on function public.set_week_moves(date, jsonb) to authenticated;

/* ---------- the calendar feed shows moved days too ---------- */
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
      'tests', coalesce((select jsonb_agg(jsonb_build_object('date', l.date, 'kind', l.kind, 'km', l.km, 'duration_sec', l.duration_sec))
                           from public.logs l where l.user_id = uid and l.kind = 'test'), '[]'::jsonb)
    )
    from public.profiles p where p.id = uid
  );
end;
$$;
