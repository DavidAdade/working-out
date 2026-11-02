import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePlan, dayTitle, weekForDate, moveDay, catchUp, type PlanSettings, type Week } from "./generate.ts";
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
import { addDays } from "./dates.ts";
import { clampEnd, completion, dayExercises, elapsed, heldSeconds, holdPhases, isLocked, sessionDate, sessionDateFor, sessionState, SWITCH_SEC, type WorkoutSession } from "./workout.ts";

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
