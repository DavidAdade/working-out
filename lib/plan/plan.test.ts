import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePlan, dayTitle, weekForDate, moveDay, catchUp, isHard, type PlanSettings, type Week } from "./generate.ts";
import { painWarnings } from "./warnings.ts";
import { parseDuration, duration, pace } from "./format.ts";
import { weekday } from "./dates.ts";
import { videoFor, VIDEOS } from "./videos.ts";
import { EXERCISES, parseLine, videoOf, videoForLine } from "./exercises.ts";
import { builtinRows, customKey, youtubeId } from "./catalog.ts";
import { MUSCLES, regionOf } from "./muscles.ts";
import { EXERCISE_EQUIPMENT, isEquipment } from "./equipment.ts";
import { bestOn, compareSession, sessions, suggestWeight, type SetLike } from "./progress.ts";
import { fitness5k, goalPace } from "./paces.ts";
import { adaptPlan, planFor } from "./adapt.ts";
import { applySwaps, itemKey, itemLine, rankForSwap, searchScore, swapTarget, swapsShown, targetLine } from "./swaps.ts";
import { onTrack, wins } from "./ontrack.ts";
import { planToIcs } from "./ics.ts";
import { addDays, daysBetween } from "./dates.ts";
import { clampEnd, completion, dayExercises, elapsed, heldSeconds, holdPhases, isLocked, nextInRound, sessionDate, sessionDateFor, sessionState, SWITCH_SEC, type WorkoutSession } from "./workout.ts";
import { applySupersets } from "./supersets.ts";
import { accountability, runCredit, type AcctLog, type AcctSet, type AccountabilityInput } from "./accountability.ts";

const david: PlanSettings = {
  startDate: "2026-11-16",
  recoveryStart: "2026-10-19",
  returningFromInjury: true,
  timeTrialDate: "2027-03-26",
  raceDate: "2027-05-02",
  raceName: "Toronto Marathon: half",
  current5kSec: 35 * 60,
  goal5kSec: 29 * 60 + 59,
  halfGoalMinSec: 2.5 * 3600,
  halfGoalMaxSec: 2.75 * 3600,
};

test("phases land on the right dates", () => {
  const w = generatePlan(david);
  assert.equal(w[0].phase, "recovery");
  assert.equal(w.filter((x) => x.phase === "recovery").length, 4);
  assert.equal(weekForDate(w, "2026-11-16")!.phase, "return");
  assert.equal(weekForDate(w, "2027-03-26")!.phase, "tt");
  assert.equal(weekForDate(w, "2027-05-02")!.phase, "race");
  const tt = w.flatMap((x) => x.days).find((d) => d.date === "2027-03-26")!;
  assert.equal(dayTitle(tt), "5K TIME TRIAL");
  const race = w.flatMap((x) => x.days).find((d) => d.date === "2027-05-02")!;
  assert.equal(dayTitle(race), "Toronto Marathon: half");
});

test("every lift day pairs upper body; long-run day has no lifting", () => {
  const w = generatePlan(david).filter((x) => x.phase === "build");
  for (const wk of w) {
    const kinds = (wd: number) => wk.days.find((d) => weekday(d.date) === wd)!.blocks.map((b) => b.kind);
    assert.ok(kinds(1).includes("upper") && kinds(1).includes("legs"));
    assert.ok(kinds(3).includes("upper"));
    assert.ok(kinds(4).includes("upper"));
    assert.deepEqual(kinds(5).filter((k) => k !== "run" && k !== "test"), []);
  }
});

test("later start re-dates the plan but keeps the time trial", () => {
  const w = generatePlan({ ...david, startDate: "2026-11-30" });
  assert.equal(w.filter((x) => x.phase === "recovery").length, 6);
  assert.equal(weekForDate(w, "2027-03-26")!.phase, "tt");
});

test("long run never exceeds 16 km and only grows gradually", () => {
  const w = generatePlan(david);
  const kms = w.map((x) => Math.max(0, ...x.days.flatMap((d) => d.blocks.map((b) => b.km ?? 0)))).filter(Boolean);
  assert.ok(Math.max(...kms) <= 16);
  // compare with the longest run so far (sharpen and taper weeks dip on purpose)
  let best = kms[0];
  for (let i = 1; i < kms.length; i++) {
    assert.ok(kms[i] - best <= 2, `jump at ${i}: best ${best} → ${kms[i]}`);
    best = Math.max(best, kms[i]);
  }
});

test("skipping Thursday folds back + arms into Monday", () => {
  const w = generatePlan(david, { skips: ["2027-02-11"] });
  const wk = weekForDate(w, "2027-02-11")!;
  const thu = wk.days.find((d) => d.date === "2027-02-11")!;
  const mon = wk.days.find((d) => d.date === "2027-02-08")!;
  assert.equal(thu.skipped, true);
  assert.ok(mon.blocks.some((b) => b.foldedFrom === "Thu" && b.title.includes("back + arms")));
});

test("skipping Friday warns about the long run", () => {
  const w = generatePlan(david, { skips: ["2027-02-12"] });
  assert.ok(weekForDate(w, "2027-02-12")!.notes.some((n) => n.includes("Long run")));
});

test("no injury and no race: plan ends at the time trial", () => {
  const w = generatePlan({ startDate: "2027-01-04", returningFromInjury: false, timeTrialDate: "2027-05-14", current5kSec: 1980, goal5kSec: 1740 });
  assert.equal(w[0].phase, "base");
  assert.equal(w[w.length - 1].phase, "tt");
});

test("pain rules", () => {
  assert.equal(painWarnings([{ date: "2026-12-01", kind: "run", pain: { knee: 2 } }]).length, 0);
  assert.equal(painWarnings([{ date: "2026-12-01", kind: "run", pain: { knee: 3 } }])[0].level, "warn");
  const two = painWarnings([
    { date: "2026-12-01", kind: "run", pain: { knee: 4 } },
    { date: "2026-12-03", kind: "run", pain: { knee: 5 } },
  ]);
  assert.equal(two[0].level, "bad");
});

test("format helpers", () => {
  assert.equal(parseDuration("34:10"), 2050);
  assert.equal(parseDuration("1:02:30"), 3750);
  assert.equal(parseDuration("34.10"), 2050);
  assert.equal(parseDuration("1.02.30"), 3750);
  assert.equal(parseDuration("abc"), null);
  assert.equal(duration(2050), "34:10");
  assert.equal(pace(360), "6:00");
});

test("every strength and core exercise has a video", () => {
  const missing = new Set<string>();
  for (const wk of generatePlan(david)) for (const d of wk.days) for (const b of d.blocks) {
    if (b.kind !== "legs" && b.kind !== "upper" && b.kind !== "abs") continue;
    for (const line of b.items) if (!videoFor(line) && !/^(optional|no sets|half the usual|\d+ min mobility)/i.test(line)) missing.add(line);
  }
  assert.deepEqual([...missing], []);
});

test("video matching picks the specific variation", () => {
  assert.equal(videoFor("Bent-knee single-leg calf raise, 3×12 each")!.key, "calf-bent");
  assert.equal(videoFor("Single-leg DB Romanian deadlift, 3×8 each")!.key, "rdl-single");
  assert.equal(videoFor("Side plank, 3×30s each side")!.key, "side-plank");
  assert.equal(videoFor("DB skull crushers or close-grip push-ups, 3×12")!.key, "skull");
  assert.equal(videoFor("Hammer curls, 3×12")!.key, "hammer");
  assert.ok(VIDEOS.every((v) => v.ids.length >= 2 && v.ids.every((id) => /^[\w-]{11}$/.test(id))));
});

test("every lift line maps to a stable exercise", () => {
  const unmapped = new Set<string>();
  for (const wk of generatePlan(david)) for (const d of wk.days) for (const b of d.blocks) {
    if (b.kind !== "legs" && b.kind !== "upper" && b.kind !== "abs" && b.kind !== "mobility") continue;
    for (const line of b.items) if (/\d+\s*(×|sets?\b)/.test(line) && !parseLine(line)) unmapped.add(line);
  }
  assert.deepEqual([...unmapped], []);
  const keys = EXERCISES.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
  const lines = EXERCISES.flatMap((e) => e.lines.map((l) => l.toLowerCase()));
  assert.equal(new Set(lines).size, lines.length);
});

test("parseLine reads targets", () => {
  assert.deepEqual(parseLine("Romanian deadlift, 3×6–8, moderate-heavy")!.target, { sets: 3, reps: 6, repsMax: 8, sec: null, each: false });
  assert.equal(parseLine("Romanian deadlift, light, 3×8")!.exercise.key, "rdl");
  assert.deepEqual(parseLine("Side plank, 3×30s each side")!.target, { sets: 3, reps: null, repsMax: null, sec: 30, each: true });
  assert.deepEqual(parseLine("Push-ups, 3 sets, stop 2 reps short of failure")!.target, { sets: 3, reps: null, repsMax: null, sec: null, each: false });
  assert.equal(parseLine("30 min flat walk"), null);
});

const set = (date: string, kg: number, reps: number, light = false): SetLike => ({ date, exercise_key: "rdl", set_no: 1, weight: kg, unit: "kg", weight_kg: kg, reps, duration_sec: null, light_week: light });

