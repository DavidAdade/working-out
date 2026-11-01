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

  // library exercises (linked by key from exercises.ts; after the template ones so those match first)
  // quads
  { key: "back-squat", name: "Back squat", match: /(back|barbell) squat/i, ids: ["dW3zj79xfrc", "-bJIpOq-LWk"], query: "barbell back squat form" },
  { key: "front-squat", name: "Front squat", match: /front squat/i, ids: ["_qv0m3tPd3s", "4n9HM7VabC0"], query: "front squat form" },
  { key: "goblet-squat", name: "Goblet squat", match: /^(?!.*heels?[- ]elevated).*goblet squat/i, ids: ["lRYBbchqxtI", "eLX_dyvooKQ"], query: "goblet squat form" },
  { key: "heel-elevated-goblet-squat", name: "Heel-elevated goblet squat", match: /heels?[- ]elevated.*squat/i, ids: ["RUXLuZ_GLrE", "whLoBR-2QJg"], query: "heel elevated goblet squat" },
  { key: "leg-press", name: "Leg press", match: /leg press/i, ids: ["nDh_BlnLCGc", "EotSw18oR9w"], query: "leg press form" },
  { key: "leg-extension", name: "Leg extension", match: /leg extensions?/i, ids: ["uM86QE59Tgc", "ztNBgrGy6FQ"], query: "leg extension form" },
  { key: "hack-squat", name: "Hack squat", match: /hack squat/i, ids: ["0tn5K9NlCfo", "g9i05umL5vc"], query: "hack squat machine form" },
  { key: "smith-machine-squat", name: "Smith machine squat", match: /smith (machine )?squat/i, ids: ["iKCJCydYYrE", "fEuYM-miK5U"], query: "smith machine squat form" },
  { key: "wall-sit", name: "Wall sit", match: /wall sits?/i, ids: ["cWTZ8Am1Ee0", "RG7z0P9qrLk"], query: "wall sit exercise" },
  { key: "spanish-squat", name: "Spanish squat", match: /spanish squat/i, ids: ["1CJ3hteGxo4", "SOpqseV7Fpc"], query: "spanish squat patellar tendon" },
  { key: "sissy-squat", name: "Sissy squat", match: /sissy squat/i, ids: ["AYN-U5nZieY", "Cu2THH1IQDA"], query: "sissy squat tutorial" },
  { key: "bodyweight-squat", name: "Bodyweight squat", match: /(bodyweight|air) squat/i, ids: ["l83R5PblSMA", "P-yaD24bUE8"], query: "bodyweight squat form" },
  { key: "pistol-squat", name: "Pistol squat", match: /pistol squat/i, ids: ["vq5-vdgJc0I", "aYZnBGYloG4"], query: "pistol squat progression" },
  { key: "skater-squat", name: "Skater squat", match: /skater squat/i, ids: ["sShokB1TxjQ", "a9lx_T0f7yc"], query: "skater squat" },
  { key: "jump-squat", name: "Jump squat", match: /jump(ing)? squat|squat jump/i, ids: ["7YmTUHr6q-o", "H4mVcGRmQhI"], query: "jump squat form" },
  { key: "db-reverse-lunge", name: "DB reverse lunge", match: /reverse lunge/i, ids: ["J9MpoAQCjos", "RZKXLMxPF_I"], query: "dumbbell reverse lunge form" },
  { key: "walking-lunge", name: "Walking lunge", match: /walking lunge/i, ids: ["Pbmj6xPo-Hw", "DlhojghkaQ0"], query: "walking lunge form" },
  { key: "lateral-lunge", name: "Lateral lunge", match: /(lateral|side) lunge/i, ids: ["MvpBUsQrt_4", "8ANwlFziwtk"], query: "lateral lunge exercise" },
  { key: "cossack-squat", name: "Cossack squat", match: /cossack squat/i, ids: ["DAUb0U2RwPY", "MJvazUpmdZU"], query: "cossack squat" },
  // hamstrings and hinges
  { key: "deadlift", name: "Deadlift", match: /^(conventional |barbell )?deadlifts?(,|$|\s+\d)/i, ids: ["ZaTM37cfiDs", "VL5Ab0T07e4"], query: "conventional deadlift form" },
  { key: "trap-bar-deadlift", name: "Trap bar deadlift", match: /(trap|hex)[- ]?bar deadlift/i, ids: ["v-SrIcAp3vM", "ZJPZQklCSLs"], query: "trap bar deadlift form" },
  { key: "sumo-deadlift", name: "Sumo deadlift", match: /sumo deadlift/i, ids: ["e7oLkRlT2CQ", "JbY72Him34Q"], query: "sumo deadlift form" },
  { key: "deficit-deadlift", name: "Deficit deadlift", match: /deficit deadlift/i, ids: ["X-uKkAukJVA", "CpWsUsqBtN8"], query: "deficit deadlift form" },
  { key: "db-deadlift", name: "DB deadlift", match: /(db|dumbbell) deadlift/i, ids: ["YQgs03p3UxE", "Ipi8_vz8_z0"], query: "dumbbell deadlift form" },
  { key: "kb-deadlift", name: "Kettlebell deadlift", match: /(kb|kettlebell) deadlift/i, ids: ["hinonqqzatk", "1KY_4fs1yns"], query: "kettlebell deadlift form" },
  { key: "good-morning", name: "Good morning", match: /^(barbell )?good[- ]?mornings?/i, ids: ["eQBjIHP5d3I", "hSosylK0SNQ"], query: "barbell good morning form" },
  { key: "banded-good-morning", name: "Banded good morning", match: /(band(ed)?|resistance band) good[- ]?mornings?/i, ids: ["eYyZ4rPrUUo", "y_QvuABuWs8"], query: "banded good morning exercise" },
  { key: "nordic-curl", name: "Nordic hamstring curl", match: /nordic/i, ids: ["_e9vFU9-tkc", "3-4pKUhkzoQ"], query: "nordic hamstring curl" },
  { key: "glute-ham-raise", name: "Glute-ham raise", match: /glute[- ]ham raise|\bGHR\b/i, ids: ["gK5MIYPDfoQ", "m0AIU1dCVkU"], query: "glute ham raise form" },
  { key: "back-extension", name: "45° back extension", match: /^(45[- °]*(degree )?)?(back extension|hip extension|hyperextension)s?/i, ids: ["H8Swl1N-uis", "d-S2VfpRL_I"], query: "45 degree back extension form" },
  { key: "single-leg-back-extension", name: "Single-leg back extension", match: /single[- ]leg (45[- °]*(degree )?)?(back|hip) extension/i, ids: ["6PQSrbAKPd0", "6_IddWooKKo"], query: "single leg back extension" },
  { key: "reverse-hyper", name: "Reverse hyperextension", match: /reverse hyper(extension)?s?/i, ids: ["NAPMNd9RRxM", "i9tU7_w7rvw"], query: "reverse hyperextension exercise" },
  { key: "slider-leg-curl", name: "Slider hamstring curl", match: /(slider|sliding|towel) (hamstring |leg )?curl/i, ids: ["HaR-vvFwb7A", "UaecXxAgsKA"], query: "slider hamstring curl" },
  { key: "ball-leg-curl", name: "Stability ball hamstring curl", match: /(stability|swiss|exercise|physio)[- ]?ball (hamstring |leg )?curl/i, ids: ["XkESHgkTdFw", "BLWh0Y30nZk"], query: "stability ball hamstring curl" },
  { key: "hamstring-walkout", name: "Hamstring walkout", match: /hamstring walk[- ]?outs?/i, ids: ["jQ9BcglfyVo", "EpkA04674XQ"], query: "hamstring walkout exercise" },
  { key: "kb-swing", name: "Kettlebell swing", match: /(kettlebell|kb) swings?/i, ids: ["aSYap2yhW8s", "bDCeXbMJVNs"], query: "kettlebell swing form" },
  { key: "cable-pull-through", name: "Cable pull-through", match: /pull[- ]?throughs?/i, ids: ["SuTI-n84ezA", "h1BEcRXkvxs"], query: "cable pull through form" },
  // glutes and hips
  { key: "barbell-hip-thrust", name: "Barbell hip thrust", match: /^(?!.*(?:single|one)[- ]leg)(?!.*\b(?:db|dumbbell)\b).*hip thrust/i, ids: ["L1qG25DhAk4", "KFnKL7qSzVs"], query: "barbell hip thrust form" },
  { key: "db-hip-thrust", name: "DB hip thrust", match: /^(?!.*(?:single|one)[- ]leg)\b(?:db|dumbbell) hip thrust/i, ids: ["29OfN4ztW_g", "T55MKVmc0G0"], query: "dumbbell hip thrust bench" },
  { key: "sl-hip-thrust", name: "Single-leg hip thrust", match: /(?:single|one)[- ]leg(?:ged)?(?: db| dumbbell)? hip thrust/i, ids: ["xKDhmWlf1UE", "fL7QLTa0oJY"], query: "single leg hip thrust" },
  { key: "frog-pump", name: "Frog pump", match: /frog pumps?/i, ids: ["HyCiZVMMDW4", "MQ62r2V7Lw8"], query: "frog pump glutes" },
  { key: "hip-abduction-machine", name: "Hip abduction machine", match: /abduct(?:ion|or) machine|machine (?:hip )?abduction|seated (?:hip )?abduct(?:ion|or)/i, ids: ["OjI5OpV6IWA", "Nw09BzZPyVs"], query: "seated hip abduction machine form" },
  { key: "hip-adduction-machine", name: "Hip adduction machine", match: /adduct(?:ion|or) machine|machine (?:hip )?adduction|seated (?:hip |thigh )?adduct(?:ion|or)/i, ids: ["CjAVezAggkI", "GmRSV_n2E_0"], query: "seated hip adduction machine form" },
  { key: "copenhagen-plank", name: "Copenhagen plank", match: /copenhagen/i, ids: ["YRRnnZsRs9U", "aDsaGBnvDQo"], query: "copenhagen plank progression" },
  { key: "clamshell", name: "Clamshell", match: /clam ?shells?|\bclams\b/i, ids: ["gFyIjunfbbg", "aQVApsdOLSI"], query: "clamshell exercise glute medius" },
  { key: "fire-hydrant", name: "Fire hydrant", match: /fire hydrants?/i, ids: ["IRkRgk2Gc1E", "12whZWUANRY"], query: "fire hydrant exercise form" },
  { key: "cable-glute-kickback", name: "Cable glute kickback", match: /^(?!.*tricep)(?!.*(?:quadruped|donkey)).*(?:cable (?:glute )?kick ?backs?|glute kick ?backs?)/i, ids: ["SqO-VUEak2M", "5jJNfIlKTmg"], query: "cable glute kickback form" },
  { key: "donkey-kick", name: "Donkey kick", match: /donkey kicks?|quadruped (?:hip extension|kick ?backs?)/i, ids: ["0eIRm840mBQ", "KgghFOMKnkE"], query: "donkey kick exercise glutes" },
  { key: "monster-walk", name: "Monster walk", match: /monster walks?/i, ids: ["kfm8QOPfD9k", "snbNxUIUQPc"], query: "banded monster walk" },
  { key: "curtsy-lunge", name: "Curtsy lunge", match: /curts(?:e)?y lunges?/i, ids: ["1MgFup8A_0c", "2EyH9MN7hYE"], query: "curtsy lunge form" },
  { key: "cable-hip-abduction", name: "Cable hip abduction", match: /cable.*abduction|abduction.*cable/i, ids: ["MZp7miffCYs", "bGlm-qTnfTI"], query: "standing cable hip abduction" },
  { key: "side-lying-hip-abduction", name: "Side-lying hip abduction", match: /side[- ]?lying (?:hip |leg )?abduction|side[- ]?lying leg raises?/i, ids: ["-rDiQXjeXO0", "g9FtnmsIYgI"], query: "side lying hip abduction" },
  { key: "hip-airplane", name: "Hip airplane", match: /hip airplanes?/i, ids: ["9svtEV4vkp0", "orlH8p9llo4"], query: "hip airplane exercise" },
  { key: "side-lying-hip-adduction", name: "Side-lying hip adduction", match: /side[- ]?lying (?:hip |leg )?adduction/i, ids: ["lhwT35sshrI", "-X3sDsQ4QhI"], query: "side lying hip adduction" },
  { key: "cable-hip-adduction", name: "Cable hip adduction", match: /cable.*adduction|adduction.*cable/i, ids: ["5Mkus4JdXDE", "SIQrpq6YnT8"], query: "standing cable hip adduction" },
  // lower leg, feet and plyometrics
  { key: "tibialis-raise", name: "Tibialis raise", match: /tib(ialis)? raises?/i, ids: ["pQcvW08rnAk", "VzIcGAgBiaM"], query: "tibialis raise form" },
  { key: "pogo-hops", name: "Pogo hops", match: /pogo (hops?|jumps?)/i, ids: ["7SIfCcfP4g0", "DbMQ5fTiD9k"], query: "pogo hops for runners" },
  { key: "single-leg-balance", name: "Single-leg balance", match: /single[- ]leg (balance|stance)/i, ids: ["7SF7AYh2_Yw", "Z9_ThjKQyOg"], query: "single leg balance exercise" },
  { key: "short-foot", name: "Short foot", match: /short[- ]foot|(arch|foot) doming/i, ids: ["DoEIW4Y8MEo", "z0-Vnmw2sxM"], query: "short foot exercise arch" },
  { key: "towel-toe-curl", name: "Towel toe curl", match: /towel (toe )?(curls?|scrunch(es)?|crunch(es)?)|toe curls?/i, ids: ["dVDMUuWtX00", "RoEmHev3KZ8"], query: "towel toe curl exercise" },
  { key: "marble-pickup", name: "Marble pickup", match: /marble pick[- ]?ups?/i, ids: ["4_OFxSHtzUo", "ylJ9GekC540"], query: "marble pick up toe exercise" },
  { key: "jump-rope", name: "Jump rope", match: /jump(ing)? rope|skipping rope|rope skip/i, ids: ["IFgQfVQT_68", "zAazI2sR3Ec"], query: "how to jump rope" },
  { key: "single-leg-hops", name: "Single-leg hops", match: /single[- ]leg (pogo )?hops?(?! ?(and|&|\+) ?stick)/i, ids: ["bLxN9UST8a8", "FHKLLr-Mxj8"], query: "single leg hops exercise" },
  { key: "hop-and-stick", name: "Single-leg hop and stick", match: /hops? ?(and|&|\+) ?stick/i, ids: ["2ZhEVJeiE50", "3_QHB0B9JyU"], query: "single leg hop and stick" },
  { key: "lateral-line-hops", name: "Lateral line hops", match: /line hops?|lateral hops?/i, ids: ["Kq6Pp7ruKu4", "FqbcTmDy6Ps"], query: "lateral line hops" },
  { key: "box-jump", name: "Box jump", match: /box jumps?/i, ids: ["HJZh-12p6vg", "yAzwcfegs4Q"], query: "box jump form" },
  { key: "skater-jump", name: "Skater jump", match: /skater (jumps?|hops?|bounds?)/i, ids: ["qM5jviFhw9U", "IkGOdk2VDJw"], query: "skater jumps how to" },
  { key: "a-skip", name: "A-skip", match: /\ba[- ]skips?\b/i, ids: ["x4CyGNoPHeo", "A7r6yCpmSrA"], query: "a skip running drill" },
  { key: "banded-ankle-eversion", name: "Banded ankle eversion", match: /(ankle )?eversion/i, ids: ["QFgPY6oJWcA", "uM8K4FjaQRQ"], query: "resistance band ankle eversion" },
  { key: "banded-ankle-inversion", name: "Banded ankle inversion", match: /(ankle )?inversion/i, ids: ["v_zjz5mOvuY", "bYSogGWzU28"], query: "resistance band ankle inversion" },
  { key: "heel-walk", name: "Heel walk", match: /heel walks?|walking on heels/i, ids: ["h4V7X5ZDnU0", "sMwI7Deh2n4"], query: "heel walks exercise shin" },
  { key: "eccentric-heel-drop", name: "Eccentric heel drop", match: /heel drops?/i, ids: ["3tc0lN_bW5o", "epgJdM2muzI"], query: "eccentric heel drop achilles" },
  { key: "drop-jump", name: "Drop jump", match: /drop jumps?|depth jumps?/i, ids: ["jNXXwTbFo-Q", "3JY0pxIPaC4"], query: "drop jump how to" },
  { key: "knee-to-wall-ankle-mobility", name: "Knee-to-wall ankle mobility", match: /knee[- ]to[- ]wall/i, ids: ["vcq7GllDOJI", "UCbHJY640E4"], query: "knee to wall ankle dorsiflexion" },
  { key: "star-excursion-balance", name: "Star excursion balance", match: /star excursion|y[- ]balance|balance clock/i, ids: ["UoMSMdMKfBY", "AWXQGGQTDeA"], query: "star excursion balance exercise" },
  { key: "bounding", name: "Bounding", match: /\bbounding\b/i, ids: ["wc1BquWW18c", "fPcGgGDz6_8"], query: "bounding plyometric running drill" },
  // back
  { key: "pull-up", name: "Pull-up", match: /^(strict |weighted )?pull[- ]?ups?\b/i, ids: ["XB_7En-zf_M", "eGo4IYlbE5g"], query: "pull up form" },
  { key: "chin-up", name: "Chin-up", match: /^(strict |weighted )?chin[- ]?ups?\b/i, ids: ["e1YSApl-QcM", "mRy9m2Q9_1I"], query: "chin up form" },
  { key: "band-assisted-pull-up", name: "Band-assisted pull-up", match: /band(ed)?[- ]assisted pull[- ]?ups?|banded pull[- ]?ups?/i, ids: ["B_VkNQS5YLs", "4yE-XGDWJPg"], query: "band assisted pull up" },
  { key: "negative-pull-up", name: "Negative pull-up", match: /(negative|eccentric) (pull|chin)[- ]?ups?/i, ids: ["jBSMDqs7OzM", "EkpJkHpJXmM"], query: "negative pull up eccentric" },
  { key: "scapular-pull-up", name: "Scapular pull-up", match: /scap(ular|ula)? pull[- ]?ups?/i, ids: ["d0DVd2V0n7A", "42BPyTlr6QI"], query: "scapular pull up" },
  { key: "dead-hang", name: "Dead hang", match: /dead[- ]?hangs?/i, ids: ["dOCQjaasbGs", "9eY15prKcUY"], query: "dead hang exercise" },
  { key: "barbell-row", name: "Barbell row", match: /barbell (bent[- ]over )?rows?|bent[- ]over barbell rows?/i, ids: ["p9RihhjmJsw", "FWJR5Ve8bnQ"], query: "barbell bent over row form" },
  { key: "chest-supported-db-row", name: "Chest-supported DB row", match: /chest[- ]supported (db |dumbbell )?rows?|incline (bench |db |dumbbell )rows?/i, ids: ["2ByilQ4NaAs", "oNsqMW1gPiU"], query: "chest supported dumbbell row" },
  { key: "t-bar-row", name: "T-bar row", match: /t[- ]?bar rows?/i, ids: ["yPis7nlbqdY", "aoMlyY_aMIc"], query: "t bar row form" },
  { key: "inverted-row", name: "Inverted row", match: /inverted rows?|(trx|ring|bodyweight) rows?|australian pull[- ]?ups?/i, ids: ["vZy_Eu_Z0WA", "EfE7JeD8o6Y"], query: "inverted row form" },
  { key: "meadows-row", name: "Meadows row", match: /meadows? rows?/i, ids: ["G-jU1aPVhnY", "UtibbtC5sro"], query: "meadows row landmine" },
  { key: "db-pullover", name: "DB pullover", match: /(db|dumbbell) pull[- ]?overs?/i, ids: ["FI8AosWuMeY", "Datv2L6t3-4"], query: "dumbbell pullover form" },
  { key: "straight-arm-pulldown", name: "Straight-arm pulldown", match: /straight[- ]arm (lat |cable )?pull[- ]?downs?|cable pull[- ]?overs?/i, ids: ["G9uNaXGTJ4w", "hAMcfubonDc"], query: "straight arm cable pulldown" },
  { key: "db-shrug", name: "DB shrug", match: /(db|dumbbell) shrugs?/i, ids: ["cJRVVxmytaM", "rFsSeClGnNA"], query: "dumbbell shrug form" },
  { key: "barbell-shrug", name: "Barbell shrug", match: /barbell shrugs?|^shrugs?\b/i, ids: ["larn3Asl6oM", "MlqHEfydPpE"], query: "barbell shrug form" },
  { key: "superman", name: "Superman", match: /superman|supermen/i, ids: ["ZH0FS5Gp_eg", "J9zXkxUAfUA"], query: "superman exercise lower back" },
  { key: "band-row", name: "Band row", match: /(resistance )?band(ed)? (seated |standing )?rows?/i, ids: ["LSkyinhmA8k", "W5CGo5vzbXI"], query: "resistance band row" },
  // chest
  { key: "barbell-bench-press", name: "Barbell bench press", match: /^(barbell |bb )?(flat )?bench press/i, ids: ["rT7DgCr-3pg", "4Y2ZdHCOXok"], query: "barbell bench press form" },
  { key: "incline-barbell-press", name: "Incline barbell bench press", match: /incline (barbell|bb) (bench |chest )?press|(barbell|bb) incline (bench |chest )?press/i, ids: ["SrqOu55lrYU", "DbFgADa2PL8"], query: "incline barbell bench press form" },
  { key: "incline-db-press", name: "Incline DB press", match: /incline (db|dumbbell) (bench |chest )?press|(db|dumbbell) incline (bench |chest )?press/i, ids: ["8iPEnn-ltC8", "0f6-uCUKqgA"], query: "incline dumbbell press form" },
  { key: "decline-bench-press", name: "Decline bench press", match: /decline (barbell |bb )?bench press|(barbell|bb) decline (bench )?press/i, ids: ["LfyQBUKR8SE", "FFyGwcLnDYc"], query: "barbell decline bench press form" },
  { key: "decline-db-press", name: "Decline DB press", match: /decline (db|dumbbell) (bench |chest )?press|(db|dumbbell) decline (bench |chest )?press/i, ids: ["Pf1nDoqx_1A", "0xRvl4Qv3ZY"], query: "decline dumbbell bench press" },
  { key: "db-fly", name: "DB fly", match: /^(flat )?(db|dumbbell) (chest )?fl(y|ye|ies|yes|ys)\b/i, ids: ["eozdVDA78K0", "QENKPHhQVi4"], query: "dumbbell chest fly form" },
  { key: "incline-db-fly", name: "Incline DB fly", match: /incline (db |dumbbell )?fl(y|ye|ies|yes|ys)\b|(db|dumbbell) incline fl(y|ye|ies|yes|ys)\b/i, ids: ["8nrLh4GpS7w", "8oR5hBwbIBc"], query: "incline dumbbell fly form" },
  { key: "cable-crossover", name: "Cable crossover", match: /cable cross[- ]?overs?|high[- ]to[- ]low (cable )?fl(y|ye|ies)/i, ids: ["taI4XduLpTk", "hhruLxo9yZU"], query: "cable crossover form" },
  { key: "low-to-high-cable-fly", name: "Low-to-high cable fly", match: /low[- ]to[- ]high (cable )?fl(y|ye|ies)/i, ids: ["eQ_NBB6OBH4", "KFl3Re5UbPo"], query: "low to high cable fly form" },
  { key: "pec-deck", name: "Pec deck", match: /pec[- ]?(deck|dec)|machine (chest )?fl(y|ye|ies)|chest fly machine/i, ids: ["3jYo5cMU3d4", "eGjt4lk6g34"], query: "pec deck machine fly form" },
  { key: "chest-dip", name: "Chest dip", match: /chest dips?\b|parallel[- ]bar dips?\b|^dips\b/i, ids: ["yN6Q1UI_xkE", "vi1-BOcj3cQ"], query: "chest dips form" },
  { key: "incline-push-up", name: "Incline push-up", match: /incline push[- ]?ups?|hands[- ]elevated push[- ]?ups?/i, ids: ["Gvm5Q29UHbk", "yAbg3_pJKvw"], query: "incline push up form" },
  { key: "decline-push-up", name: "Decline push-up", match: /decline push[- ]?ups?|feet[- ]elevated push[- ]?ups?/i, ids: ["SKPab2YC8BE", "QBlYp-EwHlo"], query: "decline push up form" },
  { key: "svend-press", name: "Svend press", match: /svend|plate (pinch|squeeze) press/i, ids: ["cIoUZOnypS8", "Mooao_wZHv4"], query: "svend press form" },
  { key: "machine-chest-press", name: "Machine chest press", match: /(machine|seated) chest press|chest press machine/i, ids: ["xUm0BiZCWlQ", "sqNwDkUU_Ps"], query: "chest press machine form" },
  { key: "landmine-chest-press", name: "Landmine chest press", match: /landmine chest press/i, ids: ["6sH6vyWduNU", "-mYbyc48wAk"], query: "landmine chest press" },
  { key: "cable-chest-press", name: "Standing cable chest press", match: /cable chest press/i, ids: ["sh92B-_2O48", "YW_bpL2Eewk"], query: "standing cable chest press" },
  { key: "plyo-push-up", name: "Plyo push-up", match: /(plyo|plyometric|clap(ping)?) push[- ]?ups?/i, ids: ["MH4gcTKQiEc", "FRo3b_Pfw3M"], query: "plyometric push up form" },
  { key: "smith-incline-press", name: "Smith machine incline press", match: /smith (machine )?incline|incline smith/i, ids: ["8urE8Z8AMQ4", "b8DqTO6ak0k"], query: "smith machine incline press form" },
  // shoulders
  { key: "barbell-ohp", name: "Barbell overhead press", match: /barbell overhead press|military press|\b(bb|barbell) ohp\b/i, ids: ["cGnhixvC8uA", "4LBVP2Oe7fg"], query: "barbell overhead press form" },
  { key: "arnold-press", name: "Arnold press", match: /arnold press/i, ids: ["AjB-UXErljM", "ris9tKqMwgU"], query: "dumbbell arnold press form" },
  { key: "machine-shoulder-press", name: "Machine shoulder press", match: /machine (shoulder|overhead) press|shoulder press machine/i, ids: ["6v4nrRVySj0", "Gkk-6q7Rq-s"], query: "machine shoulder press form" },
  { key: "landmine-press", name: "Landmine press", match: /landmine (shoulder )?press/i, ids: ["Sjb5meztfSE", "SmEm6HGLin4"], query: "single arm landmine press form" },
  { key: "push-press", name: "Push press", match: /push press/i, ids: ["yklSQG1_Ovc", "iaBVSJm78ko"], query: "barbell push press technique" },
  { key: "pike-push-up", name: "Pike push-up", match: /pike push[- ]?ups?/i, ids: ["fXgou2W10ok", "62DIjS2zUog"], query: "pike push up form" },
  { key: "db-front-raise", name: "DB front raise", match: /^(?!.*\b(cable|plate)\b).*front raises?/i, ids: ["yHx8wPv4RPo", "CH9JzDStL3U"], query: "dumbbell front raise form" },
  { key: "cable-front-raise", name: "Cable front raise", match: /cable front raises?/i, ids: ["NdQE5Fhfqn4", "i6Qwd2Ebi44"], query: "cable front raise form" },
  { key: "cable-lateral-raise", name: "Cable lateral raise", match: /cable lateral raises?/i, ids: ["JlT2xB92lY8", "9ilIKuy6B0g"], query: "single arm cable lateral raise form" },
  { key: "machine-lateral-raise", name: "Machine lateral raise", match: /machine lateral raises?|lateral raise machine/i, ids: ["NNAs8jx_zJI", "l89vNiySZ-Q"], query: "lateral raise machine form" },
  { key: "upright-row", name: "Upright row", match: /^(?!.*\b(cable|db|dumbbell)\b).*upright rows?/i, ids: ["V3h_1IUY-f0", "AWsGWt-VMl8"], query: "barbell upright row form" },
  { key: "db-upright-row", name: "DB upright row", match: /(db|dumbbell) upright rows?/i, ids: ["Ub6QruNKfbY", "29-4QWdqd-g"], query: "dumbbell upright row form" },
  { key: "reverse-pec-deck", name: "Reverse pec deck", match: /reverse pec deck|rear[- ]delt machine|machine rear[- ]delt fl(y|ies|yes)/i, ids: ["-TKqxK7-ehc", "7tgx6QHB0-A"], query: "reverse pec deck rear delt fly form" },
  { key: "cable-rear-delt-fly", name: "Cable rear-delt fly", match: /cable rear[- ]delt fl(y|ies|yes)|cable reverse fl(y|ies|yes)/i, ids: ["FeERX9UwspY", "er15V96hG5U"], query: "cable rear delt fly form" },
  { key: "rear-delt-row", name: "DB rear-delt row", match: /rear[- ]delt rows?/i, ids: ["VQ3Ji5hD-VI", "t-llLcNvsro"], query: "bent over dumbbell rear delt row" },
  { key: "band-pull-apart", name: "Band pull-apart", match: /pull[- ]aparts?/i, ids: ["SuvO4TBwSu4", "stwYTTPXubo"], query: "band pull apart form" },
  { key: "side-lying-external-rotation", name: "Side-lying DB external rotation", match: /side[- ]lying (db |dumbbell )?external rotations?/i, ids: ["U-xsEZjMHME", "6G9y-6MwGsE"], query: "side lying dumbbell external rotation" },
  { key: "cable-external-rotation", name: "Cable external rotation", match: /cable external rotations?/i, ids: ["oyXJ1lykdig", "6xGIVNYBIwE"], query: "cable external rotation shoulder" },
  { key: "band-external-rotation", name: "Band external rotation", match: /band(ed)? (shoulder )?external rotations?|external rotations?,? (with )?band/i, ids: ["I9Elw6ukVdE", "y8WKcz0vqzg"], query: "band shoulder external rotation" },
  { key: "prone-ytw", name: "Prone Y-T-W raise", match: /\by[- ]?t[- ]?w\b/i, ids: ["QdGTI4Lshg4", "HvdLRWBprws"], query: "prone y t w shoulder exercise" },
  { key: "incline-y-raise", name: "Incline DB Y raise", match: /incline (db |dumbbell )?y[- ]raises?/i, ids: ["tjCRkXxrDSc", "U7Pdw5wFGh0"], query: "incline dumbbell y raise" },
  // arms and grip
  { key: "preacher-curl", name: "Preacher curl", match: /preacher curl/i, ids: ["Gydpcouclx8", "nbcgEmZ0Be4"], query: "preacher curl form" },
  { key: "incline-db-curl", name: "Incline DB curl", match: /incline (db |dumbbell )?(bicep |biceps )?curl/i, ids: ["aTYlqC_JacQ", "soxrZlIl35U"], query: "incline dumbbell curl form" },
  { key: "concentration-curl", name: "Concentration curl", match: /concentration curl/i, ids: ["Jvj2wV0vOYU", "0AUGkch3tzc"], query: "dumbbell concentration curl form" },
  { key: "spider-curl", name: "Spider curl", match: /spider curl/i, ids: ["ke2shAeQ0O8", "CITtSuda0Fg"], query: "dumbbell spider curl form" },
  { key: "ez-bar-curl", name: "EZ-bar curl", match: /e-?z[- ]?bar (bicep |biceps )?curl/i, ids: ["tJIFTI9wZOw", "aEscWJ3dS3w"], query: "ez bar curl form" },
  { key: "bayesian-cable-curl", name: "Bayesian cable curl", match: /bayesian/i, ids: ["4O24gFksZ04", "8PXe7YNOfb4"], query: "bayesian cable curl" },
  { key: "zottman-curl", name: "Zottman curl", match: /zottman/i, ids: ["ZrpRBgswtHs", "FSGDM9-dZ9w"], query: "zottman curl form" },
  { key: "rope-pushdown", name: "Rope pushdown", match: /rope (triceps? )?push[- ]?down|triceps? rope push[- ]?down/i, ids: ["-xa-6cQaZKY", "vB5OHsJ3EME"], query: "rope triceps pushdown form" },
  { key: "bar-pushdown", name: "Straight-bar pushdown", match: /(straight[- ]?bar|v[- ]?bar|\bbar) (triceps? )?push[- ]?down/i, ids: ["8JBHlaS7Dkk", "7R88yqmcGrw"], query: "straight bar triceps pushdown" },
  { key: "cable-oh-triceps-ext", name: "Cable overhead triceps extension", match: /cable overhead triceps? ext|overhead cable triceps? ext/i, ids: ["1u18yJELsh0", "ns-RGsbzqok"], query: "cable overhead triceps extension rope" },
  { key: "db-triceps-kickback", name: "DB triceps kickback", match: /(triceps?|db|dumbbell) kick[- ]?backs?/i, ids: ["6SS6K3lAwZ8", "ZO81bExngMI"], query: "dumbbell triceps kickback form" },
  { key: "close-grip-bench", name: "Close-grip bench press", match: /(close|narrow)[- ]grip (barbell |db |dumbbell )?bench/i, ids: ["FiQUzPtS90E", "UYJsFzqdgK4"], query: "close grip bench press form" },
  { key: "diamond-push-up", name: "Diamond push-up", match: /diamond push[- ]?ups?/i, ids: ["J0DnG1_S92I", "pD3mD6WgykM"], query: "diamond push up form" },
  { key: "bench-dip", name: "Bench dip", match: /bench dips?/i, ids: ["c3ZGl4pAwZ4", "0326dy_-CzM"], query: "triceps bench dip form" },
  { key: "wrist-curl", name: "Wrist curl", match: /^(?!.*reverse).*wrist curl/i, ids: ["2wPpcJBe03o", "qMtmHwaCmYI"], query: "dumbbell wrist curl form" },
  { key: "reverse-wrist-curl", name: "Reverse wrist curl", match: /reverse (seated )?wrist curl/i, ids: ["FW7URAaC-vE", "krZ6pWGZ8xo"], query: "dumbbell reverse wrist curl" },
  { key: "reverse-curl", name: "Reverse curl", match: /reverse[- ]grip (ez[- ]?bar |barbell |db |dumbbell |cable )?curl|reverse (ez[- ]?bar |barbell |db |dumbbell |cable )?curl/i, ids: ["nRgxYX2Ve9w", "ypfd1kaI1AU"], query: "reverse curl ez bar form" },
  { key: "farmer-carry", name: "Farmer carry", match: /farmer'?s? (carry|carries|walks?)/i, ids: ["8OtwXwrJizk", "NH7Xv-7NQNQ"], query: "farmer carry form" },
  { key: "plate-pinch", name: "Plate pinch", match: /plate pinch/i, ids: ["jFTV3DQf3HE", "p3ayrY0PK78"], query: "plate pinch grip hold" },
  // core
  { key: "ab-wheel-rollout", name: "Ab wheel rollout", match: /ab[- ]?(wheel|roller)|roll[- ]?outs?\b/i, ids: ["rqiTPdK1c_I", "A3uK5TPzHq8"], query: "ab wheel rollout form" },
  { key: "crunch", name: "Crunch", match: /^\s*(ab(dominal)? |floor |basic |stomach )?crunch(es)?\b/i, ids: ["NIqgTCTd2MM", "hBi65u_fp2M"], query: "crunch proper form" },
  { key: "bicycle-crunch", name: "Bicycle crunch", match: /bicycle (crunch(es)?|kicks?)/i, ids: ["NWzlS1Lp1e8", "eqg47ZuGZXQ"], query: "bicycle crunch form" },
  { key: "lying-leg-raise", name: "Lying leg raise", match: /(lying|floor|flat|bench|supine) leg raises?|^\s*leg raises?\b/i, ids: ["xJJu-WiROM8", "PkLYH3uRtSs"], query: "lying leg raise form" },
  { key: "hanging-leg-raise", name: "Hanging leg raise", match: /hanging (straight[- ])?leg raises?/i, ids: ["2n4UqRIJyk4", "_jLskVdzS4o"], query: "hanging leg raise form" },
  { key: "v-up", name: "V-up", match: /\bv[- ]?ups?\b/i, ids: ["Vnep1dTa_IQ", "7UVgs18Y1P4"], query: "v-up exercise form" },
  { key: "mountain-climber", name: "Mountain climber", match: /mountain[- ]climbers?/i, ids: ["ixxk9Qfn61o", "fpmWW6iXfes"], query: "mountain climbers form" },
  { key: "cable-woodchop", name: "Cable woodchop", match: /(cable|half[- ]kneeling) (wood ?)?chop(per)?s?|^\s*wood ?chop(per)?s?\b/i, ids: ["90Qh5XG6mqs", "umKKKlD6fhk"], query: "cable woodchopper form" },
  { key: "db-woodchop", name: "DB woodchop", match: /(db|dumbbell) wood ?chop(per)?s?/i, ids: ["b65s5BtdOEc", "bxSY805t8CQ"], query: "dumbbell woodchop form" },
  { key: "suitcase-carry", name: "Suitcase carry", match: /suitcase (carry|carries|walk|march)/i, ids: ["y-hn_Ha1-RE", "iTjwbts8Djw"], query: "suitcase carry form" },
  { key: "stir-the-pot", name: "Stir the pot", match: /stir[- ]the[- ]pot/i, ids: ["ipfJ1O7t1ps", "TojWydRDiHY"], query: "stir the pot exercise stability ball" },
  { key: "toe-touch-crunch", name: "Toe touch crunch", match: /toe[- ]touch(es| crunch(es)?)?/i, ids: ["NR4k8hJfs-8", "cCqsj40-_7A"], query: "toe touch crunch form" },
  { key: "flutter-kicks", name: "Flutter kicks", match: /flutter[- ]kicks?/i, ids: ["vHxbqt9ApdM", "tPmybsDX8ZY"], query: "flutter kicks form" },
  { key: "sit-up", name: "Sit-up", match: /^\s*(full |weighted )?sit[- ]?ups?\b/i, ids: ["jDwoBqPH0jk", "hYEnbuNy-h0"], query: "sit up proper form" },
  { key: "decline-sit-up", name: "Decline sit-up", match: /decline (bench )?(sit[- ]?ups?|crunch(es)?)/i, ids: ["N7hf1_vcX5w", "dwB9Rp_patE"], query: "decline sit up form" },
  { key: "plank-shoulder-tap", name: "Plank shoulder tap", match: /shoulder taps?/i, ids: ["VfwCQ14soUo", "sleParFUUpo"], query: "plank shoulder taps form" },
  { key: "side-plank-hip-dip", name: "Side plank hip dip", match: /side[- ]plank (hip )?dips?|hip dips?/i, ids: ["BWQRVB4LyFI", "WVX-yDxt0IU"], query: "side plank hip dips" },
  { key: "db-side-bend", name: "DB side bend", match: /((db|dumbbell) )?side bends?/i, ids: ["44DazvtgpGE", "BDXhn8ta3Vo"], query: "dumbbell side bend form" },
  { key: "landmine-rotation", name: "Landmine rotation", match: /landmine (rotation|twist|oblique|180|rainbow)s?/i, ids: ["MswsBPLGhE8", "e5DP6961WEk"], query: "landmine rotation form" },
  { key: "plank-body-saw", name: "Plank body saw", match: /body[- ]?saws?|plank saws?/i, ids: ["x0TVYi-ygNo", "dddE4abamB0"], query: "plank body saw form" },
  // full body and conditioning
  { key: "burpee", name: "Burpee", match: /burpees?/i, ids: ["NCqbpkoiyXE", "auBLPXO8Fww"], query: "burpee how to" },
  { key: "db-thruster", name: "DB thruster", match: /thrusters?/i, ids: ["u3wKkZjE8QM", "1KYPZ-Jzo3w"], query: "dumbbell thruster form" },
  { key: "db-snatch", name: "DB snatch", match: /(db|dumbbell) (power )?snatch/i, ids: ["xA_DpewzL7c", "3mlhF3dptAo"], query: "dumbbell snatch form" },
  { key: "broad-jump", name: "Broad jump", match: /broad jumps?|standing long jumps?/i, ids: ["XqpN9AbLMe4", "GTjndpflm_I"], query: "broad jump technique" },
  { key: "med-ball-slam", name: "Med ball slam", match: /(med(icine)?[- ]?ball|slam[- ]?ball|ball) slams?/i, ids: ["QxYhFwMd1Ks", "CkO1mfSBvv4"], query: "medicine ball slam how to" },
  { key: "med-ball-rotational-throw", name: "Med ball rotational throw", match: /rotational (med(icine)?[- ]?ball )?throws?|med(icine)?[- ]?ball (rotational|scoop|side) throws?/i, ids: ["DttZ5JU-b_U", "c7fB-K8Ih54"], query: "medicine ball rotational throw" },
  { key: "battle-ropes", name: "Battle ropes", match: /battl(e|ing)[- ]?ropes?/i, ids: ["FInbOExDeU0", "pQb2xIGioyQ"], query: "battle ropes exercise form" },
  { key: "sled-push", name: "Sled push", match: /sled push/i, ids: ["9XRRXaUpnLk", "QwscR2BhdEg"], query: "sled push technique" },
  { key: "turkish-get-up", name: "Turkish get-up", match: /turkish get[- ]?ups?|\btgu\b/i, ids: ["jFK8FOiLa_M", "0bWRPC49-KI"], query: "turkish get up tutorial" },
  { key: "bear-crawl", name: "Bear crawl", match: /bear crawls?/i, ids: ["U3Y58Kyw7Xw", "Ee1BQNI6zN4"], query: "bear crawl exercise" },
  { key: "rowing-intervals", name: "Rowing intervals", match: /rowing|rower|row[- ]?erg/i, ids: ["4zWu1yuJ0_g", "zQ82RYIFLN8"], query: "rowing machine technique" },
  { key: "ski-erg-intervals", name: "SkiErg intervals", match: /ski[- ]?erg/i, ids: ["B0lIgT5PHc8", "P7qpoJmX91I"], query: "ski erg technique" },
];

/** Lines that mention several exercises at once get no single video. */
const SKIP = /^half the usual/i;

export function videoFor(line: string): ExerciseVideo | null {
  if (SKIP.test(line)) return null;
  return VIDEOS.find((v) => v.match.test(line)) ?? null;
}

export const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
