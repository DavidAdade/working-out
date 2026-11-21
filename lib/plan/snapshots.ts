// A day's workout as it was shown when it was logged (day_snapshots, migration 0021).
//
// The plan is never stored: it's rebuilt from the templates on every load. That's right for the days ahead, but
// it means editing a template (a line added, 3 sets made 4) would re-score everyone's past workouts as partly
// done. So the first set or run logged on a day saves that day's blocks, and from the next day on the plan shows
// (and the Score counts) the saved blocks instead. Days nothing was logged on keep following the live plan.
//
// Exercise swaps are not part of a snapshot: applySwaps lays them over the saved template lines afterwards, so
// a swap made later still shows. A saved line is read with parseLine like any other, which is why a line taken
// out of a template has to stay in its exercise's `lines` (see .claude/skills/add-exercise).

import type { ISODate } from "./dates.ts";
import type { Day, Week } from "./generate.ts";
import { plainTitle, type Block, type BlockKind } from "./templates.ts";

export interface DaySnapshot {
  /** The date the workout was shown on */
  planDate: ISODate;
  blocks: Block[];
}

const KINDS = new Set<BlockKind>(["run", "test", "legs", "upper", "abs", "walk", "gate", "mobility"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1000;

/** The blocks of a day as they're saved: what was shown, minus the swap overlay. */
export const snapshotOf = (d: Pick<Day, "blocks">): Block[] => d.blocks.map(({ swaps: _swaps, ...b }) => b);

/** Saved blocks checked field by field (they come from the phone, and back from the database): null when they aren't blocks. */
export function cleanBlocks(x: unknown): Block[] | null {
  if (!Array.isArray(x) || !x.length || x.length > 20) return null;
  const out: Block[] = [];
  for (const raw of x) {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as Record<string, unknown>;
    if (!KINDS.has(b.kind as BlockKind) || !str(b.title, 200) || !Array.isArray(b.items) || b.items.length > 40 || !b.items.every((i) => str(i, 300))) return null;
    // Lifting titles lose the place they once named, so an old saved day reads like the plan does now
    const lift = b.kind === "legs" || b.kind === "upper" || b.kind === "abs";
    const block: Block = { kind: b.kind as BlockKind, title: lift ? plainTitle(b.title) : b.title, items: b.items as string[] };
    if (str(b.note, 600)) block.note = b.note;
    if (num(b.km)) block.km = b.km;
    if (num(b.dist)) block.dist = b.dist;
    for (const k of ["hard", "carry", "light"] as const) if (typeof b[k] === "boolean") block[k] = b[k] as boolean;
    if (str(b.foldedFrom, 20)) block.foldedFrom = b.foldedFrom;
    if (str(b.planDate, 10) && ISO.test(b.planDate)) block.planDate = b.planDate;
    if (Array.isArray(b.supersets) && b.supersets.length <= 20 && b.supersets.every((g) => Array.isArray(g) && g.length <= 20 && g.every((i) => Number.isInteger(i) && i >= 0 && i < 40))) block.supersets = b.supersets as number[][];
    out.push(block);
  }
  return out;
}

/** The plan with every day before `today` that has a snapshot showing its saved blocks (`Day.frozen`). */
export function applySnapshots(weeks: Week[], snapshots: Iterable<DaySnapshot>, today: ISODate): Week[] {
  const saved = new Map<ISODate, Block[]>();
  for (const s of snapshots) {
    const blocks = s.planDate < today ? cleanBlocks(s.blocks) : null;
    if (blocks) saved.set(s.planDate, blocks);
  }
  if (!saved.size) return weeks;
  return weeks.map((w) => (w.days.some((d) => saved.has(d.date)) ? { ...w, days: w.days.map((d) => (saved.has(d.date) && !d.skipped ? { ...d, blocks: saved.get(d.date)!, frozen: true } : d)) } : w));
}
