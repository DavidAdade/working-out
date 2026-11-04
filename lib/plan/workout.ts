// Workout sessions: Start / End on a plan day, the 4-hour auto-end, the 12-hour edit lock, and how complete a day is.
// Stored per person in `workout_sessions` (see supabase/migrations/0010_workout_sessions.sql), one row per plan day,
// keyed by the date the plan put the workout on (like exercise_swaps), so a session follows its workout when it moves.
// Nothing here needs a cron: an open session past started_at + 4 h reads as ended at started_at + 4 h everywhere,
// and the app saves it that way the next time it sees it.

import type { Day } from "./generate.ts";
import type { BlockKind } from "./templates.ts";
import { parseLine } from "./exercises.ts";
import { itemKey } from "./swaps.ts";
import type { ISODate } from "./dates.ts";

/** An unended workout ends this long after it started */
export const AUTO_END_MS = 4 * 3600e3;
/** A workout's sets can't be changed once it has been ended this long */
export const LOCK_MS = 12 * 3600e3;

/** A row of `workout_sessions` */
export interface WorkoutSession {
  /** The plan's own date for the workout (before moves), like exercise_swaps.plan_date */
  plan_date: ISODate;
  started_at: string;
  ended_at: string | null;
  /** Ended by the 4-hour rule rather than the End button */
  auto_ended: boolean;
}

/** The date a day's session is stored under: where the plan put the workout, so it follows a move */
export const sessionDate = (day: Pick<Day, "date" | "movedFrom">): ISODate => day.movedFrom ?? day.date;

/** The same, from the shown date and the person's moves (server side, where there's no generated plan) */
export const sessionDateFor = (shown: ISODate, moves: { from: ISODate; to: ISODate }[]): ISODate => moves.find((m) => m.to === shown)?.from ?? shown;

export interface SessionState {
  active: boolean;
  startedAt: number;
  /** When it ended (ms), counting the 4-hour rule; null while active */
  endedAt: number | null;
  autoEnded: boolean;
  /** Ended 12 hours ago or more: its sets are read-only */
  locked: boolean;
  /** Still open in the database past the 4-hour mark: save it as auto-ended */
  needsAutoEnd: boolean;
}

export function sessionState(s: WorkoutSession, now: number): SessionState {
  const startedAt = Date.parse(s.started_at);
  const cutoff = startedAt + AUTO_END_MS;
  const saved = s.ended_at ? Date.parse(s.ended_at) : null;
  const needsAutoEnd = saved == null && now >= cutoff;
  const endedAt = saved ?? (needsAutoEnd ? cutoff : null);
  return {
    active: endedAt == null,
    startedAt,
    endedAt,
    autoEnded: s.auto_ended || needsAutoEnd,
    locked: endedAt != null && now >= endedAt + LOCK_MS,
    needsAutoEnd,
  };
}

export const isLocked = (s: WorkoutSession | null | undefined, now: number) => !!s && sessionState(s, now).locked;

/**
 * The end time to save for an End tap (or a replayed one) at `at`: never before the start, never past the 4-hour mark.
 * A late End counts as the automatic one.
 */
export function clampEnd(startedAt: string, at: string, auto: boolean): { ended_at: string; auto_ended: boolean } {
  const start = Date.parse(startedAt);
  const t = Math.max(start, Date.parse(at));
  const cutoff = start + AUTO_END_MS;
  return t >= cutoff ? { ended_at: new Date(cutoff).toISOString(), auto_ended: true } : { ended_at: new Date(t).toISOString(), auto_ended: auto };
}

/** "0:42", "12:05", "1:02:09" */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/* ---------- what a day asks for, and how much of it was done ---------- */

/** Block kinds whose lines are logged set by set */
export const LIFT_KINDS: BlockKind[] = ["legs", "upper", "abs", "mobility"];

export interface DayExercise {
  /** "blockIndex-itemIndex" */
  id: string;
  /** The exercise as shown: the swapped-in one when swapped */
  key: string;
  /** Target sets, 2 on light weeks */
  sets: number;
  /** In a superset: its letter (A, B… per day, in order), place in the group (1-based) and the group's size */
  group?: { letter: string; pos: number; size: number };
}

/** Every loggable exercise on a day, in order, as shown (swaps and supersets included) */
export function dayExercises(day: Pick<Day, "blocks">): DayExercise[] {
  let letters = 0;
  return day.blocks.flatMap((b, bi) => {
    if (!LIFT_KINDS.includes(b.kind)) return [];
    const groups = (b.supersets ?? []).map((g) => ({ g, letter: String.fromCharCode(65 + letters++) }));
    return b.items.flatMap((line, ii) => {
      const p = parseLine(line);
      if (!p) return [];
      const target = b.swaps?.[ii]?.target ?? p.target;
      const light = !!b.light || !!b.foldedFrom;
      const inGroup = groups.find((x) => x.g.includes(ii));
      const x: DayExercise = { id: `${bi}-${ii}`, key: itemKey(b, ii) ?? p.exercise.key, sets: light ? Math.min(target.sets, 2) : target.sets };
      if (inGroup) x.group = { letter: inGroup.letter, pos: inGroup.g.indexOf(ii) + 1, size: inGroup.g.length };
      return [x];
    });
  });
}

