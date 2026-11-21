// Strength, upper-body and core session templates. Edit freely: the generator only reads these objects.

export type BlockKind = "run" | "test" | "legs" | "upper" | "abs" | "walk" | "gate" | "mobility";

export interface Block {
  kind: BlockKind;
  title: string;
  items: string[];
  note?: string;
  /** Long-run distance, for weekly summaries */
  km?: number;
  /** Distance of a run from the person's own running plan that isn't the week's long run (see ownruns.ts) */
  dist?: number;
  /** Own-plan runs say whether they're hard; the plan's own runs are read from their title (see isHard) */
  hard?: boolean;
  /** Moves to another lift day when its day is skipped */
  carry?: boolean;
  /** True when this block was moved here from a skipped day */
  foldedFrom?: string;
  /** Lines done back to back by default, round by round, as item indexes (see supersets.ts). The person can split or regroup them */
  supersets?: number[][];
  /** Light week: 2 sets, so weight comparisons skip it */
  light?: boolean;
  /** The date the plan put this block on, before moves and folds. Exercise swaps are keyed by it */
  planDate?: string;
  /** Exercises the person swapped, by item index (see swaps.ts). `items` keep the template text */
  swaps?: Record<number, ItemSwap>;
}

/** One template line shown as another exercise. `target` keeps the original's sets */
export interface ItemSwap {
  /** The template exercise's key */
  from: string;
  to: string;
  name: string;
  load: "weight" | "bodyweight" | "time";
  target: { sets: number; reps: number | null; repsMax: number | null; sec: number | null; each: boolean };
  /** The line as shown, e.g. "Hack squat, 3×8–10" */
  line: string;
}

type Template = Omit<Block, "kind"> & { kind?: BlockKind };
const legs = (t: Template): Block => ({ kind: "legs", ...t });
const upper = (t: Template): Block => ({ kind: "upper", carry: true, ...t });
const abs = (t: Template): Block => ({ kind: "abs", ...t });

/* ---------- legs: A = protect (before gates), B = rebuild, C = strength, L = light ---------- */
export const LEGS = {
  A_gym: legs({
    title: "Legs: protect A",
    items: [
      "Calf raises, straight knee, 3×15",
      "Calf raises, bent knee, 3×15",
      "Glute bridge, 3×12",
      "Banded side steps, 3×12 each way",
      "Optional: 15–20 min treadmill walk at 2–5% incline, only if pain-free",
    ],
    note: "No heavy leg work or hamstring loading until stairs are pain-free.",
  }),
  A_condo: legs({
    title: "Legs: protect B",
    items: ["DB calf raises, 3×15", "Glute bridge with DB on hips, 3×12", "Bird dog, 3×8 each side"],
    note: "Rail on stairs, sore leg steps down first.",
  }),
  B_gym: legs({
    title: "Legs: rebuild A",
    items: [
      "Calf raises, working toward single-leg, 3×10",
      "Glute bridge → single-leg, 3×10",
      "Romanian deadlift, light, 3×8",
      "Split squat, bodyweight to light, 3×8 each",
      "Step-ups, low box, 3×8 each",
      "Banded side steps, 3×12 each way",
    ],
    note: "Hamstring work stays light. Stop any set that pushes back-of-knee pain above 2/10.",
  }),
  B_condo: legs({
    title: "Legs: rebuild B",
    items: [
      "Slow step-downs, 4-second lower, 3×8 each",
      "DB Romanian deadlift, light, 3×8",
      "Single-leg calf raise, 3×10 each",
      "Single-leg glute bridge, 3×10 each",
    ],
    note: "Light and controlled. This day is for tendons, not fatigue.",
  }),
  C_gym: legs({
    title: "Legs: strength",
    items: [
      "Romanian deadlift, 3×6–8, moderate-heavy",
      "Bulgarian split squat, 3×8 each",
      "Leg curl machine, light-moderate, 3×10",
      "Step-ups, knee height, 3×8 each",
      "Weighted single-leg calf raise, 3×12 each",
    ],
    // The heavy hinge stays on its own; front of the leg with the back of it, then the two on the step
    supersets: [[1, 2], [3, 4]],
    note: "Leave 2 reps in reserve. Never the day before a hard run.",
  }),
  C_condo: legs({
    title: "Legs: stability",
    items: [
      "Single-leg DB Romanian deadlift, 3×8 each",
      "Slow step-downs, 3×10 each",
      "Goblet split squat, 3×8 each",
      "Bent-knee single-leg calf raise, 3×12 each",
      "Single-leg glute bridge, 3×12 each",
    ],
    note: "Moderate effort. Tomorrow is the long run.",
  }),
  L_gym: legs({
    title: "Legs: light",
    items: ["Half the usual sets of RDL, split squat and calf raises", "No sets to failure", "10 min mobility: hips, calves, hamstrings"],
    note: "Keep legs fresh for the key run this week.",
  }),
  L_condo: legs({
    kind: "mobility",
    title: "Mobility + calves",
    items: ["15 min mobility", "Calf raises, 2×15", "Glute bridge, 2×12"],
    note: "Easy. Nothing should feel hard today.",
  }),
  // After an easy run under 5.5 km, in weeks built around the person's own runs (ownruns.ts)
  short: legs({
    title: "Legs: short (after your run)",
    items: ["Goblet split squat, 3×8 each", "Single-leg DB Romanian deadlift, 3×8 each", "Single-leg calf raise, 3×10 each"],
    note: "About 20 minutes, straight after the run or later today. Tomorrow has no run.",
  }),
} as const;