test("progression: stalled, dropped, improved, light weeks skipped", () => {
  const s = sessions([set("2026-10-26", 40, 8), set("2026-11-02", 40, 8), set("2026-11-09", 40, 8)], "rdl");
  assert.equal(compareSession(s, "2026-11-09")?.kind, "stalled");
  assert.equal(compareSession(sessions([set("2026-11-02", 40, 8), set("2026-11-09", 40, 8)], "rdl"), "2026-11-09"), null, "one flat session isn't a stall");
  assert.equal(compareSession(sessions([set("2026-11-02", 40, 8), set("2026-11-09", 40, 10)], "rdl"), "2026-11-09"), null, "more reps is progress");
  assert.equal(compareSession(sessions([set("2026-11-02", 40, 8), set("2026-11-09", 37.5, 8)], "rdl"), "2026-11-09")?.kind, "dropped");
  assert.equal(compareSession(sessions([set("2026-10-26", 39, 8), set("2026-11-02", 40, 8), set("2026-11-09", 39, 8)], "rdl"), "2026-11-09"), null, "flat after a gain");
  assert.equal(compareSession(sessions([set("2026-10-26", 40, 8), set("2026-11-02", 40, 8), set("2026-11-09", 39, 8)], "rdl"), "2026-11-09")?.kind, "stalled");
  assert.equal(compareSession(sessions([set("2026-11-02", 40, 8), set("2026-11-09", 42.5, 8)], "rdl"), "2026-11-09"), null);
  assert.equal(compareSession(sessions([set("2026-11-02", 40, 8), set("2026-11-09", 30, 8, true)], "rdl"), "2026-11-09"), null, "light week");
  const skipLight = sessions([set("2026-10-26", 40, 8), set("2026-11-02", 40, 8), set("2026-11-09", 30, 8, true), set("2026-11-16", 40, 8)], "rdl");
  assert.equal(compareSession(skipLight, "2026-11-16")?.previous.date, "2026-11-02");
  assert.equal(compareSession(sessions([set("2026-11-02", 40, 8)], "rdl"), "2026-11-02"), null, "first session");
});

test("auto strength logs don't hide a run's pain warning", () => {
  const w = painWarnings([
    { date: "2026-11-18", kind: "run", pain: { knee: 4 } },
    { date: "2026-11-19", kind: "strength", pain: {}, auto: true },
  ]);
  assert.equal(w[0]?.level, "warn");
});

test("exercise database: every built-in has a video, muscles and equipment", () => {
  const muscleIds = new Set<string>(MUSCLES.map((m) => m.id));
  for (const e of EXERCISES) {
    assert.ok(videoOf(e), `${e.key} has no video (add \`video:\` pointing at a VIDEOS key)`);
  }
  for (const r of builtinRows()) {
    assert.match(r.key, /^[a-z0-9-]{1,40}$/);
    assert.ok(r.primary_muscles.length > 0, `${r.key} has no muscles in EXERCISE_MUSCLES`);
    for (const m of [...r.primary_muscles, ...r.secondary_muscles]) assert.ok(muscleIds.has(m), `${r.key}: unknown muscle ${m}`);
    assert.ok(r.equipment.length > 0, `${r.key} has no equipment in EXERCISE_EQUIPMENT`);
    for (const q of r.equipment) assert.ok(isEquipment(q), `${r.key}: unknown equipment ${q}`);
    assert.ok(r.video_ids.length > 0);
  }
  const keys = new Set(EXERCISES.map((e) => e.key));
  assert.deepEqual(Object.keys(EXERCISE_EQUIPMENT).filter((k) => !keys.has(k)), [], "equipment for an exercise that doesn't exist");
  // Plan lines get their video through the catalog
  assert.equal(videoForLine("Romanian deadlift, light, 3×8")!.key, "rdl");
});

test("custom exercise helpers", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=KN5vN3JskqI&t=3"), "KN5vN3JskqI");
  assert.equal(youtubeId("https://youtu.be/KN5vN3JskqI"), "KN5vN3JskqI");
  assert.equal(youtubeId("https://youtube.com/shorts/KN5vN3JskqI"), "KN5vN3JskqI");
  assert.equal(youtubeId("not a link"), null);
  assert.equal(customKey("Goblet Squat (heavy)!", "8cd36a"), "goblet-squat-heavy-8cd36a");
  assert.match(customKey("x".repeat(100), "abcdef"), /^[a-z0-9-]{1,40}$/);
});

test("every built-in falls in upper, lower or core", () => {
  for (const r of builtinRows()) assert.ok(regionOf(r.primary_muscles), `${r.key} has no region`);
  assert.equal(regionOf(["hamstrings", "glutes"]), "Lower");
  assert.equal(regionOf(["delts-front"]), "Upper");
  assert.equal(regionOf(["obliques", "abs"]), "Core");
  assert.equal(regionOf(["lower-back", "glutes"]), "Core", "bird dog");
});

/* ---------- coaching rules, checked on several profiles so nothing depends on one person's dates ---------- */
const PROFILES: Record<string, PlanSettings> = {
  david,
  september: { startDate: "2027-05-03", returningFromInjury: false, timeTrialDate: "2027-09-17", current5kSec: 1980, goal5kSec: 1740 },
  shortInjury: { startDate: "2027-01-04", recoveryStart: "2026-12-21", returningFromInjury: true, timeTrialDate: "2027-03-26", current5kSec: 2100, goal5kSec: 1900 },
  longRace: { startDate: "2027-06-07", returningFromInjury: true, recoveryStart: "2027-05-17", timeTrialDate: "2027-11-05", raceDate: "2027-12-12", current5kSec: 2400, goal5kSec: 2100, halfGoalMinSec: 9600, halfGoalMaxSec: 10200 },
};
const HARD = /^(?!easy|long run|run-walk|shakeout)/i;

test("time trial pacing finishes under the goal", () => {
  assert.equal(pace(goalPace(1799)), "5:58");
  assert.ok(goalPace(1799) * 5 < 1799);
  assert.ok(goalPace(1800) * 5 < 1800);
  const tt = generatePlan(david).flatMap((w) => w.days).flatMap((d) => d.blocks).find((b) => b.title === "5K TIME TRIAL")!;
  assert.match(tt.items.join(" "), /5:58\/km/);
  assert.match(tt.items.join(" "), /29:59 or faster/);
});

test("never more than one hard session or test a week", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    for (const w of generatePlan(p)) {
      const hard = w.days.flatMap((d) => d.blocks).filter((b) => b.kind === "test" || (b.kind === "run" && HARD.test(b.title)));
      assert.ok(hard.length <= 1, `${name} ${w.label}: ${hard.map((b) => b.title).join(", ")}`);
    }
  }
});

test("run-walk weeks: no runs on back-to-back days, first step is the easiest", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const ret = generatePlan(p).filter((w) => w.phase === "return");
    if (!p.returningFromInjury) continue;
    assert.ok(ret.length >= 2, name);
    assert.match(ret[0].days.find((d) => d.blocks.some((b) => b.kind === "run"))!.blocks[0].items[0], /^1 min easy run/);
    for (const w of ret) {
      const runDays = w.days.filter((d) => d.blocks.some((b) => b.kind === "run")).map((d) => weekday(d.date));
      for (let i = 1; i < runDays.length; i++) assert.ok((runDays[i] - runDays[i - 1] + 7) % 7 > 1, `${name} ${w.label}: ${runDays}`);
    }
  }
});

test("cutback weeks are every 4th running week and deload strength", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const w = generatePlan(p);
    const firstRun = w.find((x) => x.phase === "base")!.index!;
    for (const wk of w.filter((x) => x.cutback)) {
      assert.equal((wk.index! - firstRun + 1) % 4, 0, `${name} ${wk.label}`);
      assert.ok(wk.days.flatMap((d) => d.blocks).filter((b) => b.kind === "legs" || b.kind === "upper").every((b) => b.light), `${name} ${wk.label} strength not light`);
    }
  }
});

test("10K test comes with a long run of 8 km+ behind it and weeks to spare", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const w = generatePlan(p);
    const i = w.findIndex((x) => x.days.some((d) => d.blocks.some((b) => b.title === "10K test")));
    if (i < 0) continue;
    const longest = Math.max(0, ...w.slice(0, i).flatMap((x) => x.days.flatMap((d) => d.blocks.map((b) => b.km ?? 0))));
    assert.ok(longest >= 7.5, `${name}: longest before 10K test ${longest}`);
    const tt = w.findIndex((x) => x.phase === "tt");
    assert.ok(tt - i >= 5, name);
  }
  // The rule follows the profile's own dates, not the calendar
  assert.ok(generatePlan(PROFILES.september).some((x) => x.days.some((d) => d.blocks.some((b) => b.title === "10K test"))));
});

test("a race too soon after the time trial never replaces it", () => {
  const w = generatePlan({ ...david, raceDate: "2027-04-04" });
  assert.equal(weekForDate(w, "2027-03-26")!.phase, "tt");
  assert.ok(weekForDate(w, "2027-03-26")!.notes.some((n) => n.includes("less than 3 weeks")));
  assert.equal(w.at(-1)!.phase, "tt");
});

test("paces follow the latest test", () => {
  const logs = [{ date: "2027-01-06", kind: "test", km: 5, duration_sec: 33 * 60 }];
  assert.equal(fitness5k(2100, logs, "2027-01-10").sec, 33 * 60);
  assert.equal(fitness5k(2100, logs, "2027-06-10").source, "settings", "stale tests stop counting");
  assert.equal(fitness5k(2100, [{ date: "2027-01-06", kind: "test", km: 10, duration_sec: 68 * 60 }], "2027-01-10").source, "10K test");
  const slow = generatePlan(david).flatMap((w) => w.days).flatMap((d) => d.blocks).find((b) => b.title === "Tempo 3 × 6 min")!;
  const fast = generatePlan(david, { fitness5kSec: 31 * 60 }).flatMap((w) => w.days).flatMap((d) => d.blocks).find((b) => b.title === "Tempo 3 × 6 min")!;
  assert.notEqual(slow.items[1], fast.items[1]);
  assert.match(slow.items[1], /7:19/, "threshold for a 35:00 5K is about 7:15–7:25");
});

