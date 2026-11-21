// The shape of a person's plan: whether they run, and which weekdays they train.
//
// Run mode (profiles.run_mode, migration 0022):
//   program  the 5K program: paces, tests, a time trial, an end date (generate.ts)
//   easy     lifting plus easy runs with no goal
//   none     lifting only
// "easy" and "none" plans have no end: weeks keep coming, every fourth one a cutback (phase "steady").
//
// Training days (profiles.train_days, 0 = Monday … 6 = Sunday): 3 to 6 of them. The week's sessions are laid on
// the chosen days in order, combined when there are fewer days, so every muscle group is trained each week
// whatever the count. Null means the plan's own days.

import { ABS, LEGS, UPPER, type Block } from "./templates.ts";

export type RunMode = "program" | "easy" | "none";
export const RUN_MODES: readonly RunMode[] = ["program", "easy", "none"];
export const runMode = (v: unknown): RunMode => (RUN_MODES.includes(v as RunMode) ? (v as RunMode) : "program");

export const MODE_NAMES: Record<RunMode, string> = { program: "5K program", easy: "Lifting and easy runs", none: "Lifting only" };
/** The 5K program's settings, when the plan is one and they're all there */
export function goalOf(s: { runMode?: RunMode; timeTrialDate?: string; current5kSec?: number; goal5kSec?: number }): { timeTrialDate: string; current5kSec: number; goal5kSec: number } | null {
  return runMode(s.runMode) === "program" && s.timeTrialDate && s.current5kSec && s.goal5kSec ? { timeTrialDate: s.timeTrialDate, current5kSec: s.current5kSec, goal5kSec: s.goal5kSec } : null;
}

export const MIN_TRAIN_DAYS = 3;
export const MAX_TRAIN_DAYS = 6;
/** The 5K program has three runs a week and two leg days: it doesn't fit in three days */
export const PROGRAM_MIN_DAYS = 4;
/** The days a plan uses when the person hasn't chosen */
export const DEFAULT_DAYS: Record<RunMode, number[]> = { program: [0, 1, 2, 3, 4], easy: [0, 1, 2, 3, 4], none: [0, 1, 3, 4] };

/** Chosen weekdays, sorted and checked: null when they aren't a usable choice (so the plan's own days apply). */
export function cleanDays(x: unknown, mode: RunMode = "none"): number[] | null {
  if (!Array.isArray(x)) return null;
  const days = [...new Set(x.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return days.length >= (mode === "program" ? PROGRAM_MIN_DAYS : MIN_TRAIN_DAYS) && days.length <= MAX_TRAIN_DAYS ? days : null;
}

/** The two leg days: the pair furthest apart, counting the weekend that joins one week to the next. */
export function legDays(days: number[]): [number, number] {
  let best: [number, number] = [days[0], days[1]];
  let gap = -1;
  for (const [i, a] of days.entries())
    for (const b of days.slice(i + 1)) {
      const g = Math.min(b - a, a + 7 - b);
      if (g > gap) [best, gap] = [[a, b], g];
    }
  return best;
}

/**
 * One week of an open plan on the chosen days. Legs twice, as far apart as the days allow; the rest of the
 * week's lifting on the other days, combined when there are few. Easy runs (when the person runs) go before
 * upper-body work, and before the second leg session only when there's no other day for them.
 */
export function openWeek(days: number[], mode: "easy" | "none", easyRun: (longer: boolean) => Block): { offset: number; blocks: Block[] }[] {
  const runs = mode === "easy";
  const R = runs ? [easyRun(false)] : [];
  const n = days.length;
  // The templates' notes are written around the 5K program's runs ("Tomorrow is the long run"): here they say
  // only what holds for any week
  const note = (b: Block, text?: string): Block => {
    const { note: _note, ...rest } = b;
    return text ? { ...rest, note: text } : rest;
  };
  const strength = note(LEGS.C_gym, "Leave 2 reps in reserve.");
  const stability = note(LEGS.C_condo, "Moderate effort.");
  const push = runs ? UPPER.push : note(UPPER.push);
  const legs: Block[][] =
    n === 3
      ? [
          [strength, UPPER.pull, ABS.gym],
          [...R, stability, UPPER.backArms, ABS.condoB],
        ]
      : [[strength], [stability]];
  const other: Block[][] =
    n === 3
      ? [[...R, push, ABS.condoA]]
      : n === 4
        ? [
            [...R, UPPER.fullA, ABS.condoA],
            [...R, UPPER.fullB, ABS.condoB],
          ]
        : [
            [...R, push, ABS.condoA],
            [...R, UPPER.pull, ABS.gym],
            // With five days the third run is the longer one; with six it gets a day of its own
            n === 5 ? [...(runs ? [easyRun(true)] : []), UPPER.backArms, ABS.condoB] : [UPPER.backArms, ABS.condoB],
            ...(n === 6 ? [runs ? [easyRun(true)] : [LEGS.L_condo]] : []),
          ];
  const [l1, l2] = legDays(days);
  let li = 0;
  let oi = 0;
  return days.map((offset) => ({ offset, blocks: offset === l1 || offset === l2 ? legs[li++] : other[oi++] }));
}
