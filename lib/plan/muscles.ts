// Muscles, which exercises hit them, and the body-map drawing used to show it.
// Pure data: no React, no app imports, only type-erasable TS (runs under node --experimental-strip-types).

export const MUSCLES = [
  { id: "quads", name: "Quads", group: "Legs" },
  { id: "hamstrings", name: "Hamstrings", group: "Legs" },
  { id: "adductors", name: "Adductors", group: "Legs" },
  { id: "glutes", name: "Glutes", group: "Glutes" },
  { id: "lats", name: "Lats", group: "Back" },
  { id: "upper-back", name: "Upper back", group: "Back" },
  { id: "traps", name: "Traps", group: "Back" },
  { id: "lower-back", name: "Lower back", group: "Back" },
  { id: "chest-upper", name: "Upper chest", group: "Chest" },
  { id: "chest-lower", name: "Lower chest", group: "Chest" },
  { id: "delts-front", name: "Front delts", group: "Shoulders" },
  { id: "delts-side", name: "Side delts", group: "Shoulders" },
  { id: "delts-rear", name: "Rear delts", group: "Shoulders" },
  { id: "biceps", name: "Biceps", group: "Arms" },
  { id: "triceps", name: "Triceps", group: "Arms" },
  { id: "forearms", name: "Forearms", group: "Arms" },
  { id: "abs", name: "Abs", group: "Core" },
  { id: "obliques", name: "Obliques", group: "Core" },
  { id: "calves", name: "Calves", group: "Calves" },
] as const;

export type MuscleId = (typeof MUSCLES)[number]["id"];
export type MuscleGroup = (typeof MUSCLES)[number]["group"];
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_GROUPS: readonly MuscleGroup[] = ["Legs", "Glutes", "Back", "Chest", "Shoulders", "Arms", "Core", "Calves"];

const BY_ID = new Map<string, Muscle>(MUSCLES.map((m) => [m.id, m]));
export const muscleById = (id: MuscleId): Muscle => BY_ID.get(id)!;
export const muscleName = (id: MuscleId): string => BY_ID.get(id)?.name ?? id;

/** The standard three-way split for filtering: upper body, lower body, core. */
export const REGIONS = ["Upper", "Lower", "Core"] as const;
export type Region = (typeof REGIONS)[number];
const REGION_OF: Record<MuscleGroup, Region> = {
  Chest: "Upper",
  Back: "Upper",
  Shoulders: "Upper",
  Arms: "Upper",
  Legs: "Lower",
  Glutes: "Lower",
  Calves: "Lower",
  Core: "Core",
};
// Lower back is drawn with the back but trained as core (bird dog, planks), as most apps file it
const MUSCLE_REGION: Partial<Record<MuscleId, Region>> = { "lower-back": "Core" };

