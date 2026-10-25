// "Am I on track?" for any profile: a verdict built from its own plan, logs and tests.

import { addDays, daysBetween, type ISODate } from "./dates.ts";
import { duration } from "./format.ts";
import type { PlanSettings, Week } from "./generate.ts";
import type { Fitness } from "./paces.ts";
import { bestOn, sessions, type SetLike } from "./progress.ts";
import type { Warning } from "./warnings.ts";

export interface RunLogLike {
  date: ISODate;
  kind: string;
  km: number | null;
  duration_sec: number | null;
  pain: Record<string, number>;
  auto?: boolean;
}

export interface OnTrack {
  status: "good" | "hold" | "stop";
  headline: string;
  lines: string[];
  /** Predicted 5K vs where a straight line from the start to the goal says it should be today */
  predicted?: { sec: number; target: number };
}

export const STATUS_LABEL: Record<OnTrack["status"], string> = { good: "On track", hold: "Hold steady", stop: "Pause running" };

/** Share of planned days with something logged, last 4 weeks up to yesterday. Skipped days don't count against you. */
export function consistency(weeks: Week[], activeDates: Set<ISODate>, today: ISODate): { done: number; planned: number } | null {
  const from = addDays(today, -28);
  const planned = weeks.flatMap((w) => w.days).filter((d) => d.date >= from && d.date < today && !d.skipped && d.blocks.length);
  if (planned.length < 3) return null;
  return { done: planned.filter((d) => activeDates.has(d.date)).length, planned: planned.length };
}

/** Worst score per area this week vs the week before, e.g. "knee 1 ↓ from 3" */
export function painTrend(logs: RunLogLike[], areas: string[], today: ISODate): string[] {
  const worst = (from: ISODate, to: ISODate, a: string) => {
    const xs = logs.filter((l) => !l.auto && l.date > from && l.date <= to && l.pain?.[a] != null).map((l) => l.pain[a]);
    return xs.length ? Math.max(...xs) : null;
  };
  return areas.flatMap((a) => {
    const now = worst(addDays(today, -7), today, a);
    if (now == null) return [];
    const before = worst(addDays(today, -14), addDays(today, -7), a);
    const arrow = before == null || before === now ? "" : now < before ? ` ↓ from ${before}` : ` ↑ from ${before}`;
    return [`${a} ${now}/10${arrow}`];
  });
}