test("pain and gates change the coming week", () => {
  const w = generatePlan(david);
  const today = "2026-11-16";
  const gated = adaptPlan(w, { today, gatesPending: true, warnings: [] });
  const tue = gated.flatMap((x) => x.days).find((d) => d.date === "2026-11-17")!;
  assert.ok(tue.blocks.every((b) => b.kind !== "run"), "runs wait for the gates");
  assert.ok(generatePlan(david).flatMap((x) => x.days).find((d) => d.date === "2026-11-17")!.blocks.some((b) => b.kind === "run"), "original untouched");

  const buildDay = "2027-02-08";
  const stop = adaptPlan(w, { today: buildDay, gatesPending: false, warnings: [{ level: "bad", code: "stop", message: "" }] });
  const days = stop.flatMap((x) => x.days).filter((d) => d.date >= buildDay && d.date < addDays(buildDay, 7));
  assert.ok(days.every((d) => d.blocks.every((b) => b.kind !== "run" && b.kind !== "test")));

  const ease = adaptPlan(w, { today: buildDay, gatesPending: false, warnings: [{ level: "warn", code: "ease", message: "" }] });
  const wed = ease.flatMap((x) => x.days).find((d) => d.date === "2027-02-10")!;
  assert.equal(wed.blocks[0].title, "Easy 20 min");
  assert.ok(ease.flatMap((x) => x.days).find((d) => d.date === "2027-02-12")!.blocks.some((b) => b.km), "long run stays");
});

test("pain warnings only look at the last week, and morning check-ins count", () => {
  const old = [{ date: "2026-12-01", kind: "run", pain: { knee: 4 } }];
  assert.equal(painWarnings(old, "2026-12-03")[0]?.code, "ease");
  assert.equal(painWarnings(old, "2026-12-20").length, 0);
  assert.equal(painWarnings([...old, { date: "2026-12-02", kind: "check", pain: { knee: 0 } }], "2026-12-03").length, 0, "a pain-free morning clears it");
  assert.equal(painWarnings([{ date: "2026-12-02", kind: "check", pain: { heel: 3 } }], "2026-12-03")[0]?.code, "hold");
});

test("bests and wins", () => {
  const s = sessions([set("2026-11-02", 40, 8), set("2026-11-09", 42.5, 8), set("2026-11-16", 42.5, 10)], "rdl");
  assert.equal(bestOn(s, "2026-11-09"), "weight");
  assert.equal(bestOn(s, "2026-11-16"), "reps");
  assert.equal(bestOn(s, "2026-11-02"), null);
  const runs = [
    { date: "2026-11-01", kind: "run", km: 5, duration_sec: 2400, pain: {} },
    { date: "2026-11-08", kind: "run", km: 6, duration_sec: 2900, pain: {} },
  ];
  const w = wins(runs, [set("2026-11-02", 40, 8), set("2026-11-09", 42.5, 8)], () => "RDL", "2026-11-05", "2026-11-12");
  assert.deepEqual(w.map((x) => x.text), ["RDL: heaviest yet", "Longest run yet: 6 km"]);
});

test("on-track verdict", () => {
  const w = generatePlan(david);
  const base = { settings: david, weeks: w, logs: [], activeDates: new Set<string>(), painAreas: ["knee"], warnings: [], gatesPassed: 1, gatesTotal: 3 };
  const before = onTrack({ ...base, fitness: { sec: 2100, source: "settings" }, today: "2026-11-12" });
  assert.match(before.headline, /Running starts in 4 days/);
  assert.equal(before.status, "hold", "gates not passed a few days out");
  // Halfway from 35:00 to 29:59 the line is at about 32:30
  const ahead = onTrack({ ...base, fitness: { sec: 32 * 60, source: "5K test", date: "2027-01-20" }, today: "2027-01-22" });
  assert.ok(ahead.predicted!.target > 32 * 60);
  assert.match(ahead.lines[0], /ahead/);
  const behind = onTrack({ ...base, fitness: { sec: 34 * 60, source: "5K test", date: "2027-01-20" }, today: "2027-01-22" });
  assert.equal(behind.status, "hold");
});

test("suggested weight: only after every set hit the top of the range", () => {
  const t = { sets: 3, reps: 6, repsMax: 8 };
  const three = (kg: number, reps: number[]) => sessions(reps.map((r, i) => ({ ...set("2026-11-02", kg, r), set_no: i + 1 })), "rdl")[0];
  assert.equal(suggestWeight(three(40, [8, 8, 8]), t, "kg"), 42.5);
  assert.equal(suggestWeight(three(40, [8, 8, 7]), t, "kg"), null);
  assert.equal(suggestWeight(three(10, [8, 8, 8]), t, "kg"), 11, "light dumbbells step by 1 kg");
  assert.equal(suggestWeight(three(40, [8, 8, 8]), t, "lb"), 93, "88 lb + 5");
  assert.equal(suggestWeight(undefined, t, "kg"), null);
});

test("calendar feed: one event per training day, valid lines", () => {
  const ics = planToIcs(generatePlan(david, { skips: ["2027-02-11"] }), { name: "WorkoutFlex", uidSeed: "abc", now: new Date("2026-10-25T12:00:00Z") });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20270326"));
  assert.ok(!ics.includes("UID:2027-02-11-abc"), "skipped days are left out");
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(/SUMMARY:W19 · 5K TIME TRIAL/.test(ics.replace(/\r\n /g, "")));
});

/* ---------- moving days within a week ---------- */
const at = (w: Week, offset: number) => addDays(w.start, offset);
const titles = (w: Week) => w.days.map((d) => `${d.date} ${d.blocks.map((b) => b.title).join(" + ")}`);

test("moving days: swap two days, or move to a free day, every profile", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const wk = generatePlan(p).find((w) => w.phase === "build" && !w.cutback)!;
    // Swap Mon and Fri
    const swap = moveDay(wk, at(wk, 0), at(wk, 4))!;
    assert.equal(swap.length, 2, name);
    const sw = weekForDate(generatePlan(p, { moves: swap }), wk.start)!;
    assert.deepEqual(sw.days.map((d) => d.date), [...sw.days.map((d) => d.date)].sort(), `${name}: days stay in date order`);
    assert.equal(sw.days[0].movedFrom, at(wk, 4), name);
    assert.equal(sw.days[0].blocks[0].title, wk.days[4].blocks[0].title, `${name}: Friday's workout is on Monday`);
    assert.deepEqual([...titles(wk).map((t) => t.slice(11))].sort(), [...titles(sw).map((t) => t.slice(11))].sort(), `${name}: same workouts`);
    // Move Fri to Sat: Fri is rest
    const sat = weekForDate(generatePlan(p, { moves: moveDay(wk, at(wk, 4), at(wk, 5))! }), wk.start)!;
    assert.ok(!sat.days.some((d) => d.date === at(wk, 4)), name);
    assert.ok(sat.days.find((d) => d.date === at(wk, 5))!.blocks.some((b) => b.km), `${name}: long run on Saturday`);
    // Moving it back undoes it
    const back = moveDay(sat, at(wk, 5), at(wk, 4))!;
    assert.deepEqual(back, [], name);
  }
});

test("moving days: time trial, race, other weeks and run-walk clashes are refused", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const plan = generatePlan(p);
    const tt = plan.find((w) => w.phase === "tt")!;
    const ttDay = tt.days.find((d) => d.blocks.some((b) => b.title === "5K TIME TRIAL"))!;
    assert.equal(moveDay(tt, ttDay.date, at(tt, 5)), null, `${name}: time trial stays`);
    assert.equal(moveDay(tt, at(tt, 0), ttDay.date), null, `${name}: nothing lands on the time trial`);
    assert.equal(moveDay(tt, at(tt, 0), at(tt, 7)), null, `${name}: not into next week`);
    const race = plan.find((w) => w.phase === "race");
    if (race) assert.equal(moveDay(race, race.days.find((d) => !d.skippable)!.date, at(race, 5)), null, `${name}: race day stays`);
    // Stored moves that don't fit are ignored, not an error
    const across = generatePlan(p, { moves: [{ from: at(tt, 0), to: at(tt, 7) }, { from: ttDay.date, to: at(tt, 5) }] });
    assert.deepEqual(titles(weekForDate(across, tt.start)!), titles(tt), name);
    const rw = plan.find((w) => w.phase === "return");
    // Tue run-walk onto Wed would put runs on Wed and Fri: fine. Onto Thu: back to back with Fri
    if (rw) assert.equal(moveDay(rw, at(rw, 1), at(rw, 3)), null, `${name}: run-walk days stay apart`);
  }
});

test("moving days: back-to-back hard days get a note, and skips fold onto the new days", () => {
  const wk = generatePlan(david).find((w) => w.phase === "build" && !w.cutback && w.days[2].blocks[0].note?.includes("One hard session"))!;
  // Wednesday's intervals onto Thursday, next to Friday's long run
  const moved = weekForDate(generatePlan(david, { moves: moveDay(wk, at(wk, 2), at(wk, 3))! }), wk.start)!;
  assert.match(moved.days.find((d) => d.date === at(wk, 3))!.alerts.join(" "), /Two hard days in a row/);
  // Swap Mon and Tue, then skip Tuesday (now Monday's lifting): its upper body folds onto another lift day
  const moves = moveDay(wk, at(wk, 0), at(wk, 1))!;
  const skipped = weekForDate(generatePlan(david, { moves, skips: [at(wk, 1)] }), wk.start)!;
  assert.ok(skipped.days.find((d) => d.date === at(wk, 1))!.skipped);
  assert.ok(skipped.days.some((d) => d.blocks.some((b) => b.foldedFrom === "Tue" && b.kind === "upper")));
});

test("catch up: a missed workout moves to today, today's goes to a free day", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const wk = generatePlan(p).find((w) => w.phase === "build" && !w.cutback)!;
    // Missed Tuesday's easy run; today is Wednesday
    const moves = catchUp(wk, at(wk, 1), at(wk, 2))!;
    const w = weekForDate(generatePlan(p, { moves }), wk.start)!;
    assert.equal(w.days.find((d) => d.date === at(wk, 2))!.blocks[0].title, wk.days[1].blocks[0].title, name);
    assert.equal(w.days.find((d) => d.date === at(wk, 5))?.blocks[0].title, wk.days[2].blocks[0].title, `${name}: Wednesday's workout goes to Saturday`);
    assert.equal(w.days.length, wk.days.length, name);
  }
});

