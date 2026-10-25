// Strength, upper-body and core session templates. Edit freely: the generator only reads these objects.

export type BlockKind = "run" | "test" | "legs" | "upper" | "abs" | "walk" | "gate" | "mobility";

export interface Block {
  kind: BlockKind;
  title: string;
  items: string[];
  note?: string;
  /** Long-run distance, for weekly summaries */
  km?: number;
  /** Moves to another lift day when its day is skipped */
  carry?: boolean;
  /** True when this block was moved here from a skipped day */
  foldedFrom?: string;
  /** Light week: 2 sets, so weight comparisons skip it */
  light?: boolean;
}

type Template = Omit<Block, "kind"> & { kind?: BlockKind };
const legs = (t: Template): Block => ({ kind: "legs", ...t });
const upper = (t: Template): Block => ({ kind: "upper", carry: true, ...t });
const abs = (t: Template): Block => ({ kind: "abs", ...t });

/* ---------- legs: A = protect (before gates), B = rebuild, C = strength, L = light ---------- */
export const LEGS = {
  A_gym: legs({
    title: "Legs: protect (gym)",
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
    title: "Legs: protect (condo)",
    items: ["DB calf raises, 3×15", "Glute bridge with DB on hips, 3×12", "Bird dog, 3×8 each side"],
    note: "Rail on stairs, sore leg steps down first.",
  }),
  B_gym: legs({
    title: "Legs: rebuild (gym)",
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
    title: "Legs: rebuild (condo)",
    items: [
      "Slow step-downs, 4-second lower, 3×8 each",
      "DB Romanian deadlift, light, 3×8",
      "Single-leg calf raise, 3×10 each",
      "Single-leg glute bridge, 3×10 each",
    ],
    note: "Light and controlled. This day is for tendons, not fatigue.",
  }),
  C_gym: legs({
    title: "Legs: strength (gym)",
    items: [
      "Romanian deadlift, 3×6–8, moderate-heavy",
      "Bulgarian split squat, 3×8 each",
      "Step-ups, knee height, 3×8 each",
      "Leg curl machine, light-moderate, 3×10",
      "Weighted single-leg calf raise, 3×12 each",
    ],
    note: "Leave 2 reps in reserve. Never the day before a hard run.",
  }),
  C_condo: legs({
    title: "Legs: knee-focused (condo)",
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
    title: "Legs: light (gym)",
    items: ["Half the usual sets of RDL, split squat and calf raises", "No sets to failure", "10 min mobility: hips, calves, hamstrings"],
    note: "Keep legs fresh for the key run this week.",
  }),
  L_condo: legs({
    kind: "mobility",
    title: "Mobility + calves",
    items: ["15 min mobility", "Calf raises, 2×15", "Glute bridge, 2×12"],
    note: "Easy. Nothing should feel hard today.",
  }),
} as const;

/* ---------- upper body ---------- */
export const UPPER = {
  pull: upper({
    title: "Upper: pull (gym)",
    items: ["Lat pulldown or assisted pull-ups, 3×8–10", "Seated cable row, 3×10", "Face pulls, 3×15", "Cable or DB curl, 3×12"],
  }),
  push: upper({
    title: "Upper: push (condo)",
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
    title: "Upper: back + arms (condo)",
    items: ["One-arm DB row, 3×10 each", "Rear-delt fly, 3×15", "Hammer curls, 3×12", "DB skull crushers or close-grip push-ups, 3×12"],
  }),
} as const;

/* ---------- core ---------- */
export const ABS = {
  gym: abs({ title: "Abs (gym)", items: ["Hanging knee raises, 3×10–12", "Cable crunch, 3×12", "Pallof press, 3×10 each side"] }),
  condoA: abs({ title: "Abs (condo)", items: ["Dead bug, 3×10", "Reverse crunch, 3×12", "Plank, 3×40s"] }),
  condoB: abs({ title: "Abs (condo)", items: ["Side plank, 3×30s each side", "Russian twist with DB, 3×12 each side", "Hollow hold, 3×25s"] }),
} as const;

export const LIGHT_NOTE = "Light week: 2 sets each, nothing to failure.";

export function light(b: Block): Block {
  return { ...b, note: LIGHT_NOTE, light: true };
}
