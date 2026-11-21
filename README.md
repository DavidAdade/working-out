# WorkoutFlex

A flexible running and strength training plan and log. Each person sets their own goal, and the plan is generated from their profile.
Each person signs in with their email and password and only ever sees their own plan and logs.

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind · Supabase (Postgres, Auth, row-level security) · Vercel.

## How it fits together

| Path | What it does |
| --- | --- |
| `lib/plan/` | The plan engine. Pure TypeScript, no dependencies. `generatePlan(settings, { skips })` returns weeks → days → blocks. |
| `lib/plan/templates.ts` | Every strength, upper-body and abs session. Edit exercises here. |
| `lib/plan/exercises.ts`, `videos.ts`, `muscles.ts` | The exercise catalog: stable keys, demo videos and muscle maps. Synced to the Supabase `exercises` table on every build (`npm run sync-exercises`). See `.claude/skills/add-exercise`. |
| `supabase/migrations/` | Tables `profiles`, `logs`, `day_overrides`, `set_logs`, `exercises`, all locked down with RLS. |
| `app/actions.ts` | Server Actions: sign-in, settings, gates, skip days, add/delete logs, tokens, weekly check-in. |
| `components/Dock.tsx` | Offline outbox, notices and the rest timer. Sets and sessions logged without signal sync later. |
| `app/cal/[token]`, `app/api/health` | Calendar feed and Apple Health import, each behind a per-person key from Settings → Connections. |
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
7. **Deploy.** Import the repo into Vercel and add the same three env vars, with `NEXT_PUBLIC_SITE_URL` set to the Vercel URL, plus `SUPABASE_SERVICE_ROLE_KEY` (server-only) so each build syncs the exercise library. `vercel.json` handles the rest.

## On your phone

Open the site in Safari → Share → **Add to Home Screen**. It opens full-screen like an app. Sign in with your email and password.

## Adding a person

Sign-ups stay off in Supabase. A person gets in one of two ways (see `app/invite-actions.ts`):

- **Sign-up page with an invite code** (`/signup`): set the code with `npm run invite-setup -- --code '<code>'`. Only its hash is stored.
- **A one-time link** from "Invite someone" in Settings, shown only to the owner (`npm run invite-setup -- --owner <email>`).

They land on **Set up your plan** and get their own plan from their own answers. RLS keeps everyone's data separate.

## Setting up a plan

Nothing is pre-filled from anyone else. Each person picks:

- **Do you run?** Lifting only, lifting with easy runs, or the 5K program (paces, tests and a time trial on a date they set).
- **Training days:** 3 to 6 weekdays.
- **Plan start:** a Monday.
- **5K program only:** current and goal 5K, time trial date, an optional race, and "Coming back from an injury" for a strength-only phase with gates and run-walk weeks.
- **Optional:** up to three areas to track pain for, kg or lb, km or miles.

## Weekly shape

The week is laid out on the days the person chose. Legs twice, as far apart as the days allow, with upper body and abs on the other days; easy runs or the program's runs go around them. Workouts are named for what they train ("Legs: strength", "Upper: pull"), never for where they're done.

Tap **Skip this day** on any day. Its upper-body work folds into the next free lift day as a 2-set version, and the week shows a note if a long run or a test was skipped.

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