test("moved days: pain changes and the calendar follow the new date", () => {
  const wk = generatePlan(david).find((w) => w.phase === "build" && !w.cutback && w.days[2].blocks[0].note?.includes("One hard session"))!;
  const moves = moveDay(wk, at(wk, 2), at(wk, 5))!;
  const plan = generatePlan(david, { moves });
  const ease = adaptPlan(plan, { today: wk.start, gatesPending: false, warnings: [{ level: "warn", code: "ease", message: "" }] });
  assert.equal(ease.flatMap((x) => x.days).find((d) => d.date === at(wk, 5))!.blocks[0].title, "Easy 20 min");
  const ics = planToIcs(plan, { name: "WorkoutFlex", uidSeed: "abc", now: new Date("2026-10-25T12:00:00Z") });
  assert.ok(ics.includes(`UID:${at(wk, 5)}-abc`) && !ics.includes(`UID:${at(wk, 2)}-abc`));
});

/* ---------- exercise swaps ---------- */
const KNOWN = new Map(builtinRows().map((e) => [e.key, e] as const));
// A custom exercise has no template lines; swaps must still work for it
KNOWN.set("goblet-squat-abc123", { key: "goblet-squat-abc123", name: "Goblet squat", load: "weight", primary_muscles: ["quads", "glutes"], secondary_muscles: [], equipment: ["dumbbell"], video_ids: [], video_query: null, lines: [], owner: "u1" });
const lookup = (k: string) => KNOWN.get(k);
const firstLift = (d: Week["days"][number]) => {
  for (const b of d.blocks) for (const [i, l] of b.items.entries()) { const p = parseLine(l); if (p) return { b, i, p }; }
  return null;
};
const findSwap = (w: Week, from: string) => w.days.flatMap((d) => d.blocks.flatMap((b) => Object.values(b.swaps ?? {}).filter((s) => s.from === from).map((s) => ({ d, b, s }))));

test("swaps: shown on the day, keep sets, follow a move, every profile", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const wk = generatePlan(p).find((w) => w.phase === "build" && !w.cutback)!;
    const mon = firstLift(wk.days[0])!;
    const from = mon.p.exercise.key;
    const swap = { planDate: at(wk, 0), from, to: "goblet-squat-abc123" };
    const w = weekForDate(applySwaps(generatePlan(p), [swap], lookup), wk.start)!;
    const s = w.days[0].blocks.find((b) => b.title === mon.b.title)!.swaps![mon.i];
    assert.equal(s.to, "goblet-squat-abc123", name);
    assert.equal(s.target.sets, mon.p.target.sets, `${name}: sets stay`);
    assert.match(itemLine(w.days[0].blocks.find((b) => b.title === mon.b.title)!, mon.i), /^Goblet squat, \d×/);
    assert.equal(itemKey(w.days[0].blocks.find((b) => b.title === mon.b.title)!, mon.i), "goblet-squat-abc123");
    // Template text is untouched
    assert.equal(w.days[0].blocks.find((b) => b.title === mon.b.title)!.items[mon.i], mon.b.items[mon.i]);

    // Monday's workout moved to Tuesday: the swap goes with it
    const moved = weekForDate(applySwaps(generatePlan(p, { moves: moveDay(wk, at(wk, 0), at(wk, 1))! }), [swap], lookup), wk.start)!;
    const hit = findSwap(moved, from);
    assert.equal(hit.length, 1, name);
    assert.equal(hit[0].d.date, at(wk, 1), `${name}: swap shows on the day the workout moved to`);
  }
});

test("swaps: follow upper body folded after a skip, every profile", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const wk = generatePlan(p).find((w) => w.phase === "build" && !w.cutback)!;
    const thu = wk.days.find((d) => d.date === at(wk, 3))!;
    const upper = thu.blocks.find((b) => b.carry)!;
    const from = parseLine(upper.items[0])!.exercise.key;
    const w = weekForDate(applySwaps(generatePlan(p, { skips: [at(wk, 3)] }), [{ planDate: at(wk, 3), from, to: "lateral-raise" }], lookup), wk.start)!;
    const hit = findSwap(w, from).filter((x) => !x.d.skipped);
    assert.equal(hit.length, 1, name);
    assert.equal(hit[0].b.foldedFrom, "Thu", name);
    assert.equal(hit[0].b.planDate, at(wk, 3), `${name}: folded block keeps its plan date`);
  }
});

test("swaps: stale rows are ignored, targets convert, light weeks, applying twice", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const plan = generatePlan(p);
    const wk = plan.find((w) => w.phase === "build" && !w.cutback)!;
    const mon = firstLift(wk.days[0])!;
    const from = mon.p.exercise.key;
    // Original not on that plan day any more (Tuesday is a run), or an exercise that's gone
    assert.equal(findSwap(weekForDate(applySwaps(plan, [{ planDate: at(wk, 1), from, to: "plank" }], lookup), wk.start)!, from).length, 0, name);
    assert.equal(findSwap(weekForDate(applySwaps(plan, [{ planDate: at(wk, 0), from, to: "deleted-thing-abc123" }], lookup), wk.start)!, from).length, 0, name);

    // Reps to seconds and back: same sets, 30 s or 10 reps
    const timed = findSwap(weekForDate(applySwaps(plan, [{ planDate: at(wk, 0), from, to: "plank" }], lookup), wk.start)!, from)[0].s;
    assert.deepEqual([timed.target.sets, timed.target.sec, timed.target.reps], [mon.p.target.sets, 30, null], name);
    const wed = wk.days[2].blocks.flatMap((b) => b.items.map((l, i) => ({ b, i, p: parseLine(l) }))).find((x) => x.p?.exercise.load === "time")!;
    const reps = findSwap(weekForDate(applySwaps(plan, [{ planDate: at(wk, 2), from: wed.p!.exercise.key, to: "dead-bug" }], lookup), wk.start)!, wed.p!.exercise.key)[0].s;
    assert.deepEqual([reps.target.sets, reps.target.reps, reps.target.sec], [wed.p!.target.sets, 10, null], name);

    // Light week: the block stays light, so the row shows at most 2 sets whatever the exercise
    const cut = plan.find((w) => w.cutback);
    if (cut) {
      const cm = firstLift(cut.days[0])!;
      const hit = findSwap(weekForDate(applySwaps(plan, [{ planDate: at(cut, 0), from: cm.p.exercise.key, to: "goblet-squat-abc123" }], lookup), cut.start)!, cm.p.exercise.key)[0];
      assert.ok(hit.b.light, name);
      assert.equal(Math.min(hit.s.target.sets, hit.b.light ? 2 : 99), 2, name);
    }

    // Idempotent, and putting it back (no row) removes the overlay
    const once = applySwaps(plan, [{ planDate: at(wk, 0), from, to: "plank" }], lookup);
    assert.deepEqual(applySwaps(once, [{ planDate: at(wk, 0), from, to: "plank" }], lookup), once, name);
    assert.equal(findSwap(weekForDate(applySwaps(once, [], lookup), wk.start)!, from).length, 0, name);
  }
});

test("swaps: same-kind targets keep reps and range, and the calendar shows the new name", () => {
  const t = swapTarget({ sets: 3, reps: 8, repsMax: 10, sec: null, each: true }, "bodyweight");
  assert.deepEqual(t, { sets: 3, reps: 8, repsMax: 10, sec: null, each: true });
  assert.equal(targetLine("Hammer curl", t), "Hammer curl, 3×8–10 each");
  assert.equal(targetLine("Side plank", { sets: 2, reps: null, repsMax: null, sec: 30, each: false }), "Side plank, 2×30s");
  const wk = generatePlan(david).find((w) => w.phase === "build" && !w.cutback)!;
  const mon = firstLift(wk.days[0])!;
  const plan = applySwaps(generatePlan(david), [{ planDate: at(wk, 0), from: mon.p.exercise.key, to: "goblet-squat-abc123" }], lookup);
  const ics = planToIcs(plan, { name: "WorkoutFlex", uidSeed: "abc", now: new Date("2026-10-25T12:00:00Z") });
  assert.ok(ics.replace(/\r\n /g, "").includes("Goblet squat\\, 3×"));
  // planFor applies them as well
  const shown = planFor({ settings: david, logs: [], skips: [], moves: [], gatesPending: false, today: wk.start, swaps: [{ planDate: at(wk, 0), from: mon.p.exercise.key, to: "goblet-squat-abc123" }], exercise: lookup });
  assert.equal(swapsShown(shown.weeks).filter((s) => s.date === at(wk, 0)).length, 1);
});

test("swap picker: same muscles first, forgiving search", () => {
  const all = [...KNOWN.values()];
  const rdl = KNOWN.get("rdl")!;
  const top = rankForSwap(all, rdl, "").slice(0, 8).map((e) => e.key);
  assert.ok(top.includes("db-rdl") && top.includes("sl-db-rdl") && top.includes("deadlift"), top.join());
  assert.ok(!rankForSwap(all, rdl, "").some((e) => e.key === "rdl"), "never offers itself");
  assert.equal(rankForSwap(all, rdl, "").length, all.length - 1, "everything else follows A–Z");
  assert.equal(rankForSwap(all, rdl, "db rdl")[0].key, "db-rdl");
  assert.equal(rankForSwap(all, rdl, "bulgarain")[0].key, "bulgarian-split-squat", "one typo");
  assert.ok(rankForSwap(all, rdl, "hamstrings", (id) => MUSCLES.find((m) => m.id === id)?.name ?? id).some((e) => e.key === "leg-curl"), "by muscle");
  assert.ok(rankForSwap(all, rdl, "goblet").some((e) => e.key === "goblet-squat-abc123"), "custom exercises too");
  assert.deepEqual(rankForSwap(all, rdl, "zzqx"), []);
  assert.ok(searchScore("lat pull", "Lat pulldown", []) > searchScore("lt", "Lat pulldown", []));
});

