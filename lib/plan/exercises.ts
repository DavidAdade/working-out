// The exercise catalog: the single source for every built-in exercise.
// Each entry links its set-logging key, its demo video (lib/plan/videos.ts) and its muscles (lib/plan/muscles.ts).
// `npm run sync-exercises` (also run on every Vercel build) copies it into the Supabase `exercises` table.
//
// History is stored by `key`, so never rename a key: change `name` or the template lines instead.
// `lines` lists the template text (before the sets × reps part) that belongs to each exercise.
// plan.test.ts checks every loggable template line maps to exactly one exercise, and every exercise
// has a video and muscles. See .claude/skills/add-exercise for the full checklist.

import { VIDEOS, videoFor as videoByText, type ExerciseVideo } from "./videos.ts";

export type Load = "weight" | "bodyweight" | "time";

export interface Exercise {
  key: string;
  name: string;
  load: Load;
  /** Key into VIDEOS in videos.ts */
  video?: string;
  lines: string[];
}

export const EXERCISES: Exercise[] = [
  // calves
  { key: "calf-raise", name: "Calf raise", load: "weight", video: "calf", lines: ["Calf raises, straight knee", "Calf raises, working toward single-leg"] },
  { key: "calf-raise-bent", name: "Bent-knee calf raise", load: "weight", video: "calf-bent", lines: ["Calf raises, bent knee"] },
  { key: "db-calf-raise", name: "DB calf raise", load: "weight", video: "calf", lines: ["DB calf raises", "Calf raises"] },
  { key: "sl-calf-raise", name: "Single-leg calf raise", load: "weight", video: "calf-single", lines: ["Single-leg calf raise", "Weighted single-leg calf raise"] },
  { key: "sl-calf-raise-bent", name: "Bent-knee single-leg calf raise", load: "weight", video: "calf-bent", lines: ["Bent-knee single-leg calf raise"] },

  // hips and glutes
  { key: "glute-bridge", name: "Glute bridge", load: "bodyweight", video: "bridge", lines: ["Glute bridge", "Glute bridge → single-leg"] },
  { key: "db-glute-bridge", name: "DB glute bridge", load: "weight", video: "bridge", lines: ["Glute bridge with DB on hips"] },
  { key: "sl-glute-bridge", name: "Single-leg glute bridge", load: "bodyweight", video: "bridge-single", lines: ["Single-leg glute bridge"] },
  { key: "band-side-steps", name: "Banded side steps", load: "bodyweight", video: "band-walk", lines: ["Banded side steps"] },
  { key: "bird-dog", name: "Bird dog", load: "bodyweight", video: "bird-dog", lines: ["Bird dog"] },

  // hinges, squats, steps
  { key: "rdl", name: "Romanian deadlift", load: "weight", video: "rdl", lines: ["Romanian deadlift", "Romanian deadlift, light"] },
  { key: "db-rdl", name: "DB Romanian deadlift", load: "weight", video: "rdl-db", lines: ["DB Romanian deadlift, light"] },
  { key: "sl-db-rdl", name: "Single-leg DB RDL", load: "weight", video: "rdl-single", lines: ["Single-leg DB Romanian deadlift"] },
  { key: "leg-curl", name: "Leg curl", load: "weight", video: "leg-curl", lines: ["Leg curl machine, light-moderate"] },
  { key: "split-squat", name: "Split squat", load: "weight", video: "split", lines: ["Split squat, bodyweight to light"] },
  { key: "bulgarian-split-squat", name: "Bulgarian split squat", load: "weight", video: "split-bulgarian", lines: ["Bulgarian split squat"] },
  { key: "goblet-split-squat", name: "Goblet split squat", load: "weight", video: "split-goblet", lines: ["Goblet split squat"] },
  { key: "step-up", name: "Step-up", load: "weight", video: "step-up", lines: ["Step-ups, low box", "Step-ups, knee height"] },
  { key: "step-down", name: "Slow step-down", load: "bodyweight", video: "step-down", lines: ["Slow step-downs, 4-second lower", "Slow step-downs"] },

  // upper pull
  { key: "lat-pulldown", name: "Lat pulldown", load: "weight", video: "lat-pulldown", lines: ["Lat pulldown or assisted pull-ups"] },
  { key: "cable-row", name: "Seated cable row", load: "weight", video: "cable-row", lines: ["Seated cable row"] },
  { key: "face-pull", name: "Face pull", load: "weight", video: "face-pull", lines: ["Face pulls"] },
  { key: "curl", name: "Curl", load: "weight", video: "curl", lines: ["Cable or DB curl"] },
  { key: "db-row", name: "One-arm DB row", load: "weight", video: "db-row", lines: ["One-arm DB row"] },
  { key: "rear-delt-fly", name: "Rear-delt fly", load: "weight", video: "rear-delt", lines: ["Rear-delt fly"] },
  { key: "hammer-curl", name: "Hammer curl", load: "weight", video: "hammer", lines: ["Hammer curls"] },

  // upper push
  { key: "db-press", name: "DB press", load: "weight", video: "floor-press", lines: ["DB floor or bench press"] },
  { key: "push-up", name: "Push-up", load: "bodyweight", video: "push-up", lines: ["Push-ups"] },
  { key: "db-ohp", name: "DB overhead press", load: "weight", video: "ohp", lines: ["DB overhead press"] },
  { key: "lateral-raise", name: "Lateral raise", load: "weight", video: "lateral-raise", lines: ["Lateral raises"] },
  { key: "triceps-ext", name: "Overhead triceps extension", load: "weight", video: "oh-triceps", lines: ["Overhead DB triceps extension"] },
  { key: "skull-crusher", name: "Skull crusher", load: "weight", video: "skull", lines: ["DB skull crushers or close-grip push-ups"] },

  // core
  { key: "hanging-knee-raise", name: "Hanging knee raise", load: "bodyweight", video: "hanging-knee", lines: ["Hanging knee raises"] },
  { key: "cable-crunch", name: "Cable crunch", load: "weight", video: "cable-crunch", lines: ["Cable crunch"] },
  { key: "pallof-press", name: "Pallof press", load: "weight", video: "pallof", lines: ["Pallof press"] },
  { key: "dead-bug", name: "Dead bug", load: "bodyweight", video: "dead-bug", lines: ["Dead bug"] },
  { key: "reverse-crunch", name: "Reverse crunch", load: "bodyweight", video: "reverse-crunch", lines: ["Reverse crunch"] },
  { key: "russian-twist", name: "Russian twist", load: "weight", video: "russian-twist", lines: ["Russian twist with DB"] },
  { key: "plank", name: "Plank", load: "time", video: "plank", lines: ["Plank"] },
  { key: "side-plank", name: "Side plank", load: "time", video: "side-plank", lines: ["Side plank"] },
  { key: "hollow-hold", name: "Hollow hold", load: "time", video: "hollow", lines: ["Hollow hold"] },
];

