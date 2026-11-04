# WorkoutFlex

Next.js 15 (App Router, Server Actions) + Supabase (Postgres, Auth, RLS) + Tailwind, deployed on Vercel. Used mostly on an iPhone mid-workout, so every change must work at 390px wide with 44px tap targets and 16px inputs.

## Architecture

- **Plan engine** (`lib/plan/`, pure TS, runs under `node --experimental-strip-types`): the plan is never stored. `generatePlan(settings)` rebuilds weeks → days → blocks from the profile. Template lines live in `templates.ts`.
- **Exercise database**, one source of truth:
  - `lib/plan/exercises.ts`: catalog of built-in exercises (`key`, `name`, `load`, `video`, template `lines`)
  - `lib/plan/videos.ts`: YouTube ids per video key (main + backup)
  - `lib/plan/muscles.ts`: muscle ids, groups, body-map shapes, and `EXERCISE_MUSCLES` per exercise key
  - `lib/plan/equipment.ts`: equipment ids (bodyweight, dumbbell, barbell, kettlebell, cable, machine, band, other) and `EXERCISE_EQUIPMENT` per exercise key, for the Library and swap filters
  - `lib/plan/catalog.ts`: joins the four into rows shaped like the Supabase `exercises` table
  - `scripts/sync-exercises.ts`: upserts those rows into Supabase. Runs before every `npm run build` (so every Vercel deploy) when `SUPABASE_SERVICE_ROLE_KEY` is set
  - Custom exercises people add in the Library tab are rows with `owner = auth.uid()`; the sync never touches them
- **Set logs** (`set_logs`) store `exercise_key`, never template text, plus `plan_date` when a session is done early. Progression logic (stalls, bests, suggested weights) is in `lib/plan/progress.ts`.
- **Every rule is per profile.** Nothing may depend on one person's dates: anchor to the profile's start, time trial and race, and add a case to `PROFILES` in `plan.test.ts` when adding a rule.
  - `paces.ts`: training paces from the latest 5K/10K test (`fitness5k`), goal pace that finishes under the goal
  - `adapt.ts`: `planFor()` is the plan as shown everywhere (paces from tests, skips, then pain warnings and unpassed gates change the coming week)
  - Moves (`day_moves`, one row per workout moved within its Mon–Sun week) are applied in `generatePlan` before skips, so every view and the `.ics` feed see the moved days. `moveDay`/`catchUp` in `generate.ts` build a week's full move list; `arrange` refuses the time trial, the race, other weeks and back-to-back run-walk days. Logged days never move, so `set_logs.plan_date` stays correct
  - Exercise swaps (`exercise_swaps`, one row per template exercise done as another on one plan day) are keyed by `Block.planDate`, the plan's own date, so they follow moves and folds. `applySwaps` in `swaps.ts` runs last (in `planFor`, the `.ics` route and the AI check-in) and sets a `Block.swaps` overlay; template `items` never change, so use `itemLine`/`itemKey` to read a line as shown. Rows whose original or new exercise is gone are ignored. Logged sets are never re-keyed: sets under an exercise a day doesn't show are listed as "Also logged"
  - Supersets (`superset_links`, one row per template line linked to the next line in its block, keyed by `Block.planDate` and the template key, so they follow moves and folds and survive swaps). `applySupersets` in `supersets.ts` runs after swaps in `planFor` and sets `Block.supersets` (item index groups); `dayExercises` gives each member its letter (A1, A2…) and `nextInRound` drives logging: no rest mid-round, the group's longest rest after it, then the next exercise opens. Link/unlink goes through the Dock outbox (`components/Superset.tsx`); the `.ics` feed and AI check-in ignore them
  - `ontrack.ts`: the Today verdict, consistency, pain trend, wins. `ics.ts`: the calendar feed
- **Offline:** `components/Dock.tsx` is a per-user outbox (localStorage). Set, unset and session writes go through `send()`, which saves them on the phone with no signal and replays them in order. New write paths that run mid-workout should go through it too; anything else must catch network errors rather than throw. Replays hold a Web Lock so two tabs never send the same write; ops the server refuses on replay are kept and explained in `SyncSheet.tsx` (opened from the "not synced" banner after 2 min or 5 failed tries).
  - Every live load saves the Dashboard's props on the phone (`lib/offline.ts`, IndexedDB, one person, `CACHE_VERSION`: bump it when `DashboardProps` changes shape). `OfflineApp` renders from that copy on the "/" error screen and on `/offline`, with `OfflineBanner` probing `/api/ping` to go live again. `/login` and Sign out clear it.
  - `public/sw.js` (registered per build by `ServiceWorker.tsx` as `/sw.js?v=<build>`): network-first pages falling back to the cached static `/offline` page, cache-first `/_next/static` and fonts; never caches pages with data, RSC, POSTs, `/api`, `/auth`, `/cal` or `/login`. Push handlers live in `public/sw-push.js` (imported if present).
- **Sound:** only through `lib/audio.ts` (`tick`, `chime`, `celebrate`, `fanfare`, `prime`, `release`). It sets the iOS audio session to "ambient" so sounds mix with Apple Music/Spotify, and plays nothing where that API is missing. Never create or resume an `AudioContext`, `<audio>` or `<video>` on load or when the app returns to the screen: that stops the person's music.
- **Rest timer:** `components/RestTimer.tsx` (provider + view), stored per person in localStorage so it shows on every page.
- **Push:** `lib/push.ts` (`schedulePush`, `cancelPush`, `sendNow`), off unless `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are set. Waits up to `SLEEP_MAX_SEC` are sent by the scheduling request itself (`after()`); longer ones by `/api/push/due`, which pg_cron calls every minute (`supabase/push-cron.sql`, applied by hand). Handlers are in `public/sw-push.js`, imported by `public/sw.js`.
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
