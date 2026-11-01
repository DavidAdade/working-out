// Exercise swaps: one template exercise done as another on one plan day.
// Stored per person in `exercise_swaps` (plan_date, from_key, to_key), keyed by the date the plan put the
// workout on, so a swap follows the workout through moves and folds. Applied last, on the finished plan:
// template `items` never change, each block gets a `swaps` overlay instead, so applying twice is harmless.

import type { ISODate } from "./dates.ts";
import type { Week } from "./generate.ts";
import type { Block, ItemSwap } from "./templates.ts";
import { parseLine, type Load, type Target } from "./exercises.ts";

export interface Swap {
  /** The plan's own date for the workout (Block.planDate), not the day it's shown on after a move */
  planDate: ISODate;
  /** Always the template's exercise key, so swaps never chain */
  from: string;
  to: string;
}

/** What applySwaps needs to know about the exercise swapped in: built-in or the person's own */
export type ExerciseLookup = (key: string) => { name: string; load: Load } | undefined;

const swapId = (planDate: string, from: string) => `${planDate}|${from}`;

/** The target the new exercise carries: same sets; reps ↔ seconds convert to 30 s or 10 reps. */
export function swapTarget(t: Target, toLoad: Load): Target {
  const timed = toLoad === "time";
  if (timed === (t.sec != null)) return { ...t };
  return timed ? { sets: t.sets, reps: null, repsMax: null, sec: 30, each: false } : { sets: t.sets, reps: 10, repsMax: null, sec: null, each: false };
}

/** "Hack squat, 3×8–10", "Plank, 3×30s", "Push-ups, 3 sets" */
export function targetLine(name: string, t: Target): string {
  const amount = t.sec != null ? `×${t.sec}s` : t.reps != null ? `×${t.reps}${t.repsMax ? `–${t.repsMax}` : ""}` : " sets";
  return `${name}, ${t.sets}${amount}${t.each ? " each" : ""}`;
}

/**
 * The plan with each block's `swaps` overlay worked out from its untouched template lines.
 * A swap whose original isn't on that plan day any more (settings changed) or whose new exercise
 * is unknown (a deleted custom one) is ignored, and the template exercise shows again.
 */
export function applySwaps(weeks: Week[], swaps: Iterable<Swap>, lookup: ExerciseLookup): Week[] {
  const byId = new Map<string, string>();
  for (const s of swaps) if (s.from !== s.to) byId.set(swapId(s.planDate, s.from), s.to);
  const overlay = (b: Block): Block => {
    const { swaps: _old, ...rest } = b;
    if (!byId.size || !b.planDate) return rest;
    const out: Record<number, ItemSwap> = {};
    b.items.forEach((line, i) => {
      const p = parseLine(line);
      const to = p && byId.get(swapId(b.planDate!, p.exercise.key));
      const ex = to ? lookup(to) : undefined;
      if (!p || !to || !ex) return;
      const target = swapTarget(p.target, ex.load);
      out[i] = { from: p.exercise.key, to, name: ex.name, load: ex.load, target, line: targetLine(ex.name, target) };
    });
    return Object.keys(out).length ? { ...rest, swaps: out } : rest;
  };
  return weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map(overlay) })) }));
}

/** A block's line as shown: the swapped exercise when there is one. */
export const itemLine = (b: Block, i: number): string => b.swaps?.[i]?.line ?? b.items[i];

/** The exercise key a line logs under: the swapped-in one, else the template's (null for walks, notes, …). */
export const itemKey = (b: Block, i: number): string | null => b.swaps?.[i]?.to ?? parseLine(b.items[i])?.exercise.key ?? null;

/** Every swap in force on a list of weeks, with the day it's shown on: for the AI check-in and labels. */
export function swapsShown(weeks: Week[]): { date: ISODate; from: string; to: string; name: string }[] {
  const out = new Map<string, { date: ISODate; from: string; to: string; name: string }>();
  for (const w of weeks)
    for (const d of w.days)
      for (const b of d.blocks) for (const s of Object.values(b.swaps ?? {})) out.set(`${d.date}|${s.from}`, { date: d.date, from: s.from, to: s.to, name: s.name });
  return [...out.values()];
}

