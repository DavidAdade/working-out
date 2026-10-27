# WorkoutFlex

Next.js 15 (App Router, Server Actions) + Supabase (Postgres, Auth, RLS) + Tailwind, deployed on Vercel. Used mostly on an iPhone mid-workout, so every change must work at 390px wide with 44px tap targets and 16px inputs.

## Architecture

- **Plan engine** (`lib/plan/`, pure TS, runs under `node --experimental-strip-types`): the plan is never stored. `generatePlan(settings)` rebuilds weeks → days → blocks from the profile. Template lines live in `templates.ts`.
- **Exercise database**, one source of truth:
  - `lib/plan/exercises.ts`: catalog of built-in exercises (`key`, `name`, `load`, `video`, template `lines`)
  - `lib/plan/videos.ts`: YouTube ids per video key (main + backup)
  - `lib/plan/muscles.ts`: muscle ids, groups, body-map shapes, and `EXERCISE_MUSCLES` per exercise key
  - `lib/plan/catalog.ts`: joins the three into rows shaped like the Supabase `exercises` table
  - `scripts/sync-exercises.ts`: upserts those rows into Supabase. Runs before every `npm run build` (so every Vercel deploy) when `SUPABASE_SERVICE_ROLE_KEY` is set
  - Custom exercises people add in the Library tab are rows with `owner = auth.uid()`; the sync never touches them
- **Set logs** (`set_logs`) store `exercise_key`, never template text, plus `plan_date` when a session is done early. Progression logic (stalls, bests, suggested weights) is in `lib/plan/progress.ts`.
- **Every rule is per profile.** Nothing may depend on one person's dates: anchor to the profile's start, time trial and race, and add a case to `PROFILES` in `plan.test.ts` when adding a rule.
  - `paces.ts`: training paces from the latest 5K/10K test (`fitness5k`), goal pace that finishes under the goal
  - `adapt.ts`: `planFor()` is the plan as shown everywhere (paces from tests, skips, then pain warnings and unpassed gates change the coming week)
  - Moves (`day_moves`, one row per workout moved within its Mon–Sun week) are applied in `generatePlan` before skips, so every view and the `.ics` feed see the moved days. `moveDay`/`catchUp` in `generate.ts` build a week's full move list; `arrange` refuses the time trial, the race, other weeks and back-to-back run-walk days. Logged days never move, so `set_logs.plan_date` stays correct
  - `ontrack.ts`: the Today verdict, consistency, pain trend, wins. `ics.ts`: the calendar feed
- **Offline:** `components/Dock.tsx` is a per-user outbox (localStorage). Set, unset and session writes go through `send()`, which saves them on the phone with no signal and replays them in order. New write paths that run mid-workout should go through it too; anything else must catch network errors rather than throw.
- **Token routes:** `/cal/<token>.ics` and `/api/health` use the anon key and call security-definer SQL functions (`calendar_feed`, `ingest_workout`) that look up a hashed per-user token from `user_tokens`. Never use the service role for them.
- **AI check-in:** `lib/coach/review.ts` via the AI Gateway (`anthropic/claude-sonnet-5.5`, string model id). Turned off (card hidden, action refuses) unless `AI_GATEWAY_API_KEY` is set, locally and on Vercel. Advice only: suggestions are filtered against the plan and applied by the person. Cached per week in `ai_reviews`.
- **UI**: `components/Dashboard.tsx` tabs → `TodayPanel`, `PlanPanel`/`WeekCard`/`DayView`, `LogPanel`, `ProgressPanel`, `LibraryPanel`. `components/Sets.tsx` holds set logging and the exercise sheet (muscle map + video + history), opened anywhere with `openHistory(key)`.

## Testing

- `test@mailinator.com` is the shared test account. Mailinator inboxes are public and this repo is public, so treat it as untrusted: never give it real data. `npm run seed:test` resets it to ~5 weeks of history (runs, a 5K test, lifting sets, a stalled `lat-pulldown` and a dropped `db-ohp` so both warnings show, a skipped day, a cutback week). The script refuses any non-`@mailinator.com` address.
- Never run `next build` in this folder while `npm run dev` is running: both write `.next` and the dev server breaks. Build in a separate worktree instead (`npx next build` there skips the exercise sync).
- `lib/coach/review.test.ts` tests the AI check-in with `MockLanguageModelV4`; no key needed.

## Rules

- **Adding or changing an exercise:** follow `.claude/skills/add-exercise/SKILL.md`. Never rename an existing `key`: logged history is stored by it.
- **Schema changes:** add a new numbered file in `supabase/migrations/` (never edit an applied one), enable RLS with owner-only policies like the others, then `supabase db push`.
- `npm test`, `npx tsc --noEmit` and `npm run build` must pass before committing. The tests fail if a template line has no exercise, or an exercise has no video or muscles.
- Secrets: `SUPABASE_SERVICE_ROLE_KEY` is server/build-only. Never prefix it `NEXT_PUBLIC_` or import it in app code.
