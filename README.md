# Road to Sub-30

A knee-safe training plan and log: injury recovery → sub-30 5K time trial → half marathon.
Each person signs in with a magic link and only ever sees their own plan and logs.

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind · Supabase (Postgres, Auth, row-level security) · Vercel.

## How it fits together

| Path | What it does |
| --- | --- |
| `lib/plan/` | The plan engine. Pure TypeScript, no dependencies. `generatePlan(settings, { skips })` returns weeks → days → blocks. |
| `lib/plan/templates.ts` | Every strength, upper-body and abs session. Edit exercises here. |
| `supabase/migrations/0001_init.sql` | Tables `profiles`, `logs`, `day_overrides`, all locked to their owner with RLS. |
| `app/actions.ts` | Server Actions: sign-in, settings, gates, skip days, add/delete logs. |
| `components/` | Today, Plan, Log, Progress panels. |

The plan is never stored. It is regenerated from each person's settings, so changing a date re-plans everything instantly. Only logs, skipped days, gate ticks and settings live in the database.

## Setup

1. **Supabase project.** Create one, then apply the schema: `supabase link --project-ref YOUR-REF && supabase db push`, or paste `supabase/migrations/0001_init.sql` into the SQL editor.
2. **Lock sign-ups.** Authentication → Sign In / Providers → turn off **Allow new users to sign up**. Add people under Authentication → Users → **Add user → Create new user** with an email and password (tick auto-confirm).
3. **Sign-in.** People sign in with that email and password, which works inside a home-screen app. The emailed magic link is a fallback and has to be opened in the same browser that requested it.
4. **Redirect URLs.** Authentication → URL Configuration: set Site URL to your Vercel URL and add `http://localhost:3000/**` and `https://YOUR-APP.vercel.app/**` to the redirect list.
5. **Env vars.** Fill in `.env.local` (template in `.env.example`) with the URL and anon key from Project Settings → API.
6. **Run it.**
   ```bash
   npm install
   npm test        # plan engine tests (Node 22.6+)
   npm run dev
   ```
7. **Deploy.** Import the repo into Vercel and add the same three env vars, with `NEXT_PUBLIC_SITE_URL` set to the Vercel URL. `vercel.json` handles the rest.

## On your phone

Open the site in Safari → Share → **Add to Home Screen**. It opens full-screen like an app. Sign in with your email and password.

## Adding a person (e.g. your wife)

Authentication → Users → **Add user → Create new user** with her email with a password (tick auto-confirm). She signs in with that, lands on **Set up your plan**, and gets her own plan from her own times and dates. RLS keeps her data and yours separate. Untick "Coming back from an injury" for anyone who doesn't need the gates and run-walk weeks.

## Your settings

After your first sign-in you'll see the setup form. These are the values from our planning:

| Field | Value |
| --- | --- |
| Current 5K / Goal 5K | 35:00 / 29:59 |
| Running starts | 2026-11-16 (move to 2026-11-30 if the gates aren't passing) |
| Coming back from injury | ✓, strength-only phase starts 2026-10-19 |
| Time trial | 2027-03-26 |
| Race | Toronto Marathon: half, 2027-05-02, goal 2:30:00–2:45:00 |
| Pain areas | knee, foot, heel |

Or paste this in the SQL editor after you've signed in once:

```sql
update public.profiles set
  start_date = '2026-11-16', recovery_start = '2026-10-19', returning_from_injury = true,
  time_trial_date = '2027-03-26', race_date = '2027-05-02', race_name = 'Toronto Marathon: half',
  current_5k_sec = 2100, goal_5k_sec = 1800, half_goal_min_sec = 9000, half_goal_max_sec = 9900,
  pain_areas = '{knee,foot,heel}'
where id = (select id from auth.users where email = 'YOUR-EMAIL');
```

## Weekly shape

- **Mon (gym):** legs + upper pull + abs
- **Tue:** easy run
- **Wed:** quality run, then condo upper push + abs
- **Thu (condo):** knee-focused legs + back/arms + abs
- **Fri:** long run, no lifting

On a 4-day week, tap **Skip this day** on any day. Its upper-body work folds into the next free lift day as a 2-set version, and the week shows a note if you skipped the long run or a test.

## Exercise videos

Tap any exercise name with a ▶ to open a demo video in a popup. Videos live in `lib/plan/videos.ts`, each with a main and a backup YouTube id. If YouTube reports one as removed or not embeddable, the popup switches to the backup, then offers a YouTube search.

To find dead links:

```bash
npm run check-videos
```

It prints `DEAD` or `NOEMBED` next to any bad id. Paste the output to Claude for replacements, or swap the id in `videos.ts` yourself (the 11 characters after `v=` in a YouTube URL).

## Pain rules built into the Today tab

- 3/10 on any area → hold this week's volume
- 4+/10 → make the next run easy and short, or walk
- 4+/10 on the same area two runs in a row → stop running and see a physio