const BY_KEY = new Map(EXERCISES.map((e) => [e.key, e]));
const BY_LINE = new Map(EXERCISES.flatMap((e) => e.lines.map((l) => [l.toLowerCase(), e] as const)));

export const exerciseByKey = (key: string) => BY_KEY.get(key);

export interface Target {
  sets: number;
  /** Lower end of the rep range, e.g. 8 for "3×8–10" */
  reps: number | null;
  /** Upper end of the range, e.g. 10 for "3×8–10"; null for a single number */
  repsMax: number | null;
  sec: number | null;
  /** "each" or "each side": log one side's numbers */
  each: boolean;
}

// "3×10", "3×8–10", "3×40s", "3 sets"
const SETS_RE = /,\s*(\d+)\s*(?:×\s*(\d+)(?:\s*[–-]\s*(\d+))?(s)?|sets?)\b/;

/** The exercise and its target for a template line, or null if it isn't loggable (walks, gate checks, free text). */
export function parseLine(line: string): { exercise: Exercise; target: Target; name: string } | null {
  const m = SETS_RE.exec(line);
  if (!m) return null;
  // Everything before the sets × reps part, e.g. "Romanian deadlift, light"
  const name = line.slice(0, m.index).trim();
  const exercise = BY_LINE.get(name.toLowerCase());
  if (!exercise) return null;
  const n = Number(m[2] ?? NaN);
  return {
    exercise,
    name,
    target: {
      sets: Number(m[1]),
      reps: m[4] || Number.isNaN(n) ? null : n,
      repsMax: m[3] && !m[4] ? Number(m[3]) : null,
      sec: m[4] ? n : null,
      each: /\beach\b/.test(line.slice(m.index)),
    },
  };
}

const VIDEO_BY_KEY = new Map(VIDEOS.map((v) => [v.key, v]));

/** The demo video for an exercise. */
export const videoOf = (e: Pick<Exercise, "video">): ExerciseVideo | null => (e.video ? VIDEO_BY_KEY.get(e.video) ?? null : null);

/** The demo video for a template line: through its exercise when it has one, otherwise by matching the text. */
export function videoForLine(line: string): ExerciseVideo | null {
  const p = parseLine(line);
  return (p && videoOf(p.exercise)) ?? videoByText(line);
}
