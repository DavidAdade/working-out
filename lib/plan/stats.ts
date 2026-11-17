// Numbers behind the Stats tab: things that only move when the person gets fitter or stronger,
// never just because more was logged.

import { addDays, mondayOf, type ISODate } from "./dates.ts";
import { predict } from "./format.ts";
import { bestOn, sessions, type Session, type SetLike } from "./progress.ts";

/**
 * One number for a session's top set: weight and reps together (Epley estimate, reps capped at 12),
 * so 20 kg × 8 → 20 kg × 12 counts as stronger. Bodyweight and timed work use the best reps or seconds.
 */
export const strengthValue = (s: Session): number | null => (s.topKg != null ? s.topKg * (1 + Math.min(s.topReps ?? 1, 12) / 30) : s.best);

/** Every Monday from the week of `from` to the week of `to` */
export function mondaysBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let w = mondayOf(from); w <= mondayOf(to); w = addDays(w, 7)) out.push(w);
  return out;
}

/** A full session's value per exercise, oldest first. Light (deload) sessions never count. */
export function strengthSeries(all: Session[]): { date: ISODate; value: number }[] {
  const full = all.filter((s) => !s.light);
  // An exercise that is ever loaded is compared on its loaded sessions only
  const weighted = full.some((s) => s.topKg != null);
  return full
    .filter((s) => (weighted ? s.topKg != null : s.best != null))
    .map((s) => ({ date: s.date, value: strengthValue(s)! }))
    .reverse();
}

/** An exercise stops counting toward the index this long after its last full session */
export const INDEX_ACTIVE_WEEKS = 6;

/**
 * Overall strength by week, 100 = the first week with a full session. Each week moves the index by the
 * average change of every exercise done that week against that exercise's own last session, spread over
 * the exercises in use. So a new or swapped-in exercise starts level instead of jolting the line, a week
 * with more sessions doesn't count for more, and a one-off jump is clamped to 0.5×–2×.
 * Weeks without a full session (deloads, time off) are absent.
 */
export function strengthIndex(sets: SetLike[], keys: Iterable<string>): Map<ISODate, number> {
  const byWeek = new Map<ISODate, Map<string, number>>();
  for (const key of keys) {
    for (const p of strengthSeries(sessions(sets, key))) {
      const w = mondayOf(p.date);
      const m = byWeek.get(w) ?? new Map<string, number>();
      byWeek.set(w, m);
      m.set(key, Math.max(m.get(key) ?? 0, p.value));
    }
  }
  const out = new Map<ISODate, number>();
  const last = new Map<string, { v: number; week: ISODate }>();
  let index = 100;
  for (const w of [...byWeek.keys()].sort()) {
    const cur = byWeek.get(w)!;
    let sum = 0;
    for (const [k, v] of cur) {
      const p = last.get(k);
      if (p) sum += Math.log(Math.min(2, Math.max(0.5, v / p.v)));
    }
    for (const [k, v] of cur) last.set(k, { v, week: w });
    const cutoff = addDays(w, -7 * INDEX_ACTIVE_WEEKS);
    const active = [...last.values()].filter((p) => p.week >= cutoff).length;
    index *= Math.exp(sum / active);
    out.set(w, index);
  }
  return out;
}

export interface RunLike {
  date: ISODate;
  kind: string;
  km: number | null;
  duration_sec: number | null;
}

/** A test as a 5K time: 5 km as run, 10 km converted. Null for anything else. */
export function fiveKEquivalent(l: RunLike): number | null {
  if (l.kind !== "test" || !l.km || !l.duration_sec) return null;
  if (Math.abs(l.km - 5) <= 0.3) return Math.round((l.duration_sec * 5) / l.km);
  if (Math.abs(l.km - 10) <= 0.5) return Math.round(predict(l.duration_sec, l.km, 5));
  return null;
}

/**
 * New bests per week: a lift's heaviest top set or most reps at that weight, the longest run yet, a
 * fastest 5K. First sessions and light weeks never count, so this is a rate of improvement, not of work.
 */
export function bestsByWeek(sets: SetLike[], logs: RunLike[]): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  const add = (d: ISODate) => out.set(mondayOf(d), (out.get(mondayOf(d)) ?? 0) + 1);
  for (const key of new Set(sets.map((s) => s.exercise_key))) {
    const all = sessions(sets, key);
    for (const s of all) if (!s.light && bestOn(all, s.date)) add(s.date);
  }
  const asc = [...logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let longest: number | null = null;
  let fastest: number | null = null;
  for (const l of asc) {
    if ((l.kind === "run" || l.kind === "test") && l.km) {
      if (longest != null && l.km > longest) add(l.date);
      longest = Math.max(longest ?? 0, l.km);
    }
    const five = fiveKEquivalent(l);
    if (five != null) {
      if (fastest != null && five < fastest) add(l.date);
      fastest = Math.min(fastest ?? Infinity, five);
    }
  }
  return out;
}

/**
 * The 5K time needed on `date` to arrive at the goal on the target day, improving evenly from the start.
 * A yardstick, not physiology: real improvement comes in steps.
 */
export function paceNeeded(o: { start: ISODate; target: ISODate; startSec: number; goalSec: number }, date: ISODate): number {
  const total = Math.max(1, (Date.parse(o.target) - Date.parse(o.start)) / 86400000);
  const t = Math.min(1, Math.max(0, (Date.parse(date) - Date.parse(o.start)) / 86400000 / total));
  return o.startSec + (o.goalSec - o.startSec) * t;
}
