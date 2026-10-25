-- Morning check-ins, sets logged early for a later plan day, Apple Health imports, a calendar feed,
-- cached AI reviews and a rest-timer setting. Everything stays owner-only; the two token routes go through
-- security-definer functions that only ever touch the token owner's rows.

/* ---------- logs: check-ins and imported workouts ---------- */
alter table public.logs drop constraint logs_kind_check;
alter table public.logs add constraint logs_kind_check check (kind in ('run', 'test', 'strength', 'walk', 'check'));
alter table public.logs
  add column source text not null default 'manual' check (source in ('manual', 'health')),
  -- the workout's id in Apple Health, so re-sending it updates instead of duplicating
  add column external_id text check (external_id is null or char_length(external_id) <= 100),
  add column avg_hr smallint check (avg_hr is null or avg_hr between 30 and 250);
create unique index logs_external on public.logs (user_id, source, external_id) where external_id is not null;

/* ---------- sets done early keep the plan day they belong to ---------- */
alter table public.set_logs add column plan_date date;

/* ---------- skipping a day twice (double tap, two devices) updates instead of failing ---------- */
create policy "own skips: update" on public.day_overrides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* ---------- gates: change one key without overwriting the others ---------- */
create function public.set_gate(p_key text, p_value boolean) returns void
language sql security invoker set search_path = '' as $$
  update public.profiles set gates = gates || jsonb_build_object(p_key, p_value) where id = auth.uid();
$$;

/* ---------- settings ---------- */
alter table public.profiles add column rest_timer boolean not null default true;

/* ---------- per-person tokens for the calendar feed and Apple Health ---------- */
create table public.user_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('calendar', 'health')),
  -- sha256 of the token, hex; the token itself is shown once and never stored
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (user_id, purpose)
);
alter table public.user_tokens enable row level security;
create policy "own tokens: read" on public.user_tokens for select using (auth.uid() = user_id);
create policy "own tokens: insert" on public.user_tokens for insert with check (auth.uid() = user_id);
create policy "own tokens: update" on public.user_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tokens: delete" on public.user_tokens for delete using (auth.uid() = user_id);

-- Plan inputs for one calendar token: settings, skipped days and tests (tests set paces).
create function public.calendar_feed(p_token text) returns jsonb
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
      'tests', coalesce((select jsonb_agg(jsonb_build_object('date', l.date, 'kind', l.kind, 'km', l.km, 'duration_sec', l.duration_sec))
                           from public.logs l where l.user_id = uid and l.kind = 'test'), '[]'::jsonb)
    )
    from public.profiles p where p.id = uid
  );
end;
$$;

-- One workout from an Apple Health shortcut: {id, type, start, duration_s, distance_km, avg_hr}.
create function public.ingest_workout(p_token text, p_workout jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  tz text;
  act text := lower(coalesce(p_workout ->> 'type', ''));
  k text;
  d date;
  km numeric;
  secs integer;
  hr integer;
  ext text := left(p_workout ->> 'id', 100);
begin
  update public.user_tokens set last_used_at = now()
   where purpose = 'health' and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  returning user_id into uid;
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unknown token'); end if;

  k := case when act like '%run%' then 'run' when act like '%walk%' or act like '%hik%' then 'walk' end;
  if k is null then return jsonb_build_object('ok', true, 'skipped', 'not a run or walk'); end if;
  if ext is null or ext = '' then return jsonb_build_object('ok', false, 'error', 'missing id'); end if;

  select timezone into tz from public.profiles where id = uid;
  d := ((p_workout ->> 'start')::timestamptz at time zone coalesce(tz, 'America/Toronto'))::date;
  km := round((p_workout ->> 'distance_km')::numeric, 2);
  secs := round((p_workout ->> 'duration_s')::numeric);
  hr := round((p_workout ->> 'avg_hr')::numeric);
  if km is not null and (km < 0 or km > 100) then return jsonb_build_object('ok', false, 'error', 'distance out of range'); end if;
  if secs is not null and (secs < 0 or secs > 86400) then return jsonb_build_object('ok', false, 'error', 'duration out of range'); end if;
  if hr is not null and (hr < 30 or hr > 250) then hr := null; end if;

  insert into public.logs (user_id, date, kind, title, km, duration_sec, source, external_id, avg_hr)
  values (uid, d, k, case k when 'run' then 'Run (Apple Health)' else 'Walk (Apple Health)' end, km, secs, 'health', ext, hr)
  on conflict (user_id, source, external_id) where external_id is not null
  do update set date = excluded.date, km = excluded.km, duration_sec = excluded.duration_sec, avg_hr = excluded.avg_hr;
  return jsonb_build_object('ok', true, 'date', d, 'kind', k);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'bad workout data');
end;
$$;

revoke all on function public.calendar_feed(text) from public;
revoke all on function public.ingest_workout(text, jsonb) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
grant execute on function public.ingest_workout(text, jsonb) to anon, authenticated;

/* ---------- weekly AI check-in, cached so each week costs one call ---------- */
create table public.ai_reviews (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_start date not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.ai_reviews enable row level security;
create policy "own reviews: read" on public.ai_reviews for select using (auth.uid() = user_id);
create policy "own reviews: insert" on public.ai_reviews for insert with check (auth.uid() = user_id);
create policy "own reviews: update" on public.ai_reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reviews: delete" on public.ai_reviews for delete using (auth.uid() = user_id);