export interface RoundStep {
  /** The exercise to open next: the next one in this round, else the first still behind; null when there's none */
  next: string | null;
  /** Rest now: the round is over (or the set was an extra one past the target) */
  rest: boolean;
  /** Every exercise in the group hit its target */
  groupDone: boolean;
}

/**
 * Where a superset goes after set `setNo` of exercise `id` is logged: on to the next exercise in the round with
 * no rest, or, once the round is over, a rest and back to the first exercise still behind. `done` counts the
 * sets logged so far for a key on this day (set `setNo` of `id` counts whether or not it's in yet).
 * Uneven groups (3 sets and 4) finish with the longer one alone, resting after each set. An extra set past
 * an exercise's target rests and stays put.
 */
export function nextInRound(order: DayExercise[], id: string, setNo: number, done: (key: string) => number): RoundStep {
  const me = order.find((x) => x.id === id);
  if (!me?.group) return { next: null, rest: true, groupDone: false };
  const members = order.filter((x) => x.group?.letter === me.group!.letter);
  const count = (x: DayExercise) => (x.id === id ? Math.max(done(x.key), setNo) : done(x.key));
  const groupDone = members.every((x) => count(x) >= x.sets);
  if (setNo > me.sets) return { next: null, rest: true, groupDone: false };
  const after = members.slice(members.indexOf(me) + 1).find((x) => x.sets >= setNo && count(x) < setNo);
  if (after) return { next: after.id, rest: false, groupDone: false };
  if (groupDone) return { next: null, rest: true, groupDone: true };
  return { next: members.find((x) => count(x) < x.sets)?.id ?? null, rest: true, groupDone: false };
}

export interface SetLite {
  date: ISODate;
  plan_date: ISODate | null;
  exercise_key: string;
}

export interface Completion {
  /** Target sets across the day */
  planned: number;
  /** Target sets done (extras not counted) */
  done: number;
  /** Sets past an exercise's target, plus sets of exercises the day doesn't ask for */
  extraSets: number;
  /** Exercises logged on this day that it doesn't ask for */
  extraExercises: number;
  /**
   * none: nothing to log on this day. incomplete: a target set is missing.
   * complete: every target set, nothing more. beyond: every target set and then some.
   */
  status: "none" | "incomplete" | "complete" | "beyond";
}

/**
 * How much of a day's workout was done. Counts sets by the plan day they're for (set_logs.plan_date, else date).
 * Sets logged under a swapped-out original before the swap are neither progress nor extra.
 */
export function completion(day: Pick<Day, "date" | "blocks">, sets: SetLite[]): Completion {
  const list = dayExercises(day);
  const target = new Map<string, number>();
  for (const x of list) target.set(x.key, (target.get(x.key) ?? 0) + x.sets);
  const swappedOut = new Set(day.blocks.flatMap((b) => Object.values(b.swaps ?? {}).map((s) => s.from)));
  const count = new Map<string, number>();
  for (const s of sets) if ((s.plan_date ?? s.date) === day.date) count.set(s.exercise_key, (count.get(s.exercise_key) ?? 0) + 1);

  let planned = 0;
  let done = 0;
  let extraSets = 0;
  let extraExercises = 0;
  for (const [key, t] of target) {
    const n = count.get(key) ?? 0;
    planned += t;
    done += Math.min(n, t);
    extraSets += Math.max(0, n - t);
  }
  for (const [key, n] of count) {
    if (target.has(key) || swappedOut.has(key)) continue;
    extraSets += n;
    extraExercises++;
  }
  const status = !planned ? "none" : done < planned ? "incomplete" : extraSets > 0 ? "beyond" : "complete";
  return { planned, done, extraSets, extraExercises, status };
}

/* ---------- the hold timer ---------- */

/** Seconds to switch sides between the two halves of an "each side" hold */
export const SWITCH_SEC = 5;

export interface HoldPhase {
  label: string;
  sec: number;
  /** A side being held (not the switch) */
  hold: boolean;
}

/** One hold, or both sides with a short switch between them */
export const holdPhases = (sec: number, each: boolean): HoldPhase[] =>
  each
    ? [
        { label: "First side", sec, hold: true },
        { label: "Switch sides", sec: SWITCH_SEC, hold: false },
        { label: "Second side", sec, hold: true },
      ]
    : [{ label: "Hold", sec, hold: true }];

/**
 * Seconds to log when the timer is stopped in phase `index` after `inPhase` seconds of it.
 * Each-side holds log one side's time, like reps: the shorter side, once both have started.
 */
export function heldSeconds(phases: HoldPhase[], index: number, inPhase: number): number {
  const sides = phases.map((p, i) => (i < index ? p.sec : i === index ? Math.min(p.sec, Math.max(0, Math.round(inPhase))) : null)).filter((v, i) => v != null && phases[i].hold) as number[];
  if (!sides.length) return 0;
  // A second side that hasn't started doesn't count against the first
  const started = sides.filter((v, i) => i === 0 || v > 0);
  return Math.min(...started);
}
