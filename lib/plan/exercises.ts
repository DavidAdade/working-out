// Stable exercise ids for set logging. History is stored by `key`, so never rename a key:
// change `name` or the template lines instead and point the new line at the same key.
//
// `lines` lists the template text (before the sets × reps part) that belongs to each exercise.
// plan.test.ts checks every loggable template line maps to exactly one exercise.

export type Load = "weight" | "bodyweight" | "time";

export interface Exercise {
  key: string;
  name: string;
  load: Load;
  lines: string[];
}

export const EXERCISES: Exercise[] = [
  // calves
  { key: "calf-raise", name: "Calf raise", load: "weight", lines: ["Calf raises, straight knee", "Calf raises, working toward single-leg"] },
  { key: "calf-raise-bent", name: "Bent-knee calf raise", load: "weight", lines: ["Calf raises, bent knee"] },
  { key: "db-calf-raise", name: "DB calf raise", load: "weight", lines: ["DB calf raises", "Calf raises"] },
  { key: "sl-calf-raise", name: "Single-leg calf raise", load: "weight", lines: ["Single-leg calf raise", "Weighted single-leg calf raise"] },
  { key: "sl-calf-raise-bent", name: "Bent-knee single-leg calf raise", load: "weight", lines: ["Bent-knee single-leg calf raise"] },

  // hips and glutes
  { key: "glute-bridge", name: "Glute bridge", load: "bodyweight", lines: ["Glute bridge", "Glute bridge → single-leg"] },
  { key: "db-glute-bridge", name: "DB glute bridge", load: "weight", lines: ["Glute bridge with DB on hips"] },
  { key: "sl-glute-bridge", name: "Single-leg glute bridge", load: "bodyweight", lines: ["Single-leg glute bridge"] },
  { key: "band-side-steps", name: "Banded side steps", load: "bodyweight", lines: ["Banded side steps"] },
  { key: "bird-dog", name: "Bird dog", load: "bodyweight", lines: ["Bird dog"] },

  // hinges, squats, steps
  { key: "rdl", name: "Romanian deadlift", load: "weight", lines: ["Romanian deadlift", "Romanian deadlift, light"] },
  { key: "db-rdl", name: "DB Romanian deadlift", load: "weight", lines: ["DB Romanian deadlift, light"] },
  { key: "sl-db-rdl", name: "Single-leg DB RDL", load: "weight", lines: ["Single-leg DB Romanian deadlift"] },
  { key: "leg-curl", name: "Leg curl", load: "weight", lines: ["Leg curl machine, light-moderate"] },
  { key: "split-squat", name: "Split squat", load: "weight", lines: ["Split squat, bodyweight to light"] },
  { key: "bulgarian-split-squat", name: "Bulgarian split squat", load: "weight", lines: ["Bulgarian split squat"] },
  { key: "goblet-split-squat", name: "Goblet split squat", load: "weight", lines: ["Goblet split squat"] },
  { key: "step-up", name: "Step-up", load: "weight", lines: ["Step-ups, low box", "Step-ups, knee height"] },
  { key: "step-down", name: "Slow step-down", load: "bodyweight", lines: ["Slow step-downs, 4-second lower", "Slow step-downs"] },

  // upper pull
  { key: "lat-pulldown", name: "Lat pulldown", load: "weight", lines: ["Lat pulldown or assisted pull-ups"] },
  { key: "cable-row", name: "Seated cable row", load: "weight", lines: ["Seated cable row"] },
  { key: "face-pull", name: "Face pull", load: "weight", lines: ["Face pulls"] },
  { key: "curl", name: "Curl", load: "weight", lines: ["Cable or DB curl"] },
  { key: "db-row", name: "One-arm DB row", load: "weight", lines: ["One-arm DB row"] },
  { key: "rear-delt-fly", name: "Rear-delt fly", load: "weight", lines: ["Rear-delt fly"] },
  { key: "hammer-curl", name: "Hammer curl", load: "weight", lines: ["Hammer curls"] },

  // upper push
  { key: "db-press", name: "DB press", load: "weight", lines: ["DB floor or bench press"] },
  { key: "push-up", name: "Push-up", load: "bodyweight", lines: ["Push-ups"] },
  { key: "db-ohp", name: "DB overhead press", load: "weight", lines: ["DB overhead press"] },
  { key: "lateral-raise", name: "Lateral raise", load: "weight", lines: ["Lateral raises"] },
  { key: "triceps-ext", name: "Overhead triceps extension", load: "weight", lines: ["Overhead DB triceps extension"] },
  { key: "skull-crusher", name: "Skull crusher", load: "weight", lines: ["DB skull crushers or close-grip push-ups"] },

  // core
  { key: "hanging-knee-raise", name: "Hanging knee raise", load: "bodyweight", lines: ["Hanging knee raises"] },
  { key: "cable-crunch", name: "Cable crunch", load: "weight", lines: ["Cable crunch"] },
  { key: "pallof-press", name: "Pallof press", load: "weight", lines: ["Pallof press"] },
  { key: "dead-bug", name: "Dead bug", load: "bodyweight", lines: ["Dead bug"] },
  { key: "reverse-crunch", name: "Reverse crunch", load: "bodyweight", lines: ["Reverse crunch"] },
  { key: "russian-twist", name: "Russian twist", load: "weight", lines: ["Russian twist with DB"] },
  { key: "plank", name: "Plank", load: "time", lines: ["Plank"] },
  { key: "side-plank", name: "Side plank", load: "time", lines: ["Side plank"] },
  { key: "hollow-hold", name: "Hollow hold", load: "time", lines: ["Hollow hold"] },
];

const BY_KEY = new Map(EXERCISES.map((e) => [e.key, e]));
const BY_LINE = new Map(EXERCISES.flatMap((e) => e.lines.map((l) => [l.toLowerCase(), e] as const)));

export const exerciseByKey = (key: string) => BY_KEY.get(key);

export interface Target {
  sets: number;
  /** Lower end of the rep range, e.g. 8 for "3×8–10" */
  reps: number | null;
  sec: number | null;
  /** "each" or "each side": log one side's numbers */
  each: boolean;
}

// "3×10", "3×8–10", "3×40s", "3 sets"
const SETS_RE = /,\s*(\d+)\s*(?:×\s*(\d+)(?:\s*[–-]\s*\d+)?(s)?|sets?)\b/;

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
      reps: m[3] || Number.isNaN(n) ? null : n,
      sec: m[3] ? n : null,
      each: /\beach\b/.test(line.slice(m.index)),
    },
  };
}
