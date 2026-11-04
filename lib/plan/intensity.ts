// How hard a day's workout is, so "Swap for another day" can say whether another day's workout is a fair trade.
// One unit ≈ one easy-run minute. Runs: minutes × zone (easy 1.0, walk 0.3, threshold 1.8, 800 m–1 km and goal pace 2.2,
// 400 m 2.5), with 20 min of warm-up and cool-down on hard sessions; a km counts as 7 min, like accountability.ts.
// Lifts: each line's sets × load (weight 1, bodyweight 0.8, time 0.6) × 1.5 for compounds (3+ muscles) × 1.2 for
// "each" side, 2 sets on light or folded blocks, and the whole block × 1.5. Template lines only: swaps don't change it.

import { isHard, type Day } from "./generate.ts";
import { parseLine } from "./exercises.ts";
import { musclesFor } from "./muscles.ts";
import type { Block } from "./templates.ts";

/** A copied workout within this share of the one it replaces counts in full */
export const COPY_TOLERANCE = 0.2;

export interface Intensity {
  total: number;
  run: number;
  lift: number;
  /** Has a test or a hard session (see isHard) */
  hard: boolean;
  shape: "run" | "lift" | "mixed";
}

export interface CopyFit {
  /** Candidate total ÷ original total */
  ratio: number;
  match: boolean;
  reason: "ok" | "harder" | "easier" | "type" | "hard";
  /** Share of the day's Score credit the copy earns when done: 1 on a match, never below 0.5 */
  credit: number;
}

const MIN_PER_KM = 7;
/** Warm-up + cool-down minutes on hard sessions and tests */
const WU = 20;
const LOAD = { weight: 1, bodyweight: 0.8, time: 0.6 };
const RUNNING = new Set<Block["kind"]>(["run", "test", "walk", "gate"]);

function runLoad(b: Block): number {
  const t = b.title.toLowerCase();
  const txt = b.items.join(" ").toLowerCase();
  if (b.kind === "walk" || b.kind === "gate") return 30 * 0.3;
  // Long runs, with the half block's last 2 km at half pace
  if (b.km) return b.km * MIN_PER_KM + (/half pace/.test(txt) ? 2 * MIN_PER_KM * 0.6 : 0);
  if (b.kind === "test") {
    const km = /10k/.test(t) ? 10 : /5k/.test(t) ? 5 : 21.1;
    return WU + km * 6 * 2.5;
  }
  const rw = /^run-walk (\d+)/.exec(t);
  if (rw) {
    const m = /^(\d+) min easy run \/ (\d+) min walk/.exec(b.items[0] ?? "");
    const f = m ? +m[1] / (+m[1] + +m[2]) : 1;
    return +rw[1] * (f + (1 - f) * 0.3);
  }
  const strides = /strides/.test(t + txt) ? 2 : 0;
  if (!isHard(b)) return Number(/(\d+) min/.exec(t)?.[1] ?? 20) + strides;
  // Hard: work minutes × zone, a rep km taking about 5 min
  let work = 0;
  let zone = 1.8;
  let m: RegExpExecArray | null;
  if ((m = /(\d+) × (\d+) m\b/.exec(txt))) {
    work = (+m[1] * +m[2] * 5) / 1000;
    zone = +m[2] <= 400 ? 2.5 : 2.2;
  } else if ((m = /(\d+) × ([\d.]+) km/.exec(txt))) {
    work = +m[1] * +m[2] * 5;
    zone = /half/.test(t) ? 1.8 : 2.2;
  } else if ((m = /(\d+) × (\d+) min/.exec(txt))) work = +m[1] * +m[2];
  else if ((m = /(\d+) min steady/.exec(txt))) work = +m[1];
  return WU + work * zone + strides;
}

function liftLoad(b: Block): number {
  let s = 0;
  for (const line of b.items) {
    if (/^optional/i.test(line.trim())) continue;
    const p = parseLine(line);
    if (!p) {
      s += /mobility/i.test(line) ? 3 : /half the usual/i.test(line) ? 9 : 0;
      continue;
    }
    const sets = b.light || b.foldedFrom ? Math.min(2, p.target.sets) : p.target.sets;
    const mu = musclesFor(p.exercise.key);
    const compound = mu && mu.primary.length + mu.secondary.length >= 3 ? 1.5 : 1;
    s += sets * LOAD[p.exercise.load] * compound * (p.target.each ? 1.2 : 1);
  }
  return s * 1.5;
}

export function dayIntensity(day: Pick<Day, "blocks">): Intensity {
  let run = 0;
  let lift = 0;
  for (const b of day.blocks) {
    if (RUNNING.has(b.kind)) run += runLoad(b);
    else lift += liftLoad(b);
  }
  const total = run + lift;
  const share = total > 0 ? run / total : 0;
  return {
    total: Math.round(total),
    run: Math.round(run),
    lift: Math.round(lift),
    hard: day.blocks.some(isHard),
    shape: share >= 0.7 ? "run" : share <= 0.3 ? "lift" : "mixed",
  };
}

/** `cand` done in place of `orig`: a match is the same kind of day, the same hard-or-easy, and within COPY_TOLERANCE. */
export function compareDays(orig: Intensity, cand: Intensity): CopyFit {
  const ratio = orig.total > 0 ? cand.total / orig.total : cand.total > 0 ? 2 : 1;
  const reason: CopyFit["reason"] =
    orig.shape !== cand.shape ? "type" : orig.hard !== cand.hard ? "hard" : ratio > 1 + COPY_TOLERANCE ? "harder" : ratio < 1 - COPY_TOLERANCE ? "easier" : "ok";
  const match = reason === "ok";
  const gap = reason === "type" || reason === "hard" ? 0.5 : Math.abs(ratio - 1);
  return { ratio, match, reason, credit: match ? 1 : 1 - Math.min(0.5, gap) };
}

const SHAPE = { run: "a run day", lift: "a lift day", mixed: "a run + lift day" };

/** The short badge on a candidate: "Match", "Harder +42%", "Easier −38%", "Different type", "Hard session" */
export function fitBadge(fit: CopyFit, cand: Intensity): string {
  const pct = Math.round(Math.abs(fit.ratio - 1) * 100);
  if (fit.reason === "ok") return "Match";
  if (fit.reason === "type") return "Different type";
  if (fit.reason === "hard") return cand.hard ? "Hard session" : "No hard session";
  return fit.reason === "harder" ? `Harder +${pct}%` : `Easier −${pct}%`;
}

/** Why it doesn't match and what it costs, or null on a match. */
export function fitWarning(fit: CopyFit, orig: Intensity, cand: Intensity): string | null {
  if (fit.match) return null;
  const cost = `If you do it, it counts as ${Math.round(fit.credit * 100)}% of this day in your Score.`;
  if (fit.reason === "type") return `This is ${SHAPE[cand.shape]} replacing ${SHAPE[orig.shape]}. ${cost}`;
  if (fit.reason === "hard") return `${cand.hard ? "This is a hard session replacing an easy day." : "This is an easy day replacing a hard session."} ${cost}`;
  const pct = Math.round(Math.abs(fit.ratio - 1) * 100);
  return `Intensity doesn't match: this day is ${pct}% ${fit.reason === "harder" ? "harder" : "easier"} than the one it replaces. ${cost}`;
}
