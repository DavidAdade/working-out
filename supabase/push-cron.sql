-- Every-minute push sender. NOT a migration: paste it into the Supabase SQL editor once, after
-- 0009_rest_and_push.sql is applied and the VAPID env vars are set on Vercel.
--
-- What it does: every minute, pg_cron asks pg_net to POST to /api/push/due with a shared secret.
-- That route claims due rows from scheduled_pushes (claim_due_pushes checks the same secret, kept in
-- Supabase Vault) and sends them. It is the only sender for long delays (e.g. "Workout auto-ended"
-- 4 hours after a start) and the safety net for short ones (the rest timer sends its own on time).
--
-- Before running, replace both placeholders:
--   <SECRET>   a long random string, e.g. the output of `openssl rand -hex 32`. Never commit it.
--   <APP-URL>  your production URL, e.g. https://workoutflex.vercel.app (no trailing slash)
-- The secret lives only in Vault, so nothing else needs it (no env var on Vercel).
-- To change it later: select vault.update_secret((select id from vault.secrets where name = 'push_cron_secret'), '<NEW>');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<SECRET>', 'push_cron_secret', 'Shared secret for /api/push/due');
select vault.create_secret('<APP-URL>', 'push_cron_url', 'Base URL the push sender calls');

-- Replaces the job if it already exists
select cron.schedule(
  'send-due-pushes',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_url') || '/api/push/due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  -- Skip the call entirely when nothing is due, so idle minutes cost nothing on Vercel
  where exists (select 1 from public.scheduled_pushes where sent_at is null and due_at <= now() + interval '5 seconds');
  $$
);

-- Check it:   select * from cron.job_run_details order by start_time desc limit 5;
--             select * from net._http_response order by created desc limit 5;
-- Turn off:   select cron.unschedule('send-due-pushes');