/** Where an exercise mostly works, from its main muscles (the first one breaks a tie). */
export function regionOf(primary: readonly string[]): Region | null {
  const counts = new Map<Region, number>();
  for (const id of primary) {
    const m = BY_ID.get(id as MuscleId);
    if (!m) continue;
    const r = MUSCLE_REGION[m.id] ?? REGION_OF[m.group];
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let best: Region | null = null;
  for (const [r, n] of counts) if (!best || n > counts.get(best)!) best = r;
  return best;
}

export interface MuscleTargets {
  primary: MuscleId[];
  secondary: MuscleId[];
}

const t = (primary: MuscleId[], secondary: MuscleId[] = []): MuscleTargets => ({ primary, secondary });

// Keyed by exercise key from exercises.ts. The map has no separate glute-medius or soleus region,
// so hip-abduction work shows on "glutes" and bent-knee calf work on "calves".
export const EXERCISE_MUSCLES: Record<string, MuscleTargets> = {
  // Calves
  "calf-raise": t(["calves"]),
  "calf-raise-bent": t(["calves"]),
  "db-calf-raise": t(["calves"], ["forearms"]),
  "sl-calf-raise": t(["calves"]),
  "sl-calf-raise-bent": t(["calves"]),

  // Glutes / hips
  "glute-bridge": t(["glutes"], ["hamstrings", "lower-back"]),
  "db-glute-bridge": t(["glutes"], ["hamstrings", "lower-back"]),
  "sl-glute-bridge": t(["glutes"], ["hamstrings", "obliques"]),
  "band-side-steps": t(["glutes"], ["quads"]),
  "bird-dog": t(["lower-back", "glutes"], ["abs", "obliques", "delts-front"]),

  // Legs
  rdl: t(["hamstrings", "glutes"], ["lower-back", "forearms"]),
  "db-rdl": t(["hamstrings", "glutes"], ["lower-back", "forearms"]),
  "sl-db-rdl": t(["hamstrings", "glutes"], ["lower-back", "adductors", "forearms"]),
  "leg-curl": t(["hamstrings"], ["calves"]),
  "split-squat": t(["quads", "glutes"], ["adductors", "hamstrings"]),
  "bulgarian-split-squat": t(["quads", "glutes"], ["adductors", "hamstrings"]),
  "goblet-split-squat": t(["quads", "glutes"], ["adductors", "abs", "upper-back"]),
  "step-up": t(["quads", "glutes"], ["hamstrings", "calves"]),
  "step-down": t(["quads"], ["glutes"]),

  // Pull
  "lat-pulldown": t(["lats"], ["biceps", "upper-back", "delts-rear", "forearms"]),
  "cable-row": t(["upper-back", "lats"], ["traps", "delts-rear", "biceps"]),
  "face-pull": t(["delts-rear", "upper-back"], ["traps"]),
  curl: t(["biceps"], ["forearms"]),
  "db-row": t(["lats", "upper-back"], ["traps", "delts-rear", "biceps", "forearms"]),
  "rear-delt-fly": t(["delts-rear"], ["upper-back", "traps"]),
  "hammer-curl": t(["biceps", "forearms"]),

  // Push
  "db-press": t(["chest-lower", "chest-upper"], ["triceps", "delts-front"]),
  "push-up": t(["chest-lower", "chest-upper"], ["triceps", "delts-front", "abs"]),
  "db-ohp": t(["delts-front"], ["triceps", "chest-upper", "delts-side"]),
  "lateral-raise": t(["delts-side"], ["traps", "delts-front"]),
  "triceps-ext": t(["triceps"]),
  "skull-crusher": t(["triceps"]),

  // Core
  "hanging-knee-raise": t(["abs"], ["obliques", "forearms"]),
  "cable-crunch": t(["abs"], ["obliques"]),
  "pallof-press": t(["obliques", "abs"], ["glutes"]),
  "dead-bug": t(["abs"], ["obliques"]),
  "reverse-crunch": t(["abs"], ["obliques"]),
  "russian-twist": t(["obliques"], ["abs"]),
  plank: t(["abs", "obliques"], ["delts-front", "glutes", "quads"]),
  "side-plank": t(["obliques"], ["abs", "glutes", "lower-back"]),
  "hollow-hold": t(["abs"], ["obliques", "quads"]),

  // Library
  "back-squat": t(["quads", "glutes"], ["adductors", "lower-back", "abs"]),
  "front-squat": t(["quads"], ["glutes", "upper-back", "abs"]),
  "goblet-squat": t(["quads", "glutes"], ["adductors", "abs", "upper-back"]),
  "heel-elevated-goblet-squat": t(["quads"], ["glutes", "adductors", "abs"]),
  "leg-press": t(["quads", "glutes"], ["adductors", "hamstrings"]),
  "leg-extension": t(["quads"]),
  "hack-squat": t(["quads"], ["glutes", "adductors"]),
  "smith-machine-squat": t(["quads", "glutes"], ["adductors"]),
  "wall-sit": t(["quads"], ["glutes", "calves"]),
  "spanish-squat": t(["quads"], ["glutes"]),
  "sissy-squat": t(["quads"], ["abs"]),
  "bodyweight-squat": t(["quads", "glutes"], ["adductors", "calves"]),
  "pistol-squat": t(["quads", "glutes"], ["abs", "calves", "adductors"]),
  "skater-squat": t(["quads", "glutes"], ["hamstrings", "abs"]),
  "jump-squat": t(["quads", "glutes"], ["calves", "hamstrings"]),
  "db-reverse-lunge": t(["quads", "glutes"], ["hamstrings", "adductors", "forearms"]),
  "walking-lunge": t(["quads", "glutes"], ["hamstrings", "adductors", "calves"]),
  "lateral-lunge": t(["quads", "adductors"], ["glutes", "hamstrings"]),
  "cossack-squat": t(["quads", "adductors"], ["glutes", "hamstrings"]),
  "deadlift": t(["hamstrings", "glutes", "lower-back"], ["quads", "traps", "forearms", "lats", "upper-back"]),
  "trap-bar-deadlift": t(["quads", "glutes", "hamstrings"], ["lower-back", "traps", "forearms", "upper-back"]),
  "sumo-deadlift": t(["glutes", "adductors", "hamstrings"], ["quads", "lower-back", "traps", "forearms"]),
  "deficit-deadlift": t(["hamstrings", "glutes", "lower-back"], ["quads", "traps", "forearms", "upper-back"]),
  "db-deadlift": t(["hamstrings", "glutes"], ["quads", "lower-back", "forearms", "traps"]),
  "kb-deadlift": t(["hamstrings", "glutes"], ["quads", "lower-back", "forearms"]),
  "good-morning": t(["hamstrings", "lower-back"], ["glutes", "upper-back", "abs"]),
  "banded-good-morning": t(["hamstrings", "glutes"], ["lower-back"]),
  "nordic-curl": t(["hamstrings"], ["glutes", "calves"]),
  "glute-ham-raise": t(["hamstrings", "glutes"], ["lower-back", "calves"]),
  "back-extension": t(["lower-back", "glutes", "hamstrings"], ["upper-back"]),
  "single-leg-back-extension": t(["hamstrings", "glutes"], ["lower-back"]),
  "reverse-hyper": t(["glutes", "hamstrings", "lower-back"]),
  "slider-leg-curl": t(["hamstrings"], ["glutes", "calves"]),
  "ball-leg-curl": t(["hamstrings"], ["glutes", "abs", "calves"]),
  "hamstring-walkout": t(["hamstrings"], ["glutes", "abs"]),
  "kb-swing": t(["glutes", "hamstrings"], ["lower-back", "abs", "forearms", "delts-front"]),
  "cable-pull-through": t(["glutes", "hamstrings"], ["lower-back", "abs"]),
  "barbell-hip-thrust": t(["glutes"], ["hamstrings", "quads", "adductors"]),
  "db-hip-thrust": t(["glutes"], ["hamstrings", "quads", "adductors"]),
  "sl-hip-thrust": t(["glutes"], ["hamstrings", "quads", "abs"]),
  "frog-pump": t(["glutes"], ["adductors"]),
  "hip-abduction-machine": t(["glutes"]),
  "hip-adduction-machine": t(["adductors"]),
  "copenhagen-plank": t(["adductors", "obliques"], ["abs", "glutes"]),
  "clamshell": t(["glutes"]),
  "fire-hydrant": t(["glutes"], ["abs"]),
  "cable-glute-kickback": t(["glutes"], ["hamstrings"]),
  "donkey-kick": t(["glutes"], ["hamstrings", "abs"]),
  "monster-walk": t(["glutes"], ["quads"]),
  "curtsy-lunge": t(["glutes", "quads"], ["adductors", "hamstrings"]),
  "cable-hip-abduction": t(["glutes"]),
  "side-lying-hip-abduction": t(["glutes"], ["obliques"]),
  "hip-airplane": t(["glutes"], ["hamstrings", "obliques", "abs"]),
  "side-lying-hip-adduction": t(["adductors"]),
  "cable-hip-adduction": t(["adductors"]),
  "tibialis-raise": t(["calves"]),
  "pogo-hops": t(["calves"], ["quads", "glutes"]),
  "single-leg-balance": t(["calves"], ["glutes", "abs"]),
  "short-foot": t(["calves"]),
  "towel-toe-curl": t(["calves"]),
  "marble-pickup": t(["calves"]),
  "jump-rope": t(["calves"], ["quads", "forearms"]),
  "single-leg-hops": t(["calves", "quads"], ["glutes"]),
  "hop-and-stick": t(["quads", "glutes"], ["calves", "hamstrings"]),
  "lateral-line-hops": t(["calves"], ["quads", "adductors", "glutes"]),
  "box-jump": t(["quads", "glutes"], ["calves", "hamstrings"]),
  "skater-jump": t(["glutes", "quads"], ["adductors", "calves"]),
  "a-skip": t(["calves", "quads"], ["glutes", "abs"]),
  "banded-ankle-eversion": t(["calves"]),
  "banded-ankle-inversion": t(["calves"]),
  "heel-walk": t(["calves"]),
  "eccentric-heel-drop": t(["calves"]),
  "drop-jump": t(["calves", "quads"], ["glutes"]),
  "knee-to-wall-ankle-mobility": t(["calves"]),
  "star-excursion-balance": t(["glutes", "quads"], ["calves", "abs"]),
  "bounding": t(["glutes", "quads"], ["calves", "hamstrings"]),
  "pull-up": t(["lats"], ["upper-back", "biceps", "forearms", "abs"]),
  "chin-up": t(["lats", "biceps"], ["upper-back", "forearms", "abs"]),
  "band-assisted-pull-up": t(["lats"], ["upper-back", "biceps", "forearms"]),
  "negative-pull-up": t(["lats"], ["upper-back", "biceps", "forearms"]),
  "scapular-pull-up": t(["lats", "traps"], ["upper-back", "forearms"]),
  "dead-hang": t(["forearms"], ["lats", "upper-back"]),
  "barbell-row": t(["lats", "upper-back"], ["traps", "delts-rear", "biceps", "lower-back", "forearms"]),
  "chest-supported-db-row": t(["upper-back", "lats"], ["delts-rear", "traps", "biceps"]),
  "t-bar-row": t(["upper-back", "lats"], ["traps", "delts-rear", "biceps", "lower-back"]),
  "inverted-row": t(["upper-back", "lats"], ["delts-rear", "biceps", "abs"]),
  "meadows-row": t(["lats", "upper-back"], ["delts-rear", "biceps", "forearms"]),
  "db-pullover": t(["lats"], ["chest-lower", "triceps", "abs"]),
  "straight-arm-pulldown": t(["lats"], ["triceps", "abs"]),
  "db-shrug": t(["traps"], ["forearms", "upper-back"]),
  "barbell-shrug": t(["traps"], ["forearms", "upper-back"]),
  "superman": t(["lower-back"], ["glutes", "upper-back", "delts-rear"]),
  "band-row": t(["upper-back", "lats"], ["delts-rear", "biceps"]),
  "barbell-bench-press": t(["chest-lower", "chest-upper"], ["triceps", "delts-front"]),
  "incline-barbell-press": t(["chest-upper", "delts-front"], ["triceps"]),
  "incline-db-press": t(["chest-upper", "delts-front"], ["triceps"]),
  "decline-bench-press": t(["chest-lower"], ["triceps", "delts-front"]),
  "decline-db-press": t(["chest-lower"], ["triceps", "delts-front"]),
  "db-fly": t(["chest-lower", "chest-upper"], ["delts-front", "biceps"]),
  "incline-db-fly": t(["chest-upper"], ["delts-front"]),
  "cable-crossover": t(["chest-lower"], ["chest-upper", "delts-front"]),
  "low-to-high-cable-fly": t(["chest-upper"], ["delts-front"]),
  "pec-deck": t(["chest-lower", "chest-upper"], ["delts-front"]),
  "chest-dip": t(["chest-lower", "triceps"], ["delts-front"]),
  "incline-push-up": t(["chest-lower", "chest-upper"], ["triceps", "delts-front", "abs"]),
  "decline-push-up": t(["chest-upper", "delts-front"], ["triceps", "abs"]),
  "svend-press": t(["chest-lower", "chest-upper"], ["delts-front"]),
  "machine-chest-press": t(["chest-lower", "chest-upper"], ["triceps", "delts-front"]),
  "landmine-chest-press": t(["chest-upper", "delts-front"], ["triceps", "abs"]),
  "cable-chest-press": t(["chest-lower", "chest-upper"], ["triceps", "delts-front", "abs"]),
  "plyo-push-up": t(["chest-lower", "chest-upper"], ["triceps", "delts-front", "abs"]),
  "smith-incline-press": t(["chest-upper", "delts-front"], ["triceps"]),
  "barbell-ohp": t(["delts-front"], ["delts-side", "triceps", "traps", "abs"]),
  "arnold-press": t(["delts-front", "delts-side"], ["triceps", "upper-back"]),
  "machine-shoulder-press": t(["delts-front"], ["delts-side", "triceps"]),
  "landmine-press": t(["delts-front", "chest-upper"], ["triceps", "obliques", "abs"]),
  "push-press": t(["delts-front", "triceps"], ["delts-side", "quads", "glutes", "traps"]),
  "pike-push-up": t(["delts-front"], ["triceps", "chest-upper", "abs"]),
  "db-front-raise": t(["delts-front"], ["chest-upper", "delts-side"]),
  "cable-front-raise": t(["delts-front"], ["chest-upper", "delts-side"]),
  "cable-lateral-raise": t(["delts-side"], ["traps", "delts-front"]),
  "machine-lateral-raise": t(["delts-side"], ["traps"]),
  "upright-row": t(["delts-side", "traps"], ["delts-front", "biceps", "forearms"]),
  "db-upright-row": t(["delts-side", "traps"], ["delts-front", "biceps", "forearms"]),
  "reverse-pec-deck": t(["delts-rear"], ["upper-back", "traps"]),
  "cable-rear-delt-fly": t(["delts-rear"], ["upper-back", "traps"]),
  "rear-delt-row": t(["delts-rear", "upper-back"], ["traps", "biceps", "lats"]),
  "band-pull-apart": t(["delts-rear", "upper-back"], ["traps"]),
  "side-lying-external-rotation": t(["delts-rear"], ["upper-back"]),
  "cable-external-rotation": t(["delts-rear"], ["upper-back"]),
  "band-external-rotation": t(["delts-rear"], ["upper-back"]),
  "prone-ytw": t(["delts-rear", "upper-back", "traps"], ["delts-side", "lower-back"]),
  "incline-y-raise": t(["delts-side", "traps"], ["delts-rear", "upper-back"]),
  "preacher-curl": t(["biceps"], ["forearms"]),
  "incline-db-curl": t(["biceps"], ["forearms"]),
  "concentration-curl": t(["biceps"], ["forearms"]),
  "spider-curl": t(["biceps"], ["forearms"]),
  "ez-bar-curl": t(["biceps"], ["forearms"]),
  "bayesian-cable-curl": t(["biceps"], ["forearms", "delts-front"]),
  "zottman-curl": t(["biceps", "forearms"]),
  "rope-pushdown": t(["triceps"]),
  "bar-pushdown": t(["triceps"]),
  "cable-oh-triceps-ext": t(["triceps"]),
  "db-triceps-kickback": t(["triceps"], ["delts-rear"]),
  "close-grip-bench": t(["triceps"], ["chest-lower", "chest-upper", "delts-front"]),
  "diamond-push-up": t(["triceps"], ["chest-lower", "delts-front", "abs"]),
  "bench-dip": t(["triceps"], ["delts-front", "chest-lower"]),
  "wrist-curl": t(["forearms"]),
  "reverse-wrist-curl": t(["forearms"]),
  "reverse-curl": t(["forearms", "biceps"]),
  "farmer-carry": t(["forearms", "traps"], ["abs", "obliques", "upper-back", "glutes"]),
  "plate-pinch": t(["forearms"]),
  "ab-wheel-rollout": t(["abs"], ["lats", "obliques", "delts-front", "triceps"]),
  "crunch": t(["abs"], ["obliques"]),
  "bicycle-crunch": t(["obliques", "abs"]),
  "lying-leg-raise": t(["abs"], ["quads", "obliques"]),
  "hanging-leg-raise": t(["abs"], ["obliques", "forearms", "lats", "quads"]),
  "v-up": t(["abs"], ["obliques", "quads"]),
  "mountain-climber": t(["abs"], ["obliques", "delts-front", "quads", "chest-lower"]),
  "cable-woodchop": t(["obliques"], ["abs", "delts-front", "glutes"]),
  "db-woodchop": t(["obliques"], ["abs", "delts-front", "glutes", "quads"]),
  "suitcase-carry": t(["obliques"], ["forearms", "traps", "abs", "glutes"]),
  "stir-the-pot": t(["abs", "obliques"], ["delts-front", "lats", "glutes"]),
  "toe-touch-crunch": t(["abs"], ["obliques"]),
  "flutter-kicks": t(["abs"], ["quads", "obliques"]),
  "sit-up": t(["abs"], ["obliques", "quads"]),
  "decline-sit-up": t(["abs"], ["obliques", "quads"]),
  "plank-shoulder-tap": t(["abs", "obliques"], ["delts-front", "triceps", "glutes"]),
  "side-plank-hip-dip": t(["obliques"], ["abs", "glutes"]),
  "db-side-bend": t(["obliques"], ["lower-back", "abs"]),
  "landmine-rotation": t(["obliques"], ["abs", "delts-front", "glutes"]),
  "plank-body-saw": t(["abs"], ["delts-front", "lats", "obliques"]),
  "burpee": t(["quads", "chest-lower"], ["glutes", "delts-front", "triceps", "abs", "calves"]),
  "db-thruster": t(["quads", "delts-front"], ["glutes", "triceps", "abs", "upper-back"]),
  "db-snatch": t(["glutes", "delts-front"], ["hamstrings", "quads", "traps", "upper-back", "abs"]),
  "broad-jump": t(["glutes", "quads"], ["hamstrings", "calves", "lower-back"]),
  "med-ball-slam": t(["lats", "abs"], ["delts-front", "triceps", "glutes", "upper-back"]),
  "med-ball-rotational-throw": t(["obliques", "glutes"], ["abs", "delts-front", "chest-lower"]),
  "battle-ropes": t(["delts-front", "forearms"], ["abs", "upper-back", "biceps", "triceps"]),
  "sled-push": t(["quads", "glutes"], ["calves", "hamstrings", "delts-front", "abs"]),
  "turkish-get-up": t(["delts-front", "abs"], ["obliques", "glutes", "triceps", "upper-back"]),
  "bear-crawl": t(["abs", "delts-front"], ["quads", "triceps", "obliques"]),
  "rowing-intervals": t(["lats", "quads"], ["glutes", "upper-back", "biceps", "hamstrings"]),
  "ski-erg-intervals": t(["lats", "triceps"], ["abs", "glutes", "delts-rear"]),
};

export const musclesFor = (exerciseKey: string): MuscleTargets | undefined => EXERCISE_MUSCLES[exerciseKey];

/* ------------------------------------------------------------------
 * Body map drawing. Coordinates live in a 100 x 210 box, centre line x = 50.
 * Every muscle is drawn once for the viewer's LEFT half and mirrored across
 * x = 50 with BODY_MIRROR, so the figure is perfectly symmetrical.
 * ------------------------------------------------------------------ */

export const BODY_VIEWBOX = "13 0 74 210";
export const BODY_MIRROR = "matrix(-1 0 0 1 100 0)";
/** Head, drawn as an ellipse */
export const BODY_HEAD = { cx: 50, cy: 15, rx: 9, ry: 11.4 } as const;

export interface BodyPart {
  id: MuscleId;
  d: string;
}

// Half outline (top-centre -> bottom-centre); each segment is [c1x,c1y, c2x,c2y, x,y].
const OUTLINE_START = [50, 25];
const OUTLINE_HALF: number[][] = [
  [47, 25, 45, 26, 45, 27.5], // under chin
  [45, 30, 45, 32, 44.6, 33.5], // neck side
  [42, 35.6, 36, 36, 31, 37.4], // trap slope
  [26.5, 38.4, 23.2, 42, 23, 47.5], // shoulder cap
  [22.6, 58, 21, 70, 20.6, 80], // outer upper arm
  [19.4, 90, 18.6, 102, 19, 111], // outer forearm
  [17.4, 116, 17.4, 123, 19.4, 126.5], // hand outer
  [20.5, 128.4, 22.6, 127.8, 23.2, 124.5], // finger tips
  [23.9, 119, 24.1, 115, 23.7, 111], // hand inner
  [25, 103, 27.6, 92, 28.6, 82], // inner forearm
  [29.8, 72, 31.4, 61, 31.6, 51.5], // inner upper arm -> armpit
  [32.6, 64, 35.4, 78, 35.6, 90], // lat / waist
  [35.8, 96, 33, 101, 32.4, 108], // hip
  [30.6, 122, 31.2, 140, 35, 152], // outer thigh -> knee
  [33.2, 164, 35.2, 184, 38.6, 197], // outer calf -> ankle
  [38.2, 200, 37, 203, 37.8, 205.4], // outer foot
  [39.4, 207.6, 44.2, 207.6, 45.4, 205.6], // sole
  [46, 203, 45, 200, 44.8, 197], // inner ankle
  [47.8, 184, 48.8, 166, 47, 154], // inner calf -> knee
  [48.8, 142, 49.6, 128, 49.6, 116], // inner thigh
  [49.7, 115, 49.9, 114, 50, 114], // crotch
];

function outlinePath(): string {
  const mx = (x: number) => +(100 - x).toFixed(2);
  let d = `M${OUTLINE_START.join(" ")}`;
  for (const s of OUTLINE_HALF) d += ` C${s.join(" ")}`;
  // walk back up the right side: reverse each segment and mirror x
  for (let i = OUTLINE_HALF.length - 1; i >= 0; i--) {
    const [c1x, c1y, c2x, c2y] = OUTLINE_HALF[i];
    const prev = i === 0 ? OUTLINE_START : OUTLINE_HALF[i - 1].slice(4);
    d += ` C${mx(c2x)} ${c2y} ${mx(c1x)} ${c1y} ${mx(prev[0])} ${prev[1]}`;
  }
  return d + " Z";
}

/** Full (already symmetrical) body silhouette, minus the head */
export const BODY_SILHOUETTE = outlinePath();

// Shared shapes used by both views.
const DELT_SIDE = "M31 37.8 C27 38.6 24 42 23.6 47 C23.3 50.5 23.6 53.5 24.2 55.6 C25 52 26 49 27.2 46 C28 42.6 29.2 40 31 37.8 Z";
const FOREARM_OUTER = "M20.8 81.4 C19.8 88 19.1 96 19.2 104 C19.3 107 19.5 109 19.7 110.6 L21.9 110.6 C22.3 102 23.4 92 24.8 83.8 C23.2 83.4 21.8 82.6 20.8 81.4 Z";
const FOREARM_INNER = "M25.6 83.9 C24.2 92 23 101 22.6 110.6 L23.2 110.6 C24.4 104 26.4 95 28 85 C28.2 83.6 28.1 82.6 27.8 82 C27.2 83.2 26.4 83.7 25.6 83.9 Z";

/** Left-half muscle shapes, front view. Draw each twice: as-is and with BODY_MIRROR. */
export const BODY_FRONT: readonly BodyPart[] = [
  { id: "traps", d: "M45.4 30 C44.8 33.2 41 35.4 33.6 37.2 C37.5 37.8 41.5 38.2 45 38.2 C45.8 35.6 46 32.6 45.4 30 Z" },
  { id: "delts-side", d: DELT_SIDE },
  { id: "delts-front", d: "M38.6 38.8 C35.6 37.9 33.4 37.6 31.6 37.9 C29.6 40.4 28.2 43 27.6 46.2 C26.6 49.6 25.6 53 24.8 56.4 C27.4 54.4 30 52.6 32.2 50.6 C32.6 46 34.6 41.6 38.6 38.8 Z" },
  { id: "chest-upper", d: "M49.4 40 L40.2 39.4 C36.6 41 34 44.4 33.2 48.6 L49.4 48.6 Z" },
  { id: "chest-lower", d: "M33.2 49.4 C33.4 54.4 35 58.4 38 60.4 C42 62.4 46.6 61.8 49.4 60.4 L49.4 49.4 Z" },
  { id: "biceps", d: "M30 54.6 C27.6 55 25.6 56.6 24.4 59 C23.2 64 22.4 71 22.8 77.2 C24.2 79.6 26.6 79.6 27.8 77.4 C28.8 71.4 29.9 63 30 52.4 Z" },
  { id: "triceps", d: "M30.8 54 C31.3 56 31.4 58 31.2 60.4 C30.7 66 29.8 72.6 28.8 79 L28.3 78 C29.4 71 30.4 62.6 30.6 53 Z" },
  { id: "forearms", d: FOREARM_OUTER },
  { id: "forearms", d: FOREARM_INNER },
  { id: "abs", d: "M44 63.4 C46 62.8 48 62.6 49.4 62.8 L49.4 71 L44 71.4 C43.8 68.6 43.8 66 44 63.4 Z" },
  { id: "abs", d: "M44 72.6 L49.4 72.4 L49.4 80.4 L44.2 80.8 C44 78 43.9 75.2 44 72.6 Z" },
  { id: "abs", d: "M44.2 82 L49.4 81.8 L49.4 89.6 L44.4 90 C44.2 87.4 44.1 84.6 44.2 82 Z" },
  { id: "abs", d: "M44.4 91.2 L49.4 91 L49.4 106.6 C47.6 104.6 46 101.6 45.2 98 C44.7 95.8 44.5 93.4 44.4 91.2 Z" },
  { id: "obliques", d: "M42.8 62.6 C39.6 62.4 36.4 61.4 34 59.8 C33.8 67 34.4 74.6 35.4 82 C35.8 87.6 36 93 36.4 97.6 C38.8 99.4 41.6 101.8 43.6 104.6 C43.4 99 43.2 91 42.9 84 C42.7 76.6 42.6 69.4 42.8 62.6 Z" },
  { id: "quads", d: "M33.4 107 C31.7 115 31.2 124 31.8 133 C32.4 141 34.2 146.6 37 150.8 C36.6 143 36 133 36.3 123.6 C36.5 116.6 35.4 111 33.4 107 Z" },
  { id: "quads", d: "M35.2 105.4 C38.6 110.4 42 116.6 43.4 124 C44.4 131 43.4 139 41.6 145.6 C40.4 147.6 38.8 147.2 38.2 145 C37 137 36.8 128.6 37.2 120.6 C37.4 114.6 36.6 109.6 35.2 105.4 Z" },
  { id: "quads", d: "M44.4 130.6 C46.6 134.6 47.6 139.6 47.2 144.4 C46.8 148.4 44.6 151 42 151.6 C40.6 150.6 40.8 148.4 41.8 146.4 C43.4 140.6 44.4 135.6 44.4 130.6 Z" },
  { id: "adductors", d: "M49.2 115 C46.6 114.6 42.6 112.4 39.6 109 C42 115.4 44.2 122 44.8 129.4 C46.4 132.6 47.6 136 48.2 139.4 C48.9 131 49.4 123 49.2 115 Z" },
  { id: "calves", d: "M38.4 157.4 C36.2 162 35.2 168 35.6 175 C36 181.6 37.8 188.4 39.4 194.6 L40.8 194.6 C40.8 186 41.2 176.6 42.2 167 C42.6 162.4 42.2 158.6 40.8 156.4 C40 157.2 39.2 157.6 38.4 157.4 Z" },
  { id: "calves", d: "M45.6 157.6 C47.4 162 47.8 167.6 47.2 174 C46.8 179 45.8 183 44.6 186.6 C43.8 180 43.4 172.4 43.6 165 C43.8 161.6 44.6 159.2 45.6 157.6 Z" },
];

/** Left-half muscle shapes, back view. Draw each twice: as-is and with BODY_MIRROR. */
export const BODY_BACK: readonly BodyPart[] = [
  { id: "traps", d: "M50 31 L45 31.6 C44.6 33.6 40.4 35.4 32.6 37.4 C37.4 39.6 42 43.4 45.4 49.6 C47 54 48.6 59 50 64 Z" },
  { id: "delts-side", d: DELT_SIDE },
  { id: "delts-rear", d: "M32 37.8 C35.4 38.6 38.2 40 39.8 41.6 C37 44.6 34.4 47.6 32.2 50.6 C29.6 52.4 27 54.4 24.8 56.4 C25.6 53 26.6 49.6 27.6 46.2 C28.4 42.8 29.8 40 32 37.8 Z" },
  { id: "upper-back", d: "M39.6 42 C42 44.2 44 47.4 45 51 C41.6 48.4 37 47.8 32.6 48.6 C34.6 46.2 37 44 39.6 42 Z" },
  { id: "lats", d: "M32.4 49.8 C36.6 48.6 41.6 49 45.2 52.4 C47 57 48.4 62.6 49.4 68.4 L49.4 70 C46 75.2 41 80.4 36.4 86.4 C35.4 79 34.4 70.6 33.2 62.4 C32.7 58 32.4 53.8 32.4 49.8 Z" },
  { id: "triceps", d: "M27.8 55.6 C25.8 56 24.2 57.4 23.4 59.6 C22.4 64 22 70.6 22.6 76.6 C23.6 78.2 25 78.8 26.2 78.4 C26 70 26.6 61 28 52.2 Z" },
  { id: "triceps", d: "M28.9 55 C27.7 62 27.1 70 27.2 78.4 C28.4 78.2 29.2 77.4 29.6 76.4 C30.6 70 31.3 62.6 31.3 54.4 C30.6 54.4 29.8 54.6 28.9 55 Z" },
  { id: "forearms", d: FOREARM_OUTER },
  { id: "forearms", d: FOREARM_INNER },
  { id: "lower-back", d: "M49.4 71.4 C47.2 75 45.8 80.4 45.2 86.6 C44.8 92 45.4 97.4 46.6 101.6 L49.4 101.6 Z" },
  { id: "obliques", d: "M36.8 88 C39.4 85 42 82.4 44.2 80.6 C43.8 88 44 95.2 45.4 101 C42.4 99.8 39 99.6 35.6 100.6 C36.2 96.6 36.6 92.4 36.8 88 Z" },
  { id: "glutes", d: "M49.4 103 C44 101.6 38.4 101.6 34.6 104 C32.4 108 31.8 113.6 32.6 118.8 C34.2 123.6 39 125.8 44 125.6 C46.8 125.4 48.6 124.6 49.4 123.4 Z" },
  { id: "hamstrings", d: "M32.8 122.4 C31.9 130 32.4 140 35 147.6 C36.2 150.6 38.2 151.6 39.8 150 C40.2 142 40.4 134 40.2 127 C37.4 126.6 34.8 125 32.8 122.4 Z" },
  { id: "hamstrings", d: "M41.2 127.2 C41.2 134.6 41.2 142.4 41.6 150.2 C43.4 151.6 45.6 151 46.6 148.4 C48 141.4 48.9 134 49.1 125.6 C46.6 126.8 43.8 127.4 41.2 127.2 Z" },
  { id: "calves", d: "M36.4 156.4 C34.4 161 33.8 168 35 175 C35.9 179.8 37.8 183.2 40.2 183.6 C40.8 175.4 41 166.4 40.6 158.2 C39.2 158 37.6 157.4 36.4 156.4 Z" },
  { id: "calves", d: "M41.8 158.2 C41.6 166.4 41.8 175.4 42.6 184.2 C45 183.8 47 179.6 47.6 172.6 C48 166.6 47.4 160.6 45.8 156.4 C44.6 157.4 43.2 158 41.8 158.2 Z" },
];
