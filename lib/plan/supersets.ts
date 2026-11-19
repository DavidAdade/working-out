// Supersets: exercises done back to back, round by round (A1 set 1, A2 set 1, rest, A1 set 2…).
// Stored per person in `supersets` (migration 0017): one row per group, holding the exercise keys in it.
// A group is saved for the workout, not for one date: it shows on every day that has two or more of its
// exercises, so it comes back next week without being rebuilt. Keys are the TEMPLATE's exercise keys (or the
// key of an exercise added mid-workout), never a swapped-in one, so swapping an exercise keeps its group.
// A template can also declare pairs of its own (`Block.supersets`): those show without anything saved, and a
// saved row marked `off` switches one of them off for that person (how "Remove from superset" works on them).
// Nothing here changes the plan: the day's rows are grouped where they are shown (DayView), and the calendar
// feed and the AI check-in never see supersets.

import type { Day } from "./generate.ts";
import { parseLine } from "./exercises.ts";
import { LIFT_KINDS } from "./workout.ts";

/** The most exercises one superset holds */
export const SUPERSET_MAX = 8;

export interface Superset {
  id: string;
  /** Template exercise keys (or added exercises' keys) */
  keys: string[];
  /** Not a group: the plan's own superset with exactly these exercises is switched off for this person */
  off?: boolean;
}

/** Ids of the supersets a template declares: never stored, so never deleted */
const TPL = "tpl:";
const sameKeys = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k) => b.includes(k));

/** The supersets a day's templates declare, by template exercise key (so a swapped exercise stays in its pair) */
export function templateSupersets(day: Pick<Day, "blocks">): Superset[] {
  return day.blocks.flatMap((b) => {
    if (!LIFT_KINDS.includes(b.kind)) return [];
    return (b.supersets ?? []).flatMap((g) => {
      const keys = g.flatMap((i) => parseLine(b.items[i] ?? "")?.exercise.key ?? []);
      return keys.length >= 2 ? [{ id: TPL + keys.join("+"), keys }] : [];
    });
  });
}

/**
 * Every superset that can show on a day: the person's own first (so theirs wins an exercise both want), then
 * the templates' that they haven't switched off. Pass this list to dayGroups and editGroup.
 */
export function daySupersets(day: Pick<Day, "blocks">, saved: readonly Superset[]): Superset[] {
  const off = saved.filter((s) => s.off);
  return [...saved.filter((s) => !s.off), ...templateSupersets(day).filter((t) => !off.some((o) => sameKeys(o.keys, t.keys)))];
}

/** One loggable row of a day: its id as shown ("blockIndex-itemIndex", or "add-<key>") and the key it's grouped by */
export interface DaySlot {
  id: string;
  key: string;
}

/** A day's loggable rows in order: the template lines, then the exercises added on top */
export function daySlots(day: Pick<Day, "blocks">, added: readonly string[] = []): DaySlot[] {
  const out: DaySlot[] = [];
  day.blocks.forEach((b, bi) => {
    if (!LIFT_KINDS.includes(b.kind)) return;
    b.items.forEach((line, ii) => {
      const p = parseLine(line);
      if (p) out.push({ id: `${bi}-${ii}`, key: p.exercise.key });
    });
  });
  for (const k of added) out.push({ id: `add-${k}`, key: k });
  return out;
}

export interface DayGroup {
  /** The saved superset it comes from */
  id: string;
  /** A, B… in the order the groups start on the day */
  letter: string;
  /** Row ids, in day order */
  rows: string[];
}

/**
 * The supersets in force on a day. A saved group counts only when two or more of its exercises are there,
 * so a stale one can never pair the wrong exercises; a row is in one group at most (the oldest wins).
 */
export function dayGroups(slots: DaySlot[], supersets: readonly Superset[]): DayGroup[] {
  const taken = new Set<string>();
  const found: { id: string; rows: string[] }[] = [];
  for (const s of supersets) {
    if (s.off) continue;
    const keys = new Set(s.keys);
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const slot of slots) {
      if (!keys.has(slot.key) || seen.has(slot.key) || taken.has(slot.id)) continue;
      seen.add(slot.key);
      rows.push(slot.id);
    }
    if (rows.length < 2) continue;
    for (const r of rows) taken.add(r);
    found.push({ id: s.id, rows });
  }
  const at = (id: string) => slots.findIndex((x) => x.id === id);
  return found.sort((a, b) => at(a.rows[0]) - at(b.rows[0])).map((g, i) => ({ ...g, letter: String.fromCharCode(65 + i) }));
}

/** A change to the saved supersets: rows to delete, rows to add. Safe to apply twice. */
export interface SupersetEdit {
  remove: string[];
  add: Superset[];
}

export const applyEdit = (list: readonly Superset[], e: SupersetEdit): Superset[] => {
  const gone = new Set(e.remove);
  const kept = list.filter((s) => !gone.has(s.id));
  return [...kept, ...e.add.filter((a) => !kept.some((s) => s.id === a.id))];
};

/**
 * The edit that makes `chosen` (row ids, `row` among them) one superset on this day; with `row` alone, the
 * edit that takes `row` out of its superset and leaves the others together. Rows pulled from another group
 * leave it. Exercises of a touched group that aren't on this day stay in it, so the same group on another
 * day's workout isn't broken. Null when nothing would change.
 */
export function editGroup(supersets: readonly Superset[], slots: DaySlot[], row: string, chosen: readonly string[], newId: () => string): SupersetEdit | null {
  const keyOf = (id: string) => slots.find((s) => s.id === id)?.key;
  const groups = dayGroups(slots, supersets);
  const mine = groups.find((g) => g.rows.includes(row));
  const picked = slots.filter((s) => s.id === row || chosen.includes(s.id)).map((s) => s.id);
  const want = picked.length >= 2 ? picked : [];
  if (!keyOf(row)) return null;
  if (mine && want.length === mine.rows.length && want.every((r) => mine.rows.includes(r))) return null;
  if (!mine && !want.length) return null;

  const wantKeys = want.map((r) => keyOf(r)!);
  const edit: SupersetEdit = { remove: [], add: [] };
  const replace = (g: DayGroup, keys: string[]) => {
    // The plan's own pair can't be deleted: a saved "off" row hides it (deleting that row brings it back)
    if (g.id.startsWith(TPL)) edit.add.push({ id: newId(), keys: supersets.find((s) => s.id === g.id)!.keys, off: true });
    else edit.remove.push(g.id);
    const uniq = [...new Set(keys)].slice(0, SUPERSET_MAX);
    if (uniq.length >= 2) edit.add.push({ id: newId(), keys: uniq });
  };
  // Other groups on the day lose the rows that were picked
  for (const g of groups) {
    if (g === mine || !g.rows.some((r) => want.includes(r))) continue;
    const saved = supersets.find((s) => s.id === g.id)!;
    replace(g, saved.keys.filter((k) => !wantKeys.includes(k)));
  }
  if (mine) {
    const saved = supersets.find((s) => s.id === mine.id)!;
    const here = mine.rows.map((r) => keyOf(r)!);
    const away = saved.keys.filter((k) => !here.includes(k));
    // Leaving: the others stay together. Otherwise the group becomes exactly what was picked.
    replace(mine, want.length ? [...wantKeys, ...away] : saved.keys.filter((k) => k !== keyOf(row)));
  } else edit.add.push({ id: newId(), keys: [...new Set(wantKeys)].slice(0, SUPERSET_MAX) });
  return edit;
}
