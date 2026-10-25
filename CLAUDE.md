# Road to Sub-30

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
- **Set logs** (`set_logs`) store `exercise_key`, never template text. Progression logic is in `lib/plan/progress.ts`.
- **UI**: `components/Dashboard.tsx` tabs → `TodayPanel`, `PlanPanel`/`WeekCard`/`DayView`, `LogPanel`, `ProgressPanel`, `LibraryPanel`. `components/Sets.tsx` holds set logging and the exercise sheet (muscle map + video + history), opened anywhere with `openHistory(key)`.

## Rules

- **Adding or changing an exercise:** follow `.claude/skills/add-exercise/SKILL.md`. Never rename an existing `key`: logged history is stored by it.
- **Schema changes:** add a new numbered file in `supabase/migrations/` (never edit an applied one), enable RLS with owner-only policies like the others, then `supabase db push`.
- `npm test`, `npx tsc --noEmit` and `npm run build` must pass before committing. The tests fail if a template line has no exercise, or an exercise has no video or muscles.
- Secrets: `SUPABASE_SERVICE_ROLE_KEY` is server/build-only. Never prefix it `NEXT_PUBLIC_` or import it in app code.