/* ---------- upper body ---------- */
export const UPPER = {
  pull: upper({
    title: "Upper: pull",
    items: ["Lat pulldown or assisted pull-ups, 3×8–10", "Seated cable row, 3×10", "Face pulls, 3×15", "Cable or DB curl, 3×12"],
  }),
  push: upper({
    title: "Upper: push",
    items: [
      "DB floor or bench press, 3×8–10",
      "Push-ups, 3 sets, stop 2 reps short of failure",
      "DB overhead press, 3×10",
      "Lateral raises, 3×15",
      "Overhead DB triceps extension, 3×12",
    ],
    note: "Lift after the run, or later in the day.",
  }),
  backArms: upper({
    title: "Upper: back + arms",
    items: ["One-arm DB row, 3×10 each", "Rear-delt fly, 3×15", "Hammer curls, 3×12", "DB skull crushers or close-grip push-ups, 3×12"],
  }),
  // Push and pull in one session, for weeks with two upper days (ownruns.ts)
  // The two full sessions of weeks built around the person's own runs (ownruns.ts): every upper muscle in each,
  // twice a week, in pairs that don't compete (push with pull, then small muscles that share a station), so
  // eight exercises fit in under an hour. Chest 11 direct sets a week, back 14, each delt head 7–8, arms 8 each.
  fullA: upper({
    title: "Upper A: chest + back",
    items: [
      "Incline DB press, 4×8–10",
      "Lat pulldown or assisted pull-ups, 4×8–10",
      "Machine chest press, 3×10–12",
      "Seated cable row, 3×10–12",
      "Cable lateral raise, 4×12–15",
      "Face pulls, 4×15",
      "Cable or DB curl, 4×10–12",
      "Rope pushdown, 4×10–12",
    ],
    supersets: [[0, 1], [2, 3], [4, 5], [6, 7]],
    note: "Supersets: one set of each in the pair, then rest. Leave 1–2 reps in reserve on the presses and pulls.",
  }),
  fullB: upper({
    title: "Upper B: shoulders + arms",
    items: [
      "DB floor or bench press, 4×8–10",
      "One-arm DB row, 4×10 each",
      "DB overhead press, 3×8–10",
      "Rear-delt row, 3×12",
      "Lateral raises, 4×12–15",
      "Hammer curls, 4×10–12",
      "DB shrug, 3×12–15",
      "Overhead DB triceps extension, 4×10–12",
    ],
    supersets: [[0, 1], [2, 3], [4, 5], [6, 7]],
    note: "Supersets: one set of each in the pair, then rest.",
  }),
} as const;

/* ---------- core ---------- */
export const ABS = {
  gym: abs({ title: "Abs", items: ["Hanging knee raises, 3×10–12", "Cable crunch, 3×12", "Pallof press, 3×10 each side"] }),
  condoA: abs({ title: "Abs", items: ["Dead bug, 3×10", "Reverse crunch, 3×12", "Plank, 3×40s"] }),
  condoB: abs({ title: "Abs", items: ["Side plank, 3×30s each side", "Russian twist with DB, 3×12 each side", "Hollow hold, 3×25s"] }),
} as const;

/**
 * Lifting titles once said where the first person trained ("(gym)", "(home)"). Days saved before that was
 * dropped (day_snapshots) still hold those titles: this reads one as it is named now.
 */
export const plainTitle = (t: string) =>
  t.replace(/^(Legs: (?:protect|rebuild)) \((gym|home|condo)\)/, (_, name: string, place: string) => `${name} ${place === "gym" ? "A" : "B"}`).replace(/ \((?:gym|home|condo)\)/, "");

export const LIGHT_NOTE = "Light week: 2 sets each, nothing to failure.";

export function light(b: Block): Block {
  return { ...b, note: LIGHT_NOTE, light: true };
}