/* ---------- workout sessions, completion, hold timer, weighted holds ---------- */
const T0 = "2026-11-02T18:00:00.000Z";
const ms = (h: number) => Date.parse(T0) + h * 3600e3;
const ws = (ended: string | null = null, auto = false): WorkoutSession => ({ plan_date: "2026-11-02", started_at: T0, ended_at: ended, auto_ended: auto });

test("workout sessions: auto-end after 4 hours, locked 12 hours after the end", () => {
  const open = sessionState(ws(), ms(1));
  assert.equal(open.active, true);
  assert.equal(open.locked, false);
  assert.equal(open.needsAutoEnd, false);

  // Left open: reads as ended at start + 4 h, and asks to be saved that way
  const late = sessionState(ws(), ms(5));
  assert.equal(late.active, false);
  assert.equal(late.endedAt, ms(4));
  assert.equal(late.autoEnded, true);
  assert.equal(late.needsAutoEnd, true);
  assert.equal(late.locked, false);
  assert.equal(sessionState(ws(), ms(16) - 1).locked, false);
  assert.equal(sessionState(ws(), ms(16)).locked, true, "never ended: locked 12 h after the automatic end");

  const ended = ws(new Date(ms(1)).toISOString());
  assert.equal(sessionState(ended, ms(2)).needsAutoEnd, false);
  assert.equal(sessionState(ended, ms(13) - 1).locked, false);
  assert.equal(sessionState(ended, ms(13)).locked, true);
  assert.equal(isLocked(ended, ms(20)), true);
  assert.equal(isLocked(undefined, ms(20)), false, "no session, no lock");

  // End times are kept between the start and the 4-hour mark
  assert.deepEqual(clampEnd(T0, new Date(ms(1)).toISOString(), false), { ended_at: new Date(ms(1)).toISOString(), auto_ended: false });
  assert.deepEqual(clampEnd(T0, new Date(ms(-1)).toISOString(), false), { ended_at: T0, auto_ended: false });
  assert.deepEqual(clampEnd(T0, new Date(ms(9)).toISOString(), false), { ended_at: new Date(ms(4)).toISOString(), auto_ended: true });
  assert.equal(elapsed(65e3), "1:05");
  assert.equal(elapsed(3723e3), "1:02:03");
});

test("workout sessions: stored under the plan's own date, so they follow a move, every profile", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const wk = generatePlan(p).find((w) => w.phase === "build" && !w.cutback)!;
    const moves = moveDay(wk, at(wk, 0), at(wk, 1))!;
    const w = weekForDate(generatePlan(p, { moves }), wk.start)!;
    const tue = w.days.find((d) => d.date === at(wk, 1))!;
    assert.equal(sessionDate(tue), at(wk, 0), `${name}: Monday's workout on Tuesday keeps Monday's session`);
    assert.equal(sessionDateFor(at(wk, 1), moves), at(wk, 0), name);
    assert.equal(sessionDateFor(at(wk, 3), moves), at(wk, 3), name);
    assert.equal(sessionDate(wk.days[3]), at(wk, 3), name);
  }
});

const logSets = (date: string, key: string, n: number, planDate: string | null = null) =>
  Array.from({ length: n }, (_, i) => ({ date, plan_date: planDate, exercise_key: key, set_no: i + 1 }));

test("completion: every set, more than planned, or something missing, every profile", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const wk = generatePlan(p).find((w) => w.phase === "build" && !w.cutback)!;
    const day = wk.days.find((d) => dayExercises(d).length >= 2)!;
    const list = dayExercises(day);
    const all = list.flatMap((x) => logSets(day.date, x.key, x.sets));
    const planned = list.reduce((a, x) => a + x.sets, 0);

    assert.deepEqual(completion(day, []), { planned, done: 0, extraSets: 0, extraExercises: 0, status: "incomplete" }, name);
    assert.equal(completion(day, all.slice(1)).status, "incomplete", `${name}: one set short`);
    assert.deepEqual(completion(day, all), { planned, done: planned, extraSets: 0, extraExercises: 0, status: "complete" }, name);
    // An extra set of something planned
    const more = [...all, { date: day.date, plan_date: null, exercise_key: list[0].key, set_no: 99 }];
    assert.equal(completion(day, more).status, "beyond", name);
    assert.equal(completion(day, more).extraSets, 1, name);
    // An exercise the day doesn't ask for
    const bonus = completion(day, [...all, ...logSets(day.date, "burpee", 2)]);
    assert.equal(bonus.status, "beyond", name);
    assert.deepEqual([bonus.extraSets, bonus.extraExercises], [2, 1], name);
    // Extras don't make up for a missing set
    assert.equal(completion(day, [...all.slice(1), ...logSets(day.date, "burpee", 3)]).status, "incomplete", name);
    // Done early: sets saved under another date count through plan_date; other days' sets don't
    assert.equal(completion(day, list.flatMap((x) => logSets(addDays(day.date, -2), x.key, x.sets, day.date))).status, "complete", `${name}: early`);
    assert.equal(completion(day, list.flatMap((x) => logSets(addDays(day.date, -2), x.key, x.sets))).status, "incomplete", name);
    // A day with nothing to log
    const run = wk.days.find((d) => d.blocks.length && !dayExercises(d).length);
    if (run) assert.equal(completion(run, all).status, "none", name);
  }
});

test("completion: swaps count the exercise shown, light weeks ask for 2 sets", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const wk = generatePlan(p).find((w) => w.phase === "build" && !w.cutback)!;
    const mon = firstLift(wk.days[0])!;
    const from = mon.p.exercise.key;
    const swapped = weekForDate(applySwaps(generatePlan(p), [{ planDate: at(wk, 0), from, to: "goblet-squat-abc123" }], lookup), wk.start)!.days[0];
    const list = dayExercises(swapped);
    assert.ok(list.some((x) => x.key === "goblet-squat-abc123") && !list.some((x) => x.key === from), name);
    const all = list.flatMap((x) => logSets(swapped.date, x.key, x.sets));
    // Sets logged for the original before the swap are neither progress nor extra
    const c = completion(swapped, [...all, ...logSets(swapped.date, from, 2)]);
    assert.equal(c.status, "complete", name);

    const cut = generatePlan(p).find((w) => w.cutback && w.days.some((d) => dayExercises(d).length));
    if (!cut) continue;
    const light = cut.days.find((d) => dayExercises(d).length)!;
    assert.ok(dayExercises(light).every((x) => x.sets <= 2), `${name}: light week`);
  }
});

/* ---------- supersets ---------- */
const keyAt = (b: Week["days"][number]["blocks"][number], i: number) => parseLine(b.items[i])!.exercise.key;
const liftBlocks = (d: Week["days"][number]) => d.blocks.filter((b) => dayExercises({ blocks: [b] }).length >= 3);
const groupsOn = (w: Week) => w.days.flatMap((d) => d.blocks.filter((b) => b.supersets).map((b) => ({ d, b })));

test("supersets: shown on the day, letters per day, follow a move and a Thursday fold, survive a swap, every profile", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const plan = generatePlan(p);
    const wk = plan.find((w) => w.phase === "build" && !w.cutback)!;
    const [first, second] = liftBlocks(wk.days[0]);
    const link = (i: number, b = first, planDate = at(wk, 0)) => ({ planDate, key: keyAt(b, i) });

    // A pair, then a group of three, then two pairs in one block and one in the next
    const pair = weekForDate(applySupersets(plan, [link(0)]), wk.start)!;
    assert.deepEqual(pair.days[0].blocks.find((b) => b.title === first.title)!.supersets, [[0, 1]], name);
    const list = dayExercises(pair.days[0]);
    assert.deepEqual(list.slice(0, 2).map((x) => x.group), [{ letter: "A", pos: 1, size: 2 }, { letter: "A", pos: 2, size: 2 }], name);
    assert.ok(list.slice(2).every((x) => !x.group), name);
    const three = weekForDate(applySupersets(plan, [link(0), link(1)]), wk.start)!;
    assert.deepEqual(three.days[0].blocks.find((b) => b.title === first.title)!.supersets, [[0, 1, 2]], name);
    const many = weekForDate(applySupersets(plan, [link(0), link(2), link(0, second)]), wk.start)!;
    assert.deepEqual(many.days[0].blocks.find((b) => b.title === first.title)!.supersets, [[0, 1], [2, 3]], name);
    assert.deepEqual([...new Set(dayExercises(many.days[0]).flatMap((x) => (x.group ? [x.group.letter] : [])))], ["A", "B", "C"], `${name}: letters run across the day`);
    // Template text is untouched
    assert.deepEqual(many.days[0].blocks.find((b) => b.title === first.title)!.items, first.items, name);

    // Monday's workout moved to Tuesday: the superset goes with it
    const moved = weekForDate(applySupersets(generatePlan(p, { moves: moveDay(wk, at(wk, 0), at(wk, 1))! }), [link(0)]), wk.start)!;
    assert.deepEqual(groupsOn(moved).map((x) => x.d.date), [at(wk, 1)], name);

    // Thursday skipped: its upper body folds into another day and keeps its superset
    const upper = wk.days[3].blocks.find((b) => b.carry)!;
    const folded = weekForDate(applySupersets(generatePlan(p, { skips: [at(wk, 3)] }), [link(0, upper, at(wk, 3))]), wk.start)!;
    const hit = groupsOn(folded).filter((x) => !x.d.skipped);
    assert.equal(hit.length, 1, name);
    assert.equal(hit[0].b.foldedFrom, "Thu", name);
    assert.deepEqual(hit[0].b.supersets, [[0, 1]], name);

    // Swapping either exercise keeps the group, and it logs under the exercise swapped in
    for (const i of [0, 1]) {
      const swapped = applySwaps(plan, [{ planDate: at(wk, 0), from: keyAt(first, i), to: "goblet-squat-abc123" }], lookup);
      const day = weekForDate(applySupersets(swapped, [link(0)]), wk.start)!.days[0];
      assert.deepEqual(day.blocks.find((b) => b.title === first.title)!.supersets, [[0, 1]], `${name}: swap ${i}`);
      assert.equal(dayExercises(day)[i].key, "goblet-squat-abc123", name);
      assert.equal(dayExercises(day)[i].group?.letter, "A", name);
    }
  }
});

