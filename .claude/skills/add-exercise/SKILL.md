---
name: add-exercise
description: Add a new exercise (or a new template line for an existing one) to the WorkoutFlex exercise database so it gets a stable key, a demo video, a muscle map, set logging and history, and syncs to Supabase. Use whenever a workout template gains a new exercise or the user asks to add exercises to the library.
---

# Add an exercise

Every built-in exercise lives in code and is synced to the Supabase `exercises` table. Do all steps; the tests enforce them.

1. **Is it new, or a variation of an existing one?** Search `lib/plan/exercises.ts`. If the same movement and load already exists (e.g. "Romanian deadlift, light" → `rdl`), just add the template text to that entry's `lines` and skip to step 5. History should stay continuous across rep/weight changes.

2. **Video** (`lib/plan/videos.ts`): add a `VIDEOS` entry with a short `key`, `name`, a `match` regex for free-text lines, two YouTube ids (main + backup, both embeddable), and a search `query`. Check them with `npm run check-videos`.

3. **Catalog** (`lib/plan/exercises.ts`): add `{ key, name, load, video, lines }`.
   - `key`: lowercase-hyphen, ≤ 40 chars, permanent. Never rename one later.
   - `load`: `weight` (kg × reps), `bodyweight` (reps only) or `time` (seconds).
   - `lines`: the template text before the sets × reps part, exactly as written in `templates.ts`.

4. **Muscles** (`lib/plan/muscles.ts` → `EXERCISE_MUSCLES`): `{ primary: [...], secondary: [...] }` using only ids from `MUSCLES`. If there's no exact region (glute medius, soleus, hip flexors), use the closest one.

5. **Template** (`lib/plan/templates.ts`): write the line as `"Name, qualifier, 3×10"`. The parser reads `N×R`, `N×R–S`, `N×Ss` and `N sets`, plus `each` / `each side`.

6. **Verify:**
   ```bash
   npm test            # mapping, video and muscle checks
   npx tsc --noEmit
   npm run sync-exercises   # needs SUPABASE_SERVICE_ROLE_KEY; Vercel builds run it automatically
   ```

Custom exercises added in the app's Library tab don't need any of this. They're stored per person in Supabase with `owner` set.
