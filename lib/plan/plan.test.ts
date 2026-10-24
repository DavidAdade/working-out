import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePlan, dayTitle, weekForDate, type PlanSettings } from "./generate.ts";
import { painWarnings } from "./warnings.ts";
import { parseDuration, duration, pace } from "./format.ts";
import { weekday } from "./dates.ts";
import { videoFor, VIDEOS } from "./videos.ts";

const david: PlanSettings = {
  startDate: "2026-11-16",
  recoveryStart: "2026-10-19",
  returningFromInjury: true,
  timeTrialDate: "2027-03-26",
  raceDate: "2027-05-02",
  raceName: "Toronto Marathon: half",
  current5kSec: 35 * 60,
  goal5kSec: 30 * 60,
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