test("supersets: stale rows and links to a line that isn't an exercise are ignored; applying twice", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const plan = generatePlan(p);
    const wk = plan.find((w) => w.phase === "build" && !w.cutback)!;
    const [first] = liftBlocks(wk.days[0]);
    const last = first.items.length - 1;
    // Not on that plan day (Tuesday is a run), the block's last line, or a key that isn't there at all
    for (const links of [[{ planDate: at(wk, 1), key: keyAt(first, 0) }], [{ planDate: at(wk, 0), key: keyAt(first, last) }], [{ planDate: at(wk, 0), key: "deleted-thing-abc123" }]])
      assert.equal(groupsOn(weekForDate(applySupersets(plan, links), wk.start)!).length, 0, name);
    // The next line is a note, not an exercise
    const noted: Week[] = plan.map((w) => (w !== wk ? w : { ...w, days: w.days.map((d, di) => (di ? d : { ...d, blocks: d.blocks.map((b) => (b !== first ? b : { ...b, items: [b.items[0], "Rest 2 min", ...b.items.slice(1)] })) })) }));
    assert.equal(groupsOn(weekForDate(applySupersets(noted, [{ planDate: at(wk, 0), key: keyAt(first, 0) }]), wk.start)!).length, 0, name);

    // Idempotent, and no rows removes the overlay
    const once = applySupersets(plan, [{ planDate: at(wk, 0), key: keyAt(first, 0) }]);
    assert.deepEqual(applySupersets(once, [{ planDate: at(wk, 0), key: keyAt(first, 0) }]), once, name);
    assert.equal(groupsOn(weekForDate(applySupersets(once, []), wk.start)!).length, 0, name);

    // planFor applies them after swaps
    const shown = planFor({ settings: p, logs: [], skips: [], moves: [], gatesPending: false, today: wk.start, supersets: [{ planDate: at(wk, 0), key: keyAt(first, 0) }] });
    assert.equal(groupsOn(weekForDate(shown.weeks, wk.start)!).length, 1, name);
  }
});

test("supersets: round by round, rest after the round, uneven groups, extra sets", () => {
  const ex = (id: string, sets: number, pos: number, size: number, letter = "A") => ({ id, key: id, sets, group: { letter, pos, size } });
  const counts = (m: Record<string, number>) => (k: string) => m[k] ?? 0;
  const pair = [ex("a", 3, 1, 2), ex("b", 3, 2, 2), { id: "c", key: "c", sets: 3 }];
  assert.deepEqual(nextInRound(pair, "a", 1, counts({})), { next: "b", rest: false, groupDone: false }, "A1 → A2, no rest");
  assert.deepEqual(nextInRound(pair, "b", 1, counts({ a: 1 })), { next: "a", rest: true, groupDone: false }, "A2 rests, back to A1");
  assert.deepEqual(nextInRound(pair, "b", 1, counts({ a: 1, b: 1 })), { next: "a", rest: true, groupDone: false }, "already counted");
  assert.deepEqual(nextInRound(pair, "b", 3, counts({ a: 3, b: 2 })), { next: null, rest: true, groupDone: true }, "group done");
  assert.deepEqual(nextInRound(pair, "a", 4, counts({ a: 3, b: 3 })), { next: null, rest: true, groupDone: false }, "an extra set rests and stays");
  assert.deepEqual(nextInRound(pair, "c", 1, counts({})), { next: null, rest: true, groupDone: false }, "not in a superset");
  // Logged out of order: A2 first, then A1 ends the round
  assert.deepEqual(nextInRound(pair, "a", 1, counts({ b: 1 })), { next: "a", rest: true, groupDone: false });

  // 3 sets and 4: round 4 is B alone, resting after each
  const uneven = [ex("a", 3, 1, 2), ex("b", 4, 2, 2)];
  assert.deepEqual(nextInRound(uneven, "a", 3, counts({ a: 2, b: 2 })), { next: "b", rest: false, groupDone: false });
  assert.deepEqual(nextInRound(uneven, "b", 3, counts({ a: 3, b: 2 })), { next: "b", rest: true, groupDone: false });
  assert.deepEqual(nextInRound(uneven, "b", 4, counts({ a: 3, b: 3 })), { next: null, rest: true, groupDone: true });

  // A group of three: A1 → A2 → A3, then rest and back to A1
  const three = [ex("a", 3, 1, 3), ex("b", 3, 2, 3), ex("c", 3, 3, 3)];
  assert.deepEqual(nextInRound(three, "a", 2, counts({ a: 1, b: 1, c: 1 })), { next: "b", rest: false, groupDone: false });
  assert.deepEqual(nextInRound(three, "b", 2, counts({ a: 2, b: 1, c: 1 })), { next: "c", rest: false, groupDone: false });
  assert.deepEqual(nextInRound(three, "c", 2, counts({ a: 2, b: 2, c: 1 })), { next: "a", rest: true, groupDone: false });
});

test("supersets: light weeks and completion, every profile", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const plan = generatePlan(p);
    const wk = plan.find((w) => w.phase === "build" && !w.cutback)!;
    const [first] = liftBlocks(wk.days[0]);
    const day = weekForDate(applySupersets(plan, [{ planDate: at(wk, 0), key: keyAt(first, 0) }]), wk.start)!.days[0];
    const list = dayExercises(day);
    const all = list.flatMap((x) => logSets(day.date, x.key, x.sets));
    // Grouping changes the order of logging, never how much the day asks for
    for (const sets of [[], all.slice(1), all, [...all, ...logSets(day.date, "burpee", 2)]]) assert.deepEqual(completion(day, sets), completion(wk.days[0], sets), name);

    const cut = plan.find((w) => w.cutback && w.days.some((d) => liftBlocks(d).length));
    if (!cut) continue;
    const cd = cut.days.find((d) => liftBlocks(d).length)!;
    const cb = liftBlocks(cd)[0];
    const light = weekForDate(applySupersets(plan, [{ planDate: cb.planDate!, key: keyAt(cb, 0) }]), cut.start)!.days.find((d) => d.date === cd.date)!;
    const [a, b] = dayExercises(light);
    assert.deepEqual([a.sets, b.sets, a.group?.letter, b.group?.letter], [2, 2, "A", "A"], `${name}: light week`);
    const count = (m: Record<string, number>) => (k: string) => m[k] ?? 0;
    assert.deepEqual(nextInRound([a, b], b.id, 2, count({ [a.key]: 2, [b.key]: 1 })), { next: null, rest: true, groupDone: true }, name);
  }
});

test("hold timer: one hold, or both sides with a switch; logs one side's time", () => {
  assert.deepEqual(holdPhases(30, false).map((p) => p.sec), [30]);
  const both = holdPhases(30, true);
  assert.deepEqual(both.map((p) => [p.sec, p.hold]), [[30, true], [SWITCH_SEC, false], [30, true]]);
  assert.equal(heldSeconds(holdPhases(30, false), 0, 30), 30);
  assert.equal(heldSeconds(holdPhases(30, false), 0, 12.4), 12, "stopped early");
  assert.equal(heldSeconds(both, 0, 20), 20, "stopped on the first side");
  assert.equal(heldSeconds(both, 1, 2), 30, "stopped while switching: the first side counts");
  assert.equal(heldSeconds(both, 2, 0), 30, "second side not started");
  assert.equal(heldSeconds(both, 2, 18), 18, "the shorter side");
  assert.equal(heldSeconds(both, 2, 30), 30);
});

test("weighted holds: optional weight never turns seconds into a weight lift", () => {
  const hold = (date: string, kg: number | null, sec: number): SetLike => ({ date, exercise_key: "plank", set_no: 1, weight: kg, unit: "kg", weight_kg: kg, reps: null, duration_sec: sec, light_week: false });
  const s = sessions([hold("2026-11-02", null, 40), hold("2026-11-09", 10, 45)], "plank");
  assert.equal(s[0].topKg, null, "weight without reps isn't a working set");
  assert.equal(s[0].best, 45);
  assert.equal(compareSession(s, "2026-11-09"), null);
  assert.equal(bestOn(s, "2026-11-09"), "reps", "longest hold yet");
  assert.equal(bestOn(sessions([hold("2026-11-02", null, 50), hold("2026-11-09", 20, 45)], "plank"), "2026-11-09"), null);
  // A weighted bodyweight move (dip belt) still compares by weight
  const dip = (date: string, kg: number, reps: number): SetLike => ({ date, exercise_key: "pull-up", set_no: 1, weight: kg, unit: "kg", weight_kg: kg, reps, duration_sec: null, light_week: false });
  assert.equal(bestOn(sessions([dip("2026-11-02", 5, 6), dip("2026-11-09", 7.5, 6)], "pull-up"), "2026-11-09"), "weight");
});

/* ---------- accountability (Score tab) ---------- */

interface LogOpts {
  /** Weight for a key on a date (default 20 kg) */
  kg?: (key: string, date: string) => number;
  /** Extra sets on every logged line */
  extra?: number;
  /** Only log these dates */
  only?: (date: string) => boolean;
}

