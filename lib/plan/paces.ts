// Training paces from a 5K time, and the 5K fitness implied by logged tests.
// Ratios follow Daniels-style zones relative to 5K pace, so every profile gets paces from its own result.

import { addDays, type ISODate } from "./dates.ts";
import { predict } from "./format.ts";

export interface Paces {
  /** Conversational range, sec/km */
  easy: [number, number];
  /** Comfortably hard, about one-hour race pace */
  threshold: number;
  /** 800 m – 1 km repeats */
  interval: number;
  /** 400 m repeats */
  rep: number;
}

export function trainingPaces(fiveKSec: number): Paces {
  const p = fiveKSec / 5;
  return { easy: [p * 1.2, p * 1.32], threshold: p * 1.045, interval: p * 0.975, rep: p * 0.95 };
}

/** A whole-second pace that finishes under the goal: 29:59 → 5:58/km (29:50), not 6:00 (30:00). */
export function goalPace(goal5kSec: number): number {
  return Math.floor(goal5kSec / 5) - 1;
}

export interface TestLike {
  date: ISODate;
  kind: string;
  km: number | null;
  duration_sec: number | null;
}

export interface Fitness {
  /** Estimated current 5K, seconds */
  sec: number;
  source: "settings" | "5K test" | "10K test";
  date?: ISODate;
}

/** How long a test keeps setting paces before the settings value takes over again */
export const TEST_FRESH_DAYS = 84;

/**
 * Current 5K fitness: the best 5K-equivalent from tests in the last 12 weeks, otherwise the profile's
 * current 5K. A slower test than the settings value wins too, so paces never outrun a comeback.
 */
export function fitness5k(settingsSec: number, logs: TestLike[], today: ISODate): Fitness {
  const from = addDays(today, -TEST_FRESH_DAYS);
  let best: Fitness | null = null;
  for (const l of logs) {
    if (l.kind !== "test" || !l.km || !l.duration_sec || l.date < from || l.date > today) continue;
    const est = Math.abs(l.km - 5) <= 0.3 ? (l.duration_sec * 5) / l.km : Math.abs(l.km - 10) <= 0.5 ? predict(l.duration_sec, l.km, 5) : null;
    if (est == null) continue;
    if (!best || est < best.sec) best = { sec: Math.round(est), source: Math.abs(l.km - 5) <= 0.3 ? "5K test" : "10K test", date: l.date };
  }
  return best ?? { sec: settingsSec, source: "settings" };
}