/* ---------- the swap picker: same-muscle suggestions and forgiving search ---------- */

export interface Pickable {
  key: string;
  name: string;
  load: Load;
  primary_muscles: readonly string[];
  secondary_muscles: readonly string[];
}

/** How alike two exercises are: shared main muscle 2, shared helper muscle 1, same kind of load +1. */
export function similarity(a: Pickable, b: Pickable): number {
  const aPrim = new Set(a.primary_muscles);
  const aAll = new Set([...a.primary_muscles, ...a.secondary_muscles]);
  const bPrim = new Set(b.primary_muscles);
  let score = 0;
  for (const m of new Set([...b.primary_muscles, ...b.secondary_muscles])) {
    if (aPrim.has(m) && bPrim.has(m)) score += 2;
    else if (aAll.has(m)) score += 1;
  }
  return score > 0 && a.load === b.load ? score + 1 : score;
}

const ALIASES: Record<string, string> = { db: "dumbbell", bb: "barbell", sl: "single leg", kb: "kettlebell", ohp: "overhead press", rdl: "romanian deadlift" };

/** Lowercase words with punctuation gone and gym shorthand spelled out. */
export function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => (ALIASES[w] ?? w).split(" "));
}

/** One letter added, dropped, changed, or two neighbours swapped ("bulgarain") */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff = [...a].flatMap((ch, i) => (ch === b[i] ? [] : [i]));
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const isSubsequence = (q: string, w: string) => {
  let i = 0;
  for (const ch of w) if (ch === q[i]) i++;
  return i === q.length;
};

/** One query word against a list of words: word start 3, inside a word 2, letters in order 1, one typo 1. */
function wordScore(q: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    if (w.startsWith(q)) return 3;
    if (w.includes(q)) best = Math.max(best, 2);
    else if (q.length >= 2 && isSubsequence(q, w)) best = Math.max(best, 1);
    else if (q.length >= 4 && (withinOneEdit(q, w) || (w.length > q.length && withinOneEdit(q, w.slice(0, q.length))))) best = Math.max(best, 1);
  }
  return best;
}

/** How well a query matches an exercise's name and muscles: 0 when any word doesn't match. */
export function searchScore(query: string, name: string, muscles: string[]): number {
  const qs = normalize(query);
  if (!qs.length) return 0;
  const words = normalize(`${name} ${muscles.join(" ")}`);
  let total = 0;
  for (const q of qs) {
    const s = wordScore(q, words);
    if (!s) return 0;
    total += s;
  }
  return total;
}

/**
 * The picker's list: with no query, the most similar exercises first (top `top`, then A–Z);
 * with a query, the best matches first, then similarity, then name.
 */
export function rankForSwap<T extends Pickable>(all: T[], original: Pickable, query: string, muscleName: (id: string) => string = (id) => id, top = 8): T[] {
  const sim = new Map(all.map((e) => [e.key, similarity(original, e)]));
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const others = all.filter((e) => e.key !== original.key);
  if (!normalize(query).length) {
    const ranked = others.filter((e) => sim.get(e.key)! > 0).sort((a, b) => sim.get(b.key)! - sim.get(a.key)! || byName(a, b)).slice(0, top);
    const picked = new Set(ranked.map((e) => e.key));
    return [...ranked, ...others.filter((e) => !picked.has(e.key)).sort(byName)];
  }
  const scored = others
    .map((e) => ({ e, s: searchScore(query, e.name, [...e.primary_muscles, ...e.secondary_muscles].map(muscleName)) }))
    .filter((x) => x.s > 0);
  return scored.sort((a, b) => b.s - a.s || sim.get(b.e.key)! - sim.get(a.e.key)! || byName(a.e, b.e)).map((x) => x.e);
}