/** Logs every planned day between `from` and `to` exactly as shown: target sets, runs at plan length, walks. */
function logPlan(weeks: Week[], from: string, to: string, o: LogOpts = {}): { sets: AcctSet[]; logs: AcctLog[] } {
  const sets: AcctSet[] = [];
  const logs: AcctLog[] = [];
  for (const d of weeks.flatMap((w) => w.days)) {
    if (d.date < from || d.date > to || d.skipped || !d.blocks.length || (o.only && !o.only(d.date))) continue;
    const n = new Map<string, number>();
    for (const b of d.blocks) {
      if (b.kind === "run" || b.kind === "test") {
        const min = isHard(b) ? 45 : Number(/(\d+) min/.exec(b.title)?.[1] ?? 40);
        logs.push({ date: d.date, kind: b.kind, km: b.kind === "test" ? 5 : b.km ?? null, duration_sec: min * 60, pain: {} });
      } else if (b.kind === "walk" || b.kind === "gate") logs.push({ date: d.date, kind: "walk", km: null, duration_sec: 1800, pain: {} });
      else
        b.items.forEach((_, i) => {
          const key = itemKey(b, i);
          const t = b.swaps?.[i]?.target ?? parseLine(b.items[i])?.target;
          if (!key || !t) return;
          const count = (b.light || b.foldedFrom ? Math.min(t.sets, 2) : t.sets) + (o.extra ?? 0);
          for (let k = 0; k < count; k++) {
            const setNo = (n.get(key) ?? 0) + 1;
            n.set(key, setNo);
            const kg = o.kg?.(key, d.date) ?? 20;
            sets.push({ date: d.date, exercise_key: key, set_no: setNo, weight: t.sec ? null : kg, unit: "kg", weight_kg: t.sec ? null : kg, reps: t.sec ? null : 10, duration_sec: t.sec, light_week: !!b.light });
          }
        });
    }
    if (d.blocks.some((b) => ["legs", "upper", "abs", "mobility"].includes(b.kind))) logs.push({ date: d.date, kind: "strength", km: null, duration_sec: null, pain: {}, auto: n.size > 0 });
  }
  return { sets, logs };
}

type History = { sets: AcctSet[]; logs: AcctLog[] };
const acct = (weeks: Week[], today: string, data: History, more: Partial<AccountabilityInput> = {}) => accountability({ weeks, today, ...data, ...more });
const merge = (a: History, b: History): History => ({ sets: [...a.sets, ...b.sets], logs: [...a.logs, ...b.logs] });
/** Adherence by the spec's formula, for checking the engine against hand-worked numbers */
const weightedA = (days: { date: string; u: number; c: number }[], today: string) => {
  const w = (d: string) => 0.5 ** (daysBetween(d, today) / 14);
  return Math.round((1000 * days.reduce((s, d) => s + w(d.date) * d.c, 0)) / days.reduce((s, d) => s + w(d.date) * d.u, 0)) / 10;
};
const dayOf = (weeks: Week[], date: string) => weeks.flatMap((w) => w.days).find((d) => d.date === date)!;
const check = (date: string, knee: number): AcctLog => ({ date, kind: "check", km: null, duration_sec: null, pain: { knee } });
const shift = (p: PlanSettings, days: number): PlanSettings => ({
  ...p,
  startDate: addDays(p.startDate, days),
  recoveryStart: p.recoveryStart ? addDays(p.recoveryStart, days) : p.recoveryStart,
  timeTrialDate: addDays(p.timeTrialDate, days),
  raceDate: p.raceDate ? addDays(p.raceDate, days) : p.raceDate,
});

test("accountability: everything logged scores 100 in every profile and week type", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const weeks = generatePlan(p);
    const all = logPlan(weeks, weeks[0].start, weeks.at(-1)!.days.at(-1)!.date);
    const kinds = new Set<string>();
    for (const w of weeks.slice(1)) {
      // Mid-week and the Monday after, so each week type is the newest in the window once
      for (const today of [addDays(w.start, 3), addDays(w.start, 7)]) {
        const r = acct(weeks, today, all);
        assert.equal(r.score, 100, `${name} ${w.label} (${w.phase}${w.cutback ? ", cutback" : ""}) on ${today}: ${JSON.stringify(r.parts)}`);
      }
      kinds.add(w.cutback ? "cutback" : w.phase);
    }
    assert.ok(kinds.size >= 5, `${name}: ${[...kinds]}`);
  }
  const weeks = generatePlan(PROFILES.september);
  const r = acct(weeks, "2027-07-14", logPlan(weeks, weeks[0].start, "2027-07-13"));
  assert.equal(r.band, "locked");
  assert.equal(r.weeks.length, 6);
  assert.ok(r.weeks[1].days.every((c) => c.glyph === "done" || c.glyph === "rest"));
  assert.ok(r.streak >= 6, String(r.streak));
});

test("accountability: cutback weeks ask for 2 sets, and a third isn't extra", () => {
  const weeks = generatePlan(PROFILES.september);
  const cut = weeks.find((w) => w.cutback && w.phase === "build")!;
  const before = logPlan(weeks, weeks[0].start, addDays(cut.start, -1));
  const today = addDays(cut.start, 7);
  assert.equal(acct(weeks, today, merge(before, logPlan(weeks, cut.start, addDays(cut.start, 6)))).score, 100);
  const r = acct(weeks, today, merge(before, logPlan(weeks, cut.start, addDays(cut.start, 6), { extra: 1 })), { horizon: cut.start });
  assert.equal(r.parts.e, 0);
  assert.equal(r.score, 100);
  assert.ok(r.feed.some((f) => f.kind === "set_extra" && f.delta === "not counted"));
});

test("accountability: a swapped exercise scores like the template one", () => {
  const plain = generatePlan(PROFILES.september);
  const mon = "2027-05-31";
  const from = parseLine(dayOf(plain, mon).blocks[0].items[0])!.exercise.key;
  const swapped = applySwaps(plain, [{ planDate: mon, from, to: "goblet-squat" }], (k) => (k === "goblet-squat" ? { name: "Goblet squat", load: "weight" } : undefined));
  const today = "2027-06-02";
  const a = acct(plain, today, logPlan(plain, plain[0].start, "2027-06-01"));
  const b = acct(swapped, today, logPlan(swapped, plain[0].start, "2027-06-01"));
  assert.ok(logPlan(swapped, mon, mon).sets.some((s) => s.exercise_key === "goblet-squat"));
  assert.equal(b.score, a.score);
  assert.equal(b.parts.a, 100);
  assert.ok(b.feed.some((f) => f.kind === "swapped" && f.date === mon));
});

test("accountability: a moved day logged where it was moved to scores 100", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const w = generatePlan(p).find((x) => x.phase === "base")!;
    const moves = moveDay(w, addDays(w.start, 1), addDays(w.start, 3));
    assert.ok(moves, name);
    const weeks = generatePlan(p, { moves: moves! });
    const today = addDays(w.start, 7);
    const r = acct(weeks, today, logPlan(weeks, weeks[0].start, addDays(today, -1)));
    assert.equal(r.score, 100, name);
    assert.ok(r.weeks[1].days.some((c) => c.glyph === "moved"), name);
  }
});

test("accountability: skipped days count half, carry work counts where it was folded", () => {
  const ws = "2027-05-10"; // september's base week 2
  const thu = addDays(ws, 3);
  const weeks = generatePlan(PROFILES.september, { skips: [thu] });
  assert.ok(dayOf(weeks, ws).blocks.some((b) => b.foldedFrom === "Thu"));
  const today = addDays(ws, 4);
  const data = logPlan(weeks, ws, addDays(today, -1));
  // Skipped ahead of time: the folded block (2 sets each) counts on Monday, the rest of Thursday counts half
  const early = acct(weeks, today, data, { horizon: ws, skips: [{ date: thu, createdAt: `${ws}T08:00:00Z` }] });
  const days = (monU: number, thuU: number) => [
    { date: ws, u: monU, c: monU },
    { date: addDays(ws, 1), u: 20, c: 20 },
    { date: addDays(ws, 2), u: 44, c: 44 },
    { date: thu, u: thuU, c: 0 },
  ];
  assert.equal(early.parts.a, weightedA(days(36 + 8, 0.5 * (15 + 9)), today));
  assert.ok(early.feed.some((f) => f.kind === "skipped" && f.delta === "half credit"));
  // Skipped after Monday had passed: Monday couldn't have done it, so all of Thursday counts half
  const late = acct(weeks, today, data, { horizon: ws, skips: [{ date: thu, createdAt: `${today}T08:00:00Z` }] });
  assert.equal(late.parts.a, weightedA(days(36, 18), today));
  assert.ok(late.feed.some((f) => f.kind === "skipped_late"));
});

test("accountability: a skipped run costs half, an unlogged one all of it", () => {
  const ws = "2027-05-17"; // september's base week 3 (5K test on Wednesday)
  const tue = addDays(ws, 1);
  const today = addDays(ws, 7);
  const days = (tueU: number) => [
    { date: ws, u: 36, c: 36 },
    { date: tue, u: tueU, c: 0 },
    { date: addDays(ws, 2), u: 30 + 24, c: 30 + 24 },
    { date: addDays(ws, 3), u: 36, c: 36 },
    { date: addDays(ws, 4), u: 30, c: 30 },
  ];
  const skipped = generatePlan(PROFILES.september, { skips: [tue] });
  const s = acct(skipped, today, logPlan(skipped, ws, addDays(today, -1)), { horizon: ws });
  assert.equal(s.parts.a, weightedA(days(10), today));
  const plain = generatePlan(PROFILES.september);
  const u = acct(plain, today, logPlan(plain, ws, addDays(today, -1), { only: (d) => d !== tue }), { horizon: ws });
  assert.equal(u.parts.a, weightedA(days(20), today));
  assert.ok(u.parts.a < s.parts.a);
  assert.ok(u.feed.some((f) => f.kind === "missed" && f.date === tue));
});

test("accountability: yesterday gets a grace day, today only adds", () => {
  const weeks = generatePlan(PROFILES.september);
  const today = "2027-06-03"; // Thu
  const full = logPlan(weeks, weeks[0].start, addDays(today, -2));
  const r = acct(weeks, today, full);
  assert.equal(r.score, 100);
  assert.ok(r.feed.some((f) => f.kind === "grace" && f.date === addDays(today, -1)));
  assert.equal(r.weeks[0].days[2].glyph, "grace");
  assert.equal(r.weeks[0].days[3].glyph, "today");
  assert.ok(acct(weeks, addDays(today, 1), full).parts.a < 100, "two days ago unlogged counts");
  const part = logPlan(weeks, today, today);
  assert.equal(acct(weeks, today, { sets: [...full.sets, ...part.sets.slice(0, 4)], logs: [...full.logs, ...part.logs] }).score, 100, "part of today never lowers it");
});

