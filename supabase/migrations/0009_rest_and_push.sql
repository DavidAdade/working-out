/* ---------- rest timer length ---------- */
-- null = auto (by exercise: 2 min for big lifts, 90 s for other weighted ones, 60 s otherwise)
alter table public.profiles add column rest_seconds int check (rest_seconds between 15 and 600);

/* ---------- web push: one subscription per phone or browser ---------- */
create table public.push_subscriptions (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions: read" on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "own push subscriptions: insert" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "own push subscriptions: update" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subscriptions: delete" on public.push_subscriptions for delete using (auth.uid() = user_id);

/* ---------- pushes waiting for their time ---------- */
-- One row per (person, tag): scheduling a tag again replaces it, deleting it cancels it.
-- sent_at is set by whoever sends it (the short sleeper in the request that scheduled it, or the
-- every-minute sender), in one update, so a push never goes out twice.
create table public.scheduled_pushes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tag text not null check (tag ~ '^[a-z0-9:-]{1,60}$'),
  due_at timestamptz not null,
  title text not null check (length(title) <= 120),
  body text not null default '' check (length(body) <= 300),
  url text not null default '/' check (url ~ '^/' and length(url) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, tag)
);
create index scheduled_pushes_due on public.scheduled_pushes (due_at) where sent_at is null;
alter table public.scheduled_pushes enable row level security;
create policy "own scheduled pushes: read" on public.scheduled_pushes for select using (auth.uid() = user_id);
create policy "own scheduled pushes: insert" on public.scheduled_pushes for insert with check (auth.uid() = user_id);
create policy "own scheduled pushes: update" on public.scheduled_pushes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own scheduled pushes: delete" on public.scheduled_pushes for delete using (auth.uid() = user_id);

/* ---------- the every-minute sender ---------- */
-- /api/push/due is called by pg_cron (see supabase/push-cron.sql, applied by hand) with a shared secret
-- kept in Supabase Vault as 'push_cron_secret'. Like the calendar feed, the route uses the anon key and these
-- security-definer functions, which check the secret; no service role. Until the secret exists they refuse.
create or replace function public.push_cron_ok(p_secret text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  expected text;
begin
  begin
    select decrypted_secret into expected from vault.decrypted_secrets where name = 'push_cron_secret' limit 1;
  exception when others then
    return false;
  end;
  return expected is not null and length(expected) >= 32 and p_secret = expected;
end;
$$;
revoke execute on function public.push_cron_ok(text) from public, anon, authenticated;

-- Claims every due push (marks it sent) and returns it with the person's subscriptions.
-- Pushes more than an hour late are dropped rather than sent, and old sent rows are cleared.
create or replace function public.claim_due_pushes(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  out jsonb;
begin
  if not public.push_cron_ok(p_secret) then return null; end if;
  delete from public.scheduled_pushes
   where (sent_at is not null and sent_at < now() - interval '1 day')
      or (sent_at is null and due_at < now() - interval '1 hour');
  with claimed as (
    update public.scheduled_pushes set sent_at = now()
     where sent_at is null and due_at <= now()
    returning user_id, tag, title, body, url
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tag', c.tag, 'title', c.title, 'body', c.body, 'url', c.url,
           'subs', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.push_subscriptions s where s.user_id = c.user_id), '[]'::jsonb))), '[]'::jsonb)
    into out
    from claimed c;
  return out;
end;
$$;
revoke execute on function public.claim_due_pushes(text) from public;
grant execute on function public.claim_due_pushes(text) to anon;

-- Push services answer 404/410 for a subscription the phone dropped: forget those
create or replace function public.drop_push_subscriptions(p_secret text, p_endpoints text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.push_cron_ok(p_secret) then return; end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;
revoke execute on function public.drop_push_subscriptions(text, text[]) from public;
grant execute on function public.drop_push_subscriptions(text, text[]) to anon;
