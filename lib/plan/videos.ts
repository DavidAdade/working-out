// Exercise demo videos. Each exercise has a main YouTube video and a backup.
// If YouTube reports a video as removed or not embeddable, the popup tries the next id,
// then falls back to a YouTube search. Run `npm run check-videos` to list dead ids.
//
// Order matters: the first entry whose `match` fits an exercise line wins, so specific
// variations (single-leg, bent-knee, side plank) come before the general ones.

export interface ExerciseVideo {
  key: string;
  name: string;
  match: RegExp;
  /** YouTube video ids, best first */
  ids: string[];
  /** Used for the "Search YouTube" fallback */
  query: string;
}

export const VIDEOS: ExerciseVideo[] = [
  // calves
  { key: "calf-bent", name: "Bent-knee calf raise", match: /bent[- ]knee.*calf|calf raises?, bent knee/i, ids: ["C3tLEvqrW4E", "-1s4TMcicYM"], query: "bent knee calf raise soleus" },
  { key: "calf-single", name: "Single-leg calf raise", match: /single-leg calf|calf raises?, working toward single/i, ids: ["u1Yc75YdiJA", "uhLjADhUxFM"], query: "single leg calf raise" },
  { key: "calf", name: "Standing calf raise", match: /calf raise/i, ids: ["ndQc4mz4mBU", "97NbelB5yvQ"], query: "standing calf raise form" },

  // hips and glutes
  { key: "bridge-single", name: "Single-leg glute bridge", match: /single-leg glute bridge|glute bridge → single/i, ids: ["3NXv0Nany-Q", "18GVqjfHy-M"], query: "single leg glute bridge" },
  { key: "bridge", name: "Glute bridge", match: /glute bridge/i, ids: ["KI6fjDqGZh4", "wQQ6N5piDG0"], query: "glute bridge form" },
  { key: "band-walk", name: "Banded side steps", match: /banded side step|lateral band/i, ids: ["3JIhEXL6mtg", "PhNkkOieB-8"], query: "banded lateral walk" },
  { key: "bird-dog", name: "Bird dog", match: /bird dog/i, ids: ["KA0ekfSePrQ", "ufCbCMlJLAs"], query: "bird dog exercise" },

  // hinges
  { key: "rdl-single", name: "Single-leg DB Romanian deadlift", match: /single-leg.*romanian deadlift/i, ids: ["pJewPISyHjw", "TVUX-rX8xmE"], query: "single leg dumbbell romanian deadlift" },
  { key: "rdl-db", name: "Dumbbell Romanian deadlift", match: /DB romanian deadlift/i, ids: ["hQgFixeXdZo", "KYIJdN2gBmQ"], query: "dumbbell romanian deadlift" },
  { key: "rdl", name: "Romanian deadlift", match: /romanian deadlift/i, ids: ["KN5vN3JskqI", "7j-2w4-P14I"], query: "romanian deadlift form" },

  // single-leg knee work
  { key: "split-goblet", name: "Goblet split squat", match: /goblet split squat/i, ids: ["6P9S7flcKds", "CFRscDm3zWw"], query: "goblet split squat" },
  { key: "split-bulgarian", name: "Bulgarian split squat", match: /bulgarian split squat/i, ids: ["rah3eJCPXHA", "VPhhE6bBzZE"], query: "bulgarian split squat" },
  { key: "split", name: "Split squat", match: /split squat/i, ids: ["5VG4UnfA7Bk", "Ft-NS5Ogti0"], query: "dumbbell split squat" },
  { key: "step-down", name: "Slow step-down", match: /step-downs?/i, ids: ["Ig_Qo-GKjRc", "UfVYtlQ-5-Q"], query: "eccentric step down knee" },
  { key: "step-up", name: "Step-up", match: /step-ups?/i, ids: ["WCFCdxzFBa4", "dQqApCGd5Ss"], query: "step up exercise form" },
  { key: "leg-curl", name: "Leg curl machine", match: /leg curl/i, ids: ["S367qaHeYWU", "14OrOWlM5QU"], query: "seated leg curl machine" },

  // upper: pull
  { key: "lat-pulldown", name: "Lat pulldown", match: /lat pulldown|pull-ups/i, ids: ["AKl1em_pH_c", "UTerui_Q7r0"], query: "lat pulldown form" },
  { key: "cable-row", name: "Seated cable row", match: /seated cable row/i, ids: ["EU7bOadUsNI", "f_r95UajQcg"], query: "seated cable row form" },
  { key: "face-pull", name: "Face pull", match: /face pulls?/i, ids: ["eQaSpG7aMYQ", "eTCBSFlCJ_s"], query: "face pull form" },
  { key: "db-row", name: "One-arm dumbbell row", match: /one-arm DB row|dumbbell row/i, ids: ["PgpQ4-jHiq4", "dtNu762e_BA"], query: "one arm dumbbell row" },
  { key: "rear-delt", name: "Rear-delt fly", match: /rear-delt fly/i, ids: ["dA4iqyTgx5I", "UO_v23hHAdM"], query: "bent over dumbbell rear delt fly" },
  { key: "hammer", name: "Hammer curl", match: /hammer curl/i, ids: ["zC3nLlEvin4", "3nqezx8BEv0"], query: "dumbbell hammer curl" },
  { key: "curl", name: "Biceps curl", match: /\bcurl\b/i, ids: ["6DeLZ6cbgWQ", "93R8V6uvwHc"], query: "dumbbell bicep curl form" },

  // upper: push
  { key: "skull", name: "Dumbbell skull crusher", match: /skull crusher/i, ids: ["jO2Jl9eZpXk", "8ncEJDm7Cig"], query: "dumbbell skull crusher" },
  { key: "floor-press", name: "Dumbbell floor press", match: /floor (or bench )?press/i, ids: ["uUGDRwge4F8", "6ASauxpSmbA"], query: "dumbbell floor press" },
  { key: "push-up", name: "Push-up", match: /push-ups?/i, ids: ["zF0jbubK_jU", "mECzqUIDWfU"], query: "push up proper form" },
  { key: "oh-triceps", name: "Overhead triceps extension", match: /triceps extension/i, ids: ["YM8iX9BJWjA", "xVAYiQugOzU"], query: "overhead dumbbell triceps extension" },
  { key: "ohp", name: "Dumbbell overhead press", match: /overhead press/i, ids: ["Did01dFR3Lk", "HCFa5Eb03xQ"], query: "standing dumbbell overhead press" },
  { key: "lateral-raise", name: "Lateral raise", match: /lateral raise/i, ids: ["Y29xKcze8Ik", "OK1k6NdNo1I"], query: "dumbbell lateral raise form" },

  // core
  { key: "hanging-knee", name: "Hanging knee raise", match: /hanging knee raise/i, ids: ["0BmrlKCfTPU", "G6a5267YpHM"], query: "hanging knee raise form" },
  { key: "cable-crunch", name: "Cable crunch", match: /cable crunch/i, ids: ["0KEP6A1deBE", "W-frrCtNmic"], query: "kneeling cable crunch" },
  { key: "pallof", name: "Pallof press", match: /pallof/i, ids: ["_2xWmYNnFS8", "5_8d8vHgZvU"], query: "pallof press" },
  { key: "dead-bug", name: "Dead bug", match: /dead bug/i, ids: ["g_BYB0R-4Ws", "-gRN_JyVTLY"], query: "dead bug exercise" },
  { key: "reverse-crunch", name: "Reverse crunch", match: /reverse crunch/i, ids: ["nYcE7-Dhpzk", "7VH0UB44RT0"], query: "reverse crunch form" },
  { key: "side-plank", name: "Side plank", match: /side plank/i, ids: ["oaJ15vYERoU", "0M-erHBl48U"], query: "side plank form" },
  { key: "plank", name: "Plank", match: /\bplank\b/i, ids: ["gSDNblPRh1U", "xvYrhBNrm_Y"], query: "forearm plank form" },
  { key: "russian-twist", name: "Russian twist", match: /russian twist/i, ids: ["TfTUk2AjV7g", "p_dPOhhgovg"], query: "dumbbell russian twist" },
  { key: "hollow", name: "Hollow hold", match: /hollow (body )?hold/i, ids: ["ezm464FOEQw", "ME4mv4lCsvo"], query: "hollow body hold" },

  // running
  { key: "strides", name: "Strides", match: /strides/i, ids: ["6-Liai7MqzM", "1i2ZPpXtuOk"], query: "how to run strides" },
];

/** Lines that mention several exercises at once get no single video. */
const SKIP = /^half the usual/i;

export function videoFor(line: string): ExerciseVideo | null {
  if (SKIP.test(line)) return null;
  return VIDEOS.find((v) => v.match.test(line)) ?? null;
}

export const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