test("accountability: runs get full credit from 90% of the plan", () => {
  const easy = { kind: "run" as const, title: "Easy 30 min", items: [] };
  const run = (min: number): AcctLog => ({ date: "2027-01-01", kind: "run", km: null, duration_sec: min * 60, pain: {} });
  assert.equal(runCredit(easy, 20, [run(27)]).c, 20);
  assert.equal(runCredit(easy, 20, [run(24)]).c, 16);
  assert.equal(runCredit({ ...easy, title: "Long run 8 km", km: 8 }, 30, [{ ...run(50), km: 6 }]).c, 22.5);
  assert.equal(runCredit({ ...easy, title: "Tempo 3 × 6 min" }, 20, [run(12)]).c, 20, "intervals: any run of 10 min+");
  assert.equal(runCredit(easy, 20, []).c, 0);
});

test("accountability: extras only count in kept weeks when the plan isn't easing off", () => {
  const weeks = generatePlan(PROFILES.september);
  const ws = "2027-05-31"; // build
  const today = addDays(ws, 7);
  const lots = acct(weeks, today, logPlan(weeks, weeks[0].start, addDays(today, -1), { extra: 3 }));
  assert.equal(lots.parts.e, 8, "capped at +8");
  assert.equal(lots.score, 100);
  const low = acct(weeks, today, logPlan(weeks, ws, addDays(today, -1), { extra: 2, only: (d) => d !== addDays(ws, 2) && d !== addDays(ws, 3) }), { horizon: ws });
  assert.ok(low.weeks[1].pct! < 80);
  assert.equal(low.parts.e, 0, "under 80%");
  assert.ok(low.feed.some((f) => f.detail === "Counts once the week is at 80%"));
  const sore = logPlan(weeks, ws, addDays(today, -1), { extra: 2 });
  for (const d of [-1, 1, 3, 5]) sore.logs.push(check(addDays(ws, d), 3));
  const pained = acct(weeks, today, sore, { horizon: ws });
  assert.equal(pained.parts.e, 0, "pain");
  assert.ok(pained.feed.some((f) => f.detail === "Extra logged. Plan says ease off"));
  const iw = generatePlan(PROFILES.shortInjury);
  const ret = iw.find((w) => w.phase === "return")!;
  const r = acct(iw, addDays(ret.start, 7), logPlan(iw, iw[0].start, addDays(ret.start, 6), { extra: 2 }), { horizon: ret.start });
  assert.equal(r.parts.e, 0, "run-walk weeks");
  assert.equal(r.score, 100);
});

test("accountability: bests add up to +3, drops take up to −2", () => {
  const weeks = generatePlan(PROFILES.september);
  const mon = "2027-06-14"; // build
  const today = addDays(mon, 2);
  const keys = dayOf(weeks, mon).blocks.flatMap((b) => b.items.flatMap((l) => (parseLine(l)?.target.sec ? [] : parseLine(l)?.exercise.key ?? [])));
  assert.ok(keys.length >= 10);
  const run = (n: number, kg: number) => acct(weeks, today, logPlan(weeks, weeks[0].start, addDays(today, -1), { kg: (k, d) => (d === mon && keys.slice(0, n).includes(k) ? kg : 20) }));
  assert.equal(run(5, 25).parts.p, 2.5);
  assert.equal(run(10, 25).parts.p, 3);
  assert.equal(run(1, 25).feed.find((f) => f.kind === "weight_up")?.delta, "+5 kg");
  const dropped = run(5, 18);
  assert.equal(dropped.parts.d, 2);
  assert.equal(dropped.score, 98);
  assert.ok(dropped.feed.some((f) => f.kind === "weight_down" && f.tone === "bad"));
  // Lighter in a cutback week, or with pain logged: not a drop
  const cut = weeks.find((w) => w.cutback && w.phase === "build")!;
  const light = acct(weeks, addDays(cut.start, 2), logPlan(weeks, weeks[0].start, addDays(cut.start, 1), { kg: (_, d) => (d === cut.start ? 15 : 20) }));
  assert.equal(light.parts.d, 0);
  const sore = logPlan(weeks, weeks[0].start, addDays(today, -1), { kg: (k, d) => (d === mon && keys.slice(0, 5).includes(k) ? 18 : 20) });
  sore.logs.push(check(addDays(mon, -1), 3));
  assert.equal(acct(weeks, today, sore).parts.d, 0);
  // The same weight week after week (stalled) is full marks
  assert.equal(acct(weeks, today, logPlan(weeks, weeks[0].start, addDays(today, -1))).score, 100);
});

test("accountability: no number until 3 planned days have passed", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const weeks = generatePlan(p);
    const start = weeks[0].start;
    assert.equal(acct(weeks, addDays(start, -3), { sets: [], logs: [] }).status, "not_started", name);
    const early = acct(weeks, addDays(start, 2), logPlan(weeks, start, addDays(start, 1)));
    assert.equal(early.score, null, name);
    assert.equal(early.status, "building", name);
    assert.equal(acct(weeks, addDays(start, 4), logPlan(weeks, start, addDays(start, 3))).score, 100, name);
  }
});

test("accountability: the worked example scores 78", () => {
  const p = PROFILES.september;
  const w1 = "2027-05-31"; // build week, then another
  const w2 = addDays(w1, 7);
  const today = addDays(w2, 2);
  const tue1 = addDays(w1, 1);
  const lift = (date: string, key: string, n: number): AcctSet => ({ date, exercise_key: key, set_no: n, weight: 20, unit: "kg", weight_kg: 20, reps: 10, duration_sec: null, light_week: false });
  const fixture = (weeks: Week[]) => {
    const kg = (k: string, d: string) => (d === w2 && k === "bulgarian-split-squat" ? 25 : d === w2 && k === "rdl" ? 18.6 : 20);
    // W1 Mon: everything plus 3 extra curl sets
    const out = logPlan(weeks, w1, w1, { kg });
    out.sets.push(lift(w1, "curl", 4), lift(w1, "curl", 5), lift(w1, "curl", 6));
    // W1 Wed: the run and 14 of 24 sets
    const wed = logPlan(weeks, addDays(w1, 2), addDays(w1, 2));
    out.logs.push(...wed.logs);
    out.sets.push(...wed.sets.slice(0, 14));
    // W1 Fri: 95% of the long run
    out.logs.push({ date: addDays(w1, 4), kind: "run", km: dayOf(weeks, addDays(w1, 4)).blocks[0].km! * 0.95, duration_sec: 3600, pain: {} });
    // W2 Mon: 33 of 36 sets (the last abs line left out), split squat heavier, RDL 7% lighter
    const lastAbs = parseLine(dayOf(weeks, w2).blocks[2].items.at(-1)!)!.exercise.key;
    const mon2 = logPlan(weeks, w2, w2, { kg });
    out.sets.push(...mon2.sets.filter((s) => s.exercise_key !== lastAbs));
    out.logs.push(...mon2.logs);
    // W2 Tue: the run and 3 sets that weren't planned
    out.logs.push(...logPlan(weeks, addDays(w2, 1), addDays(w2, 1)).logs);
    out.sets.push(lift(addDays(w2, 1), "sl-calf-raise", 1), lift(addDays(w2, 1), "sl-calf-raise", 2), lift(addDays(w2, 1), "sl-calf-raise", 3));
    // W2 Wed (today): the run and 9 sets so far
    const wed2 = logPlan(weeks, today, today);
    out.logs.push(...wed2.logs);
    out.sets.push(...wed2.sets.slice(0, 9));
    return out;
  };
  const weeks = generatePlan(p, { skips: [tue1] });
  const r = acct(weeks, today, fixture(weeks), { horizon: w1, skips: [{ date: tue1, createdAt: `${w1}T07:00:00Z` }] });
  assert.equal(r.parts.a, 77.4);
  assert.equal(r.parts.e, 0.7); // 0.745
  assert.equal(r.parts.p, 0.5);
  assert.equal(r.parts.d, 0.5);
  assert.equal(r.score, 78);
  assert.equal(r.band, "steady");
  assert.equal(r.weeks[1].pct, 64);
  assert.equal(r.weeks[0].pct, 96);
  assert.deepEqual(r.weeks[1].days.map((c) => c.glyph), ["done", "skipped", "partial", "missed", "done", "rest", "rest"]);
  assert.ok(r.feed.some((f) => f.kind === "set_extra" && f.key === "curl" && f.delta === "not counted"), "W1 is under 80%");
  assert.ok(r.feed.some((f) => f.kind === "exercise_extra" && f.delta === "+3 sets"));
  assert.ok(r.feed.some((f) => f.kind === "weight_down" && f.key === "rdl"));
  assert.ok(r.feed.some((f) => f.kind === "weight_same" && f.tone === "good"));
  // Thursday skipped (after Monday had passed) instead of left unlogged
  const thu = addDays(w1, 3);
  const both = generatePlan(p, { skips: [tue1, thu] });
  const r2 = acct(both, today, fixture(both), { horizon: w1, skips: [{ date: tue1, createdAt: `${w1}T07:00:00Z` }, { date: thu, createdAt: `${thu}T21:00:00Z` }] });
  assert.equal(r2.parts.a, 83.2);
});

test("accountability: the same history scores the same from any profile's start", () => {
  for (const [name, p] of Object.entries(PROFILES)) {
    const scores = [0, 7 * 9, 7 * 52].map((off) => {
      const weeks = generatePlan(shift(p, off));
      const start = weeks[0].start;
      const today = addDays(start, 26);
      return acct(weeks, today, logPlan(weeks, start, addDays(today, -1), { only: (d) => ![0, 7, 14].includes(daysBetween(start, d)) })).score;
    });
    assert.ok(scores[0] != null && scores[0] < 100, `${name}: ${scores}`);
    assert.equal(new Set(scores).size, 1, `${name}: ${scores}`);
  }
});
