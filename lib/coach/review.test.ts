import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV4 } from "ai/test";
import { generatePlan, type PlanSettings } from "../plan/generate.ts";
import { context, generateReview } from "./review.ts";
import type { LogRow } from "../types.ts";

const settings: PlanSettings = { startDate: "2027-05-03", returningFromInjury: false, timeTrialDate: "2027-09-17", current5kSec: 1980, goal5kSec: 1740 };
const today = "2027-06-14"; // a Monday in the build
const log = (date: string, extra: Partial<LogRow>): LogRow => ({
  id: date, user_id: "u", date, kind: "run", title: "Easy 30 min", km: 4, duration_sec: 1800, rpe: 4, pain: {}, notes: null, created_at: "", auto: false, source: "manual", external_id: null, avg_hr: null, ...extra,
});
const input = {
  name: "Sam",
  weeks: generatePlan(settings, { skips: ["2027-06-15"] }),
  logs: [log("2027-06-11", { pain: { knee: 3 }, notes: "Sore after hills" }), log("2027-06-13", { kind: "check", title: "Morning check-in", km: null, duration_sec: null, pain: { knee: 2 } })],
  sets: [],
  names: new Map<string, string>(),
  warnings: [],
  fitness: "33:00",
  goal: "29:00",
  today,
};

const mock = (json: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } },
      warnings: [],
    }),
  });

test("review context lists the coming week, skips and pain notes", () => {
  const c = context(input);
  assert.match(c, /2027-06-15 Tue .*SKIPPED/);
  assert.match(c, /pain knee 3/);
  assert.match(c, /Sore after hills/);
  assert.match(c, /morning check-in/);
  assert.ok(!c.includes("2027-06-21"), "only the next 7 days");
});

test("review keeps only suggestions the plan allows", async () => {
  const r = await generateReview(input, mock({
    summary: "Good week.",
    flags: [],
    suggestions: [
      { date: "2027-06-16", action: "easier", text: "Keep the 800s relaxed." },
      { date: "2027-06-15", action: "skip", text: "Already skipped." },
      { date: "2027-07-30", action: "skip", text: "Too far out." },
      { date: "2027-06-18", action: "skip", text: "Rest the knee." },
    ],
  }));
  assert.equal(r.summary, "Good week.");
  assert.deepEqual(r.suggestions.map((s) => s.date), ["2027-06-16", "2027-06-18"]);
});
