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

  // ---------- library: not in any template yet, available to swap in and log ----------

  // quads
  { key: "back-squat", name: "Back squat", load: "weight", video: "back-squat", lines: [] },
  { key: "front-squat", name: "Front squat", load: "weight", video: "front-squat", lines: [] },
  { key: "goblet-squat", name: "Goblet squat", load: "weight", video: "goblet-squat", lines: [] },
  { key: "heel-elevated-goblet-squat", name: "Heel-elevated goblet squat", load: "weight", video: "heel-elevated-goblet-squat", lines: [] },
  { key: "leg-press", name: "Leg press", load: "weight", video: "leg-press", lines: [] },
  { key: "leg-extension", name: "Leg extension", load: "weight", video: "leg-extension", lines: [] },
  { key: "hack-squat", name: "Hack squat", load: "weight", video: "hack-squat", lines: [] },
  { key: "smith-machine-squat", name: "Smith machine squat", load: "weight", video: "smith-machine-squat", lines: [] },
  { key: "wall-sit", name: "Wall sit", load: "time", video: "wall-sit", lines: [] },
  { key: "spanish-squat", name: "Spanish squat", load: "time", video: "spanish-squat", lines: [] },
  { key: "sissy-squat", name: "Sissy squat", load: "bodyweight", video: "sissy-squat", lines: [] },
  { key: "bodyweight-squat", name: "Bodyweight squat", load: "bodyweight", video: "bodyweight-squat", lines: [] },
  { key: "pistol-squat", name: "Pistol squat", load: "bodyweight", video: "pistol-squat", lines: [] },
  { key: "skater-squat", name: "Skater squat", load: "bodyweight", video: "skater-squat", lines: [] },
  { key: "jump-squat", name: "Jump squat", load: "bodyweight", video: "jump-squat", lines: [] },
  { key: "db-reverse-lunge", name: "DB reverse lunge", load: "weight", video: "db-reverse-lunge", lines: [] },
  { key: "walking-lunge", name: "Walking lunge", load: "weight", video: "walking-lunge", lines: [] },
  { key: "lateral-lunge", name: "Lateral lunge", load: "weight", video: "lateral-lunge", lines: [] },
  { key: "cossack-squat", name: "Cossack squat", load: "bodyweight", video: "cossack-squat", lines: [] },

  // hamstrings and hinges
  { key: "deadlift", name: "Deadlift", load: "weight", video: "deadlift", lines: [] },
  { key: "trap-bar-deadlift", name: "Trap bar deadlift", load: "weight", video: "trap-bar-deadlift", lines: [] },
  { key: "sumo-deadlift", name: "Sumo deadlift", load: "weight", video: "sumo-deadlift", lines: [] },
  { key: "deficit-deadlift", name: "Deficit deadlift", load: "weight", video: "deficit-deadlift", lines: [] },
  { key: "db-deadlift", name: "DB deadlift", load: "weight", video: "db-deadlift", lines: [] },
  { key: "kb-deadlift", name: "Kettlebell deadlift", load: "weight", video: "kb-deadlift", lines: [] },
  { key: "good-morning", name: "Good morning", load: "weight", video: "good-morning", lines: [] },
  { key: "banded-good-morning", name: "Banded good morning", load: "bodyweight", video: "banded-good-morning", lines: [] },
  { key: "nordic-curl", name: "Nordic hamstring curl", load: "bodyweight", video: "nordic-curl", lines: [] },
  { key: "glute-ham-raise", name: "Glute-ham raise", load: "bodyweight", video: "glute-ham-raise", lines: [] },
  { key: "back-extension", name: "45° back extension", load: "weight", video: "back-extension", lines: [] },
  { key: "single-leg-back-extension", name: "Single-leg back extension", load: "weight", video: "single-leg-back-extension", lines: [] },
  { key: "reverse-hyper", name: "Reverse hyperextension", load: "weight", video: "reverse-hyper", lines: [] },
  { key: "slider-leg-curl", name: "Slider hamstring curl", load: "bodyweight", video: "slider-leg-curl", lines: [] },
  { key: "ball-leg-curl", name: "Stability ball hamstring curl", load: "bodyweight", video: "ball-leg-curl", lines: [] },
  { key: "hamstring-walkout", name: "Hamstring walkout", load: "bodyweight", video: "hamstring-walkout", lines: [] },
  { key: "kb-swing", name: "Kettlebell swing", load: "weight", video: "kb-swing", lines: [] },
  { key: "cable-pull-through", name: "Cable pull-through", load: "weight", video: "cable-pull-through", lines: [] },

  // glutes and hips
  { key: "barbell-hip-thrust", name: "Barbell hip thrust", load: "weight", video: "barbell-hip-thrust", lines: [] },
  { key: "db-hip-thrust", name: "DB hip thrust", load: "weight", video: "db-hip-thrust", lines: [] },
  { key: "sl-hip-thrust", name: "Single-leg hip thrust", load: "bodyweight", video: "sl-hip-thrust", lines: [] },
  { key: "frog-pump", name: "Frog pump", load: "bodyweight", video: "frog-pump", lines: [] },
  { key: "hip-abduction-machine", name: "Hip abduction machine", load: "weight", video: "hip-abduction-machine", lines: [] },
  { key: "hip-adduction-machine", name: "Hip adduction machine", load: "weight", video: "hip-adduction-machine", lines: [] },
  { key: "copenhagen-plank", name: "Copenhagen plank", load: "time", video: "copenhagen-plank", lines: [] },
  { key: "clamshell", name: "Clamshell", load: "bodyweight", video: "clamshell", lines: [] },
  { key: "fire-hydrant", name: "Fire hydrant", load: "bodyweight", video: "fire-hydrant", lines: [] },
  { key: "cable-glute-kickback", name: "Cable glute kickback", load: "weight", video: "cable-glute-kickback", lines: [] },
  { key: "donkey-kick", name: "Donkey kick", load: "bodyweight", video: "donkey-kick", lines: [] },
  { key: "monster-walk", name: "Monster walk", load: "bodyweight", video: "monster-walk", lines: [] },
  { key: "curtsy-lunge", name: "Curtsy lunge", load: "weight", video: "curtsy-lunge", lines: [] },
  { key: "cable-hip-abduction", name: "Cable hip abduction", load: "weight", video: "cable-hip-abduction", lines: [] },
  { key: "side-lying-hip-abduction", name: "Side-lying hip abduction", load: "bodyweight", video: "side-lying-hip-abduction", lines: [] },
  { key: "hip-airplane", name: "Hip airplane", load: "bodyweight", video: "hip-airplane", lines: [] },
  { key: "side-lying-hip-adduction", name: "Side-lying hip adduction", load: "bodyweight", video: "side-lying-hip-adduction", lines: [] },
  { key: "cable-hip-adduction", name: "Cable hip adduction", load: "weight", video: "cable-hip-adduction", lines: [] },

  // lower leg, feet and plyometrics
  { key: "tibialis-raise", name: "Tibialis raise", load: "bodyweight", video: "tibialis-raise", lines: [] },
  { key: "pogo-hops", name: "Pogo hops", load: "bodyweight", video: "pogo-hops", lines: [] },
  { key: "single-leg-balance", name: "Single-leg balance", load: "time", video: "single-leg-balance", lines: [] },
  { key: "short-foot", name: "Short foot", load: "bodyweight", video: "short-foot", lines: [] },
  { key: "towel-toe-curl", name: "Towel toe curl", load: "bodyweight", video: "towel-toe-curl", lines: [] },
  { key: "marble-pickup", name: "Marble pickup", load: "bodyweight", video: "marble-pickup", lines: [] },
  { key: "jump-rope", name: "Jump rope", load: "time", video: "jump-rope", lines: [] },
  { key: "single-leg-hops", name: "Single-leg hops", load: "bodyweight", video: "single-leg-hops", lines: [] },
  { key: "hop-and-stick", name: "Single-leg hop and stick", load: "bodyweight", video: "hop-and-stick", lines: [] },
  { key: "lateral-line-hops", name: "Lateral line hops", load: "time", video: "lateral-line-hops", lines: [] },
  { key: "box-jump", name: "Box jump", load: "bodyweight", video: "box-jump", lines: [] },
  { key: "skater-jump", name: "Skater jump", load: "bodyweight", video: "skater-jump", lines: [] },
  { key: "a-skip", name: "A-skip", load: "time", video: "a-skip", lines: [] },
  { key: "banded-ankle-eversion", name: "Banded ankle eversion", load: "bodyweight", video: "banded-ankle-eversion", lines: [] },
  { key: "banded-ankle-inversion", name: "Banded ankle inversion", load: "bodyweight", video: "banded-ankle-inversion", lines: [] },
  { key: "heel-walk", name: "Heel walk", load: "time", video: "heel-walk", lines: [] },
  { key: "eccentric-heel-drop", name: "Eccentric heel drop", load: "weight", video: "eccentric-heel-drop", lines: [] },
  { key: "drop-jump", name: "Drop jump", load: "bodyweight", video: "drop-jump", lines: [] },
  { key: "knee-to-wall-ankle-mobility", name: "Knee-to-wall ankle mobility", load: "bodyweight", video: "knee-to-wall-ankle-mobility", lines: [] },
  { key: "star-excursion-balance", name: "Star excursion balance", load: "bodyweight", video: "star-excursion-balance", lines: [] },
  { key: "bounding", name: "Bounding", load: "time", video: "bounding", lines: [] },

  // back
  { key: "pull-up", name: "Pull-up", load: "bodyweight", video: "pull-up", lines: [] },
  { key: "chin-up", name: "Chin-up", load: "bodyweight", video: "chin-up", lines: [] },
  { key: "band-assisted-pull-up", name: "Band-assisted pull-up", load: "bodyweight", video: "band-assisted-pull-up", lines: [] },
  { key: "negative-pull-up", name: "Negative pull-up", load: "bodyweight", video: "negative-pull-up", lines: [] },
  { key: "scapular-pull-up", name: "Scapular pull-up", load: "bodyweight", video: "scapular-pull-up", lines: [] },
  { key: "dead-hang", name: "Dead hang", load: "time", video: "dead-hang", lines: [] },
  { key: "barbell-row", name: "Barbell row", load: "weight", video: "barbell-row", lines: [] },
  { key: "chest-supported-db-row", name: "Chest-supported DB row", load: "weight", video: "chest-supported-db-row", lines: [] },
  { key: "t-bar-row", name: "T-bar row", load: "weight", video: "t-bar-row", lines: [] },
  { key: "inverted-row", name: "Inverted row", load: "bodyweight", video: "inverted-row", lines: [] },
  { key: "meadows-row", name: "Meadows row", load: "weight", video: "meadows-row", lines: [] },
  { key: "db-pullover", name: "DB pullover", load: "weight", video: "db-pullover", lines: [] },
  { key: "straight-arm-pulldown", name: "Straight-arm pulldown", load: "weight", video: "straight-arm-pulldown", lines: [] },
  { key: "db-shrug", name: "DB shrug", load: "weight", video: "db-shrug", lines: [] },
  { key: "barbell-shrug", name: "Barbell shrug", load: "weight", video: "barbell-shrug", lines: [] },
  { key: "superman", name: "Superman", load: "bodyweight", video: "superman", lines: [] },
  { key: "band-row", name: "Band row", load: "bodyweight", video: "band-row", lines: [] },

  // chest
  { key: "barbell-bench-press", name: "Barbell bench press", load: "weight", video: "barbell-bench-press", lines: [] },
  { key: "incline-barbell-press", name: "Incline barbell bench press", load: "weight", video: "incline-barbell-press", lines: [] },
  { key: "incline-db-press", name: "Incline DB press", load: "weight", video: "incline-db-press", lines: [] },
  { key: "decline-bench-press", name: "Decline bench press", load: "weight", video: "decline-bench-press", lines: [] },
  { key: "decline-db-press", name: "Decline DB press", load: "weight", video: "decline-db-press", lines: [] },
  { key: "db-fly", name: "DB fly", load: "weight", video: "db-fly", lines: [] },
  { key: "incline-db-fly", name: "Incline DB fly", load: "weight", video: "incline-db-fly", lines: [] },
  { key: "cable-crossover", name: "Cable crossover", load: "weight", video: "cable-crossover", lines: [] },
  { key: "low-to-high-cable-fly", name: "Low-to-high cable fly", load: "weight", video: "low-to-high-cable-fly", lines: [] },
  { key: "pec-deck", name: "Pec deck", load: "weight", video: "pec-deck", lines: [] },
  { key: "chest-dip", name: "Chest dip", load: "bodyweight", video: "chest-dip", lines: [] },
  { key: "incline-push-up", name: "Incline push-up", load: "bodyweight", video: "incline-push-up", lines: [] },
  { key: "decline-push-up", name: "Decline push-up", load: "bodyweight", video: "decline-push-up", lines: [] },
  { key: "svend-press", name: "Svend press", load: "weight", video: "svend-press", lines: [] },
  { key: "machine-chest-press", name: "Machine chest press", load: "weight", video: "machine-chest-press", lines: [] },
  { key: "landmine-chest-press", name: "Landmine chest press", load: "weight", video: "landmine-chest-press", lines: [] },
  { key: "cable-chest-press", name: "Standing cable chest press", load: "weight", video: "cable-chest-press", lines: [] },
  { key: "plyo-push-up", name: "Plyo push-up", load: "bodyweight", video: "plyo-push-up", lines: [] },
  { key: "smith-incline-press", name: "Smith machine incline press", load: "weight", video: "smith-incline-press", lines: [] },

  // shoulders
  { key: "barbell-ohp", name: "Barbell overhead press", load: "weight", video: "barbell-ohp", lines: [] },
  { key: "arnold-press", name: "Arnold press", load: "weight", video: "arnold-press", lines: [] },
  { key: "machine-shoulder-press", name: "Machine shoulder press", load: "weight", video: "machine-shoulder-press", lines: [] },
  { key: "landmine-press", name: "Landmine press", load: "weight", video: "landmine-press", lines: [] },
  { key: "push-press", name: "Push press", load: "weight", video: "push-press", lines: [] },
  { key: "pike-push-up", name: "Pike push-up", load: "bodyweight", video: "pike-push-up", lines: [] },
  { key: "db-front-raise", name: "DB front raise", load: "weight", video: "db-front-raise", lines: [] },
  { key: "cable-front-raise", name: "Cable front raise", load: "weight", video: "cable-front-raise", lines: [] },
  { key: "cable-lateral-raise", name: "Cable lateral raise", load: "weight", video: "cable-lateral-raise", lines: [] },
  { key: "machine-lateral-raise", name: "Machine lateral raise", load: "weight", video: "machine-lateral-raise", lines: [] },
  { key: "upright-row", name: "Upright row", load: "weight", video: "upright-row", lines: [] },
  { key: "db-upright-row", name: "DB upright row", load: "weight", video: "db-upright-row", lines: [] },
  { key: "reverse-pec-deck", name: "Reverse pec deck", load: "weight", video: "reverse-pec-deck", lines: [] },
  { key: "cable-rear-delt-fly", name: "Cable rear-delt fly", load: "weight", video: "cable-rear-delt-fly", lines: [] },
  { key: "rear-delt-row", name: "DB rear-delt row", load: "weight", video: "rear-delt-row", lines: [] },
  { key: "band-pull-apart", name: "Band pull-apart", load: "bodyweight", video: "band-pull-apart", lines: [] },
  { key: "side-lying-external-rotation", name: "Side-lying DB external rotation", load: "weight", video: "side-lying-external-rotation", lines: [] },
  { key: "cable-external-rotation", name: "Cable external rotation", load: "weight", video: "cable-external-rotation", lines: [] },
  { key: "band-external-rotation", name: "Band external rotation", load: "bodyweight", video: "band-external-rotation", lines: [] },
  { key: "prone-ytw", name: "Prone Y-T-W raise", load: "bodyweight", video: "prone-ytw", lines: [] },
  { key: "incline-y-raise", name: "Incline DB Y raise", load: "weight", video: "incline-y-raise", lines: [] },

  // arms and grip
  { key: "preacher-curl", name: "Preacher curl", load: "weight", video: "preacher-curl", lines: [] },
  { key: "incline-db-curl", name: "Incline DB curl", load: "weight", video: "incline-db-curl", lines: [] },
  { key: "concentration-curl", name: "Concentration curl", load: "weight", video: "concentration-curl", lines: [] },
  { key: "spider-curl", name: "Spider curl", load: "weight", video: "spider-curl", lines: [] },
  { key: "ez-bar-curl", name: "EZ-bar curl", load: "weight", video: "ez-bar-curl", lines: [] },
  { key: "bayesian-cable-curl", name: "Bayesian cable curl", load: "weight", video: "bayesian-cable-curl", lines: [] },
  { key: "zottman-curl", name: "Zottman curl", load: "weight", video: "zottman-curl", lines: [] },
  { key: "rope-pushdown", name: "Rope pushdown", load: "weight", video: "rope-pushdown", lines: [] },
  { key: "bar-pushdown", name: "Straight-bar pushdown", load: "weight", video: "bar-pushdown", lines: [] },
  { key: "cable-oh-triceps-ext", name: "Cable overhead triceps extension", load: "weight", video: "cable-oh-triceps-ext", lines: [] },
  { key: "db-triceps-kickback", name: "DB triceps kickback", load: "weight", video: "db-triceps-kickback", lines: [] },
  { key: "close-grip-bench", name: "Close-grip bench press", load: "weight", video: "close-grip-bench", lines: [] },
  { key: "diamond-push-up", name: "Diamond push-up", load: "bodyweight", video: "diamond-push-up", lines: [] },
  { key: "bench-dip", name: "Bench dip", load: "bodyweight", video: "bench-dip", lines: [] },
  { key: "wrist-curl", name: "Wrist curl", load: "weight", video: "wrist-curl", lines: [] },
  { key: "reverse-wrist-curl", name: "Reverse wrist curl", load: "weight", video: "reverse-wrist-curl", lines: [] },
  { key: "reverse-curl", name: "Reverse curl", load: "weight", video: "reverse-curl", lines: [] },
  { key: "farmer-carry", name: "Farmer carry", load: "time", video: "farmer-carry", lines: [] },
  { key: "plate-pinch", name: "Plate pinch", load: "time", video: "plate-pinch", lines: [] },

  // core
  { key: "ab-wheel-rollout", name: "Ab wheel rollout", load: "bodyweight", video: "ab-wheel-rollout", lines: [] },
  { key: "crunch", name: "Crunch", load: "bodyweight", video: "crunch", lines: [] },
  { key: "bicycle-crunch", name: "Bicycle crunch", load: "bodyweight", video: "bicycle-crunch", lines: [] },
  { key: "lying-leg-raise", name: "Lying leg raise", load: "bodyweight", video: "lying-leg-raise", lines: [] },
  { key: "hanging-leg-raise", name: "Hanging leg raise", load: "bodyweight", video: "hanging-leg-raise", lines: [] },
  { key: "v-up", name: "V-up", load: "bodyweight", video: "v-up", lines: [] },
  { key: "mountain-climber", name: "Mountain climber", load: "time", video: "mountain-climber", lines: [] },
  { key: "cable-woodchop", name: "Cable woodchop", load: "weight", video: "cable-woodchop", lines: [] },
  { key: "db-woodchop", name: "DB woodchop", load: "weight", video: "db-woodchop", lines: [] },
  { key: "suitcase-carry", name: "Suitcase carry", load: "time", video: "suitcase-carry", lines: [] },
  { key: "stir-the-pot", name: "Stir the pot", load: "time", video: "stir-the-pot", lines: [] },
  { key: "toe-touch-crunch", name: "Toe touch crunch", load: "bodyweight", video: "toe-touch-crunch", lines: [] },
  { key: "flutter-kicks", name: "Flutter kicks", load: "time", video: "flutter-kicks", lines: [] },
  { key: "sit-up", name: "Sit-up", load: "bodyweight", video: "sit-up", lines: [] },
  { key: "decline-sit-up", name: "Decline sit-up", load: "bodyweight", video: "decline-sit-up", lines: [] },
  { key: "plank-shoulder-tap", name: "Plank shoulder tap", load: "bodyweight", video: "plank-shoulder-tap", lines: [] },
  { key: "side-plank-hip-dip", name: "Side plank hip dip", load: "bodyweight", video: "side-plank-hip-dip", lines: [] },
  { key: "db-side-bend", name: "DB side bend", load: "weight", video: "db-side-bend", lines: [] },
  { key: "landmine-rotation", name: "Landmine rotation", load: "weight", video: "landmine-rotation", lines: [] },
  { key: "plank-body-saw", name: "Plank body saw", load: "time", video: "plank-body-saw", lines: [] },

  // full body and conditioning
  { key: "burpee", name: "Burpee", load: "bodyweight", video: "burpee", lines: [] },
  { key: "db-thruster", name: "DB thruster", load: "weight", video: "db-thruster", lines: [] },
  { key: "db-snatch", name: "DB snatch", load: "weight", video: "db-snatch", lines: [] },
  { key: "broad-jump", name: "Broad jump", load: "bodyweight", video: "broad-jump", lines: [] },
  { key: "med-ball-slam", name: "Med ball slam", load: "weight", video: "med-ball-slam", lines: [] },
  { key: "med-ball-rotational-throw", name: "Med ball rotational throw", load: "weight", video: "med-ball-rotational-throw", lines: [] },
  { key: "battle-ropes", name: "Battle ropes", load: "time", video: "battle-ropes", lines: [] },
  { key: "sled-push", name: "Sled push", load: "time", video: "sled-push", lines: [] },
  { key: "turkish-get-up", name: "Turkish get-up", load: "weight", video: "turkish-get-up", lines: [] },
  { key: "bear-crawl", name: "Bear crawl", load: "time", video: "bear-crawl", lines: [] },
  { key: "rowing-intervals", name: "Rowing intervals", load: "time", video: "rowing-intervals", lines: [] },
  { key: "ski-erg-intervals", name: "SkiErg intervals", load: "time", video: "ski-erg-intervals", lines: [] },
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
