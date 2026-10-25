// One row per exercise, the same shape as the Supabase `exercises` table.
// Built-ins come from the code catalog (exercises.ts + videos.ts + muscles.ts); custom ones are added in the app.

import { EXERCISES, videoOf, type Exercise, type Load } from "./exercises.ts";
import { EXERCISE_MUSCLES, type MuscleId } from "./muscles.ts";

export interface ExerciseInfo {
  key: string;
  name: string;
  load: Load;
  primary_muscles: MuscleId[];
  secondary_muscles: MuscleId[];
  video_ids: string[];
  video_query: string | null;
  lines: string[];
  /** null for built-ins */
  owner: string | null;
}

export function builtinRows(): ExerciseInfo[] {
  return EXERCISES.map((e) => {
    const v = videoOf(e);
    const m = EXERCISE_MUSCLES[e.key] ?? { primary: [], secondary: [] };
    return {
      key: e.key,
      name: e.name,
      load: e.load,
      primary_muscles: [...m.primary],
      secondary_muscles: [...m.secondary],
      video_ids: v ? [...v.ids] : [],
      video_query: v?.query ?? e.name,
      lines: [...e.lines],
      owner: null,
    };
  });
}

/** Lets set logging treat a custom exercise like a built-in one. */
export const asExercise = (x: ExerciseInfo): Exercise => ({ key: x.key, name: x.name, load: x.load, lines: x.lines });

/** "Bulgarian split squat" → "bulgarian-split-squat", with a suffix so custom keys never clash with built-ins or other people's. */
export function customKey(name: string, suffix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  return `${slug || "exercise"}-${suffix}`.slice(0, 40);
}

/** "https://youtu.be/abc…", "…watch?v=abc…", "…/shorts/abc…" or a bare 11-character id → the id. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