export function onTrack(o: {
  settings: PlanSettings;
  weeks: Week[];
  logs: RunLogLike[];
  activeDates: Set<ISODate>;
  painAreas: string[];
  warnings: Warning[];
  gatesPassed: number;
  gatesTotal: number;
  fitness: Fitness;
  today: ISODate;
}): OnTrack {
  const { settings: s, today } = o;
  const lines: string[] = [];
  let status: OnTrack["status"] = o.warnings[0]?.code === "stop" ? "stop" : o.warnings.length ? "hold" : "good";
  let headline: string;
  let predicted: OnTrack["predicted"];

  const c = consistency(o.weeks, o.activeDates, today);
  const pain = painTrend(o.logs, o.painAreas, today);
  const nextTest = o.weeks.flatMap((w) => w.days).find((d) => d.date >= today && !d.skipped && d.blocks.some((b) => b.kind === "test"));
  const ttResult = o.logs.filter((l) => l.kind === "test" && l.date >= s.timeTrialDate && l.km && Math.abs(l.km - 5) <= 0.3 && l.duration_sec).sort((a, b) => a.duration_sec! - b.duration_sec!)[0];

  if (today < s.startDate) {
    const n = daysBetween(today, s.startDate);
    headline = `Running starts in ${n} day${n === 1 ? "" : "s"}`;
    if (s.returningFromInjury) {
      lines.push(`Gates ${o.gatesPassed}/${o.gatesTotal}`);
      if (n <= 7 && o.gatesPassed < o.gatesTotal) status = status === "stop" ? "stop" : "hold";
    }
  } else if (ttResult) {
    const under = ttResult.duration_sec! <= s.goal5kSec;
    headline = under ? `Time trial ${duration(ttResult.duration_sec!)}: goal reached` : `Time trial ${duration(ttResult.duration_sec!)}`;
    if (!under) lines.push(`${duration(ttResult.duration_sec! - s.goal5kSec)} off ${duration(s.goal5kSec)}`);
  } else if (o.fitness.source !== "settings" && o.fitness.date && o.fitness.date >= s.startDate) {
    // Straight line from the starting 5K to the goal at the time trial
    const span = Math.max(1, daysBetween(s.startDate, s.timeTrialDate));
    const at = Math.min(span, Math.max(0, daysBetween(s.startDate, o.fitness.date)));
    const target = Math.round(s.current5kSec + ((s.goal5kSec - s.current5kSec) * at) / span);
    const delta = o.fitness.sec - target;
    predicted = { sec: o.fitness.sec, target };
    headline = `Predicted 5K ${duration(o.fitness.sec)}`;
    lines.push(delta <= 0 ? `${duration(-delta)} ahead of the line to ${duration(s.goal5kSec)}` : `${duration(delta)} behind the line to ${duration(s.goal5kSec)}`);
    if (delta > 30 && status === "good") status = "hold";
  } else {
    const n = daysBetween(today, s.timeTrialDate);
    headline = n >= 0 ? `${n} days to the time trial` : "Time trial done";
    if (nextTest) lines.push(`First test ${daysBetween(today, nextTest.date) === 0 ? "today" : `in ${daysBetween(today, nextTest.date)} days`} sets your prediction`);
  }

  if (c) {
    const pct = Math.round((c.done / c.planned) * 100);
    lines.push(`${c.done}/${c.planned} sessions in 4 weeks (${pct}%)`);
    if (pct < 60 && status === "good") status = "hold";
  }
  if (pain.length) lines.push(`Pain this week: ${pain.join(", ")}`);
  if (nextTest && predicted) lines.push(`Next test in ${daysBetween(today, nextTest.date)} days`);
  return { status, headline, lines, predicted };
}

export interface Win {
  date: ISODate;
  text: string;
}

/** New bests between `from` and `to`: longest run, fastest 5K, heaviest lift or most reps. */
export function wins(logs: RunLogLike[], sets: SetLike[], name: (key: string) => string, from: ISODate, to: ISODate): Win[] {
  const out: Win[] = [];
  const runs = logs.filter((l) => (l.kind === "run" || l.kind === "test") && l.km);
  for (const l of runs.filter((l) => l.date >= from && l.date <= to)) {
    const earlier = runs.filter((x) => x.date < l.date);
    if (earlier.length && l.km! > Math.max(...earlier.map((x) => x.km!))) out.push({ date: l.date, text: `Longest run yet: ${l.km} km` });
  }
  const fives = logs.filter((l) => l.kind === "test" && l.km && Math.abs(l.km - 5) <= 0.3 && l.duration_sec);
  for (const l of fives.filter((l) => l.date >= from && l.date <= to)) {
    const earlier = fives.filter((x) => x.date < l.date);
    if (earlier.length && l.duration_sec! < Math.min(...earlier.map((x) => x.duration_sec!))) out.push({ date: l.date, text: `5K best: ${duration(l.duration_sec!)}` });
  }
  const lifts: { date: ISODate; name: string; best: string }[] = [];
  for (const key of new Set(sets.filter((x) => x.date >= from && x.date <= to).map((x) => x.exercise_key))) {
    const all = sessions(sets, key);
    for (const sess of all.filter((x) => x.date >= from && x.date <= to)) {
      const b = bestOn(all, sess.date);
      if (b) lifts.push({ date: sess.date, name: name(key), best: b === "weight" ? "heaviest yet" : "most reps yet" });
    }
  }
  // A few lift bests read as their own lines; a whole week of them reads as one
  if (lifts.length <= 3) out.push(...lifts.map((l) => ({ date: l.date, text: `${l.name}: ${l.best}` })));
  else {
    const names = [...new Set(lifts.map((l) => l.name))];
    out.push({ date: lifts.map((l) => l.date).sort().at(-1)!, text: `${names.length} lifts at new bests: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}` });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
