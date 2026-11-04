// Supersets: exercises in one block done back to back, round by round (A1 set 1, A2 set 1, rest, A1 set 2…).
// Stored per person in `superset_links` (plan_date, key): a row links a template line to the next line in its
// block, keyed by the date the plan put the workout on, so a superset follows the workout through moves and
// folds. `key` is always the template's exercise key, so swapping either exercise keeps the group.
// Applied after swaps, on the finished plan: `items` never change, each block gets a `supersets` overlay instead,
// so applying twice is harmless.

import type { ISODate } from "./dates.ts";
import type { Week } from "./generate.ts";
import type { Block } from "./templates.ts";
import { parseLine } from "./exercises.ts";
import { LIFT_KINDS } from "./workout.ts";

export interface SupersetLink {
  /** The plan's own date for the workout (Block.planDate), not the day it's shown on after a move */
  planDate: ISODate;
  /** The template exercise key of the line linked to the one after it */
  key: string;
}

export const linkId = (planDate: string, key: string) => `${planDate}|${key}`;

/** Whether line `i` of a block is logged set by set (and so can be in a superset) */
export const loggable = (b: Block, i: number): boolean => LIFT_KINDS.includes(b.kind) && i >= 0 && i < b.items.length && !!parseLine(b.items[i]);

/**
 * The plan with each block's `supersets` (item index groups) worked out from the links.
 * A link whose line isn't on that plan day any more, or whose next line isn't an exercise, is ignored.
 * Runs of links join: A→B and B→C make one group of three. Groups never cross blocks.
 */
export function applySupersets(weeks: Week[], links: Iterable<SupersetLink>): Week[] {
  const ids = new Set<string>();
  for (const l of links) ids.add(linkId(l.planDate, l.key));
  const overlay = (b: Block): Block => {
    const { supersets: _old, ...rest } = b;
    if (!ids.size || !b.planDate || !LIFT_KINDS.includes(b.kind)) return rest;
    const linked = (i: number) => loggable(b, i) && loggable(b, i + 1) && ids.has(linkId(b.planDate!, parseLine(b.items[i])!.exercise.key));
    const groups: number[][] = [];
    for (let i = 0; i < b.items.length; i++) {
      if (!linked(i)) continue;
      const g = [i];
      while (linked(i)) g.push(++i);
      groups.push(g);
    }
    return groups.length ? { ...rest, supersets: groups } : rest;
  };
  return weeks.map((w) => ({ ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map(overlay) })) }));
}

/** The group line `i` of a block is in, if any */
export const groupOf = (b: Block, i: number): number[] | undefined => b.supersets?.find((g) => g.includes(i));
