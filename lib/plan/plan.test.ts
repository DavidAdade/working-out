import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePlan, dayTitle, weekForDate, type PlanSettings } from "./generate.ts";
import { painWarnings } from "./warnings.ts";
import { parseDuration, duration, pace } from "./format.ts";
import { weekday } from "./dates.ts";
import { videoFor, VIDEOS } from "./videos.ts";
import { EXERCISES, parseLine, videoOf, videoForLine } from "./exercises.ts";
import { builtinRows, customKey, youtubeId } from "./catalog.ts";
import { MUSCLES, regionOf } from "./muscles.ts";
import { bestOn, compareSession, sessions, suggestWeight, type SetLike } from "./progress.ts";
import { fitness5k, goalPace } from "./paces.ts";
import { adaptPlan } from "./adapt.ts";
import { onTrack, wins } from "./ontrack.ts";
import { addDays } from "./dates.ts";

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

test("exercise database: every built-in has a video and muscles", () => {
  const muscleIds = new Set<string>(MUSCLES.map((m) => m.id));
  for (const e of EXERCISES) {
    assert.ok(videoOf(e), `${e.key} has no video (add \`video:\` pointing at a VIDEOS key)`);
  }
  for (const r of builtinRows()) {
    assert.match(r.key, /^[a-z0-9-]{1,40}$/);
    assert.ok(r.primary_muscles.length > 0, `${r.key} has no muscles in EXERCISE_MUSCLES`);
    for (const m of [...r.primary_muscles, ...r.secondary_muscles]) assert.ok(muscleIds.has(m), `${r.key}: unknown muscle ${m}`);
    assert.ok(r.video_ids.length > 0);
  }
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
