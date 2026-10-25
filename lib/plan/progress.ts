// Weight progression per exercise: group logged sets into sessions and compare each to the one before.

import type { ISODate } from "./dates.ts";

export interface SetLike {
  date: ISODate;
  exercise_key: string;
  set_no: number;
  weight: number | null;
  unit: "kg" | "lb";
  weight_kg: number | null;
  reps: number | null;
  duration_sec: number | null;
  light_week: boolean;
}

export interface Session<S extends SetLike = SetLike> {
  date: ISODate;
  sets: S[];
  light: boolean;
  /** Heaviest working set (kg) with at least one rep */
  topKg: number | null;
  /** Most reps done at that top weight */
  topReps: number | null;
  /** Best reps or seconds in one set, for bodyweight and timed work */
  best: number | null;
}

export function sessions<S extends SetLike>(sets: S[], key: string): Session<S>[] {
  const byDate = new Map<ISODate, S[]>();
  for (const s of sets) if (s.exercise_key === key) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, xs]) => {
      xs.sort((a, b) => a.set_no - b.set_no);
      const working = xs.filter((s) => s.weight_kg != null && s.weight_kg > 0 && (s.reps ?? 0) >= 1);
      const topKg = working.length ? Math.max(...working.map((s) => Number(s.weight_kg))) : null;
      const topReps = topKg == null ? null : Math.max(...working.filter((s) => Number(s.weight_kg) === topKg).map((s) => s.reps ?? 0));
      const best = Math.max(0, ...xs.map((s) => s.reps ?? s.duration_sec ?? 0)) || null;
      return { date, sets: xs, light: xs.some((s) => s.light_week), topKg, topReps, best };
    });
}

export interface Change {
  kind: "stalled" | "dropped";
  /** Percent change in top weight, negative when lighter */
  pct: number;
  current: Session;
  previous: Session;
}

/** Below this, a lighter session counts as a real drop rather than rounding (e.g. 20 kg → 19 kg is 5%). */
export const DROP_PCT = 5;

const notUp = (cur: Session, prev: Session) =>
  // 0.25 kg tolerance covers kg/lb rounding
  cur.topKg! <= prev.topKg! + 0.25 && (cur.topKg! < prev.topKg! - 0.25 || (cur.topReps ?? 0) <= (prev.topReps ?? 0));

/**
 * Compares the session on `date` with the last full (non-light) session before it.
 * Dropped: 5% or more lighter. Stalled: not heavier and no extra reps at the same weight, two sessions in a
 * row, so one off day doesn't cry wolf. Returns null for first sessions, light sessions, or progress.
 */
export function compareSession(all: Session[], date: ISODate): Change | null {
  const i = all.findIndex((s) => s.date === date);
  if (i < 0) return null;
  const current = all[i];
  if (current.light || current.topKg == null) return null;
  const full = all.slice(i + 1).filter((s) => !s.light && s.topKg != null);
  const previous = full[0];
  if (!previous) return null;
  const pct = ((current.topKg - previous.topKg!) / previous.topKg!) * 100;
  if (pct <= -DROP_PCT) return { kind: "dropped", pct, current, previous };
  if (notUp(current, previous) && full[1] && notUp(previous, full[1])) return { kind: "stalled", pct, current, previous };
  return null;
}

export type Best = "weight" | "reps";

/** A new best on `date`: heaviest top set ever, or more reps than ever at that weight. Null for first sessions. */
export function bestOn(all: Session[], date: ISODate): Best | null {
  const i = all.findIndex((s) => s.date === date);
  if (i < 0) return null;
  const current = all[i];
  const earlier = all.slice(i + 1);
  if (!earlier.length) return null;
  if (current.topKg != null) {
    const heaviest = Math.max(...earlier.map((s) => s.topKg ?? 0));
    if (current.topKg > heaviest + 0.25) return "weight";
    const atWeight = earlier.filter((s) => s.topKg != null && Math.abs(s.topKg - current.topKg!) <= 0.25);
    if (atWeight.length && (current.topReps ?? 0) > Math.max(...atWeight.map((s) => s.topReps ?? 0))) return "reps";
    return null;
  }
  if (current.best != null && current.best > Math.max(0, ...earlier.map((s) => s.best ?? 0))) return "reps";
  return null;
}

export const toUnit = (kg: number, unit: "kg" | "lb") => (unit === "lb" ? Math.round((kg / 0.45359237) * 2) / 2 : Math.round(kg * 4) / 4);

/**
 * Double progression: when every set of the last full session reached the top of the rep range, suggest the
 * next weight up (in the viewer's unit). Small steps for light weights, so dumbbells move 1 kg / 2.5 lb.
 */
export function suggestWeight(prev: Session | undefined, target: { sets: number; reps: number | null; repsMax: number | null }, unit: "kg" | "lb"): number | null {
  if (!prev || prev.light || prev.topKg == null || target.reps == null) return null;
  const top = target.repsMax ?? target.reps;
  if (prev.sets.length < target.sets || !prev.sets.every((s) => (s.reps ?? 0) >= top)) return null;
  const w = toUnit(prev.topKg, unit);
  return w + (unit === "kg" ? (w >= 20 ? 2.5 : 1) : w >= 45 ? 5 : 2.5);
}
