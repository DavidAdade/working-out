// Accountability: how closely the logs follow the plan, as one number for the last 4 weeks plus the
// day-by-day reasons. Nothing is stored: it compares the plan as shown (planFor, swaps applied) with the logs.
//
// Units per plan block: a strength line = its target sets (2 on light or folded blocks), a line without a
// target = 1, "Optional" lines = 0, a run = 20, a long run or test = 30, a walk or gate check = 6.
// Score = clamp(A + E + P − D, 0, 100):
//   A  adherence, recent days weigh more (half-life 14 days)        doing the plan = 100
//   E  extra work, up to +8, only in weeks that are already kept and only when the plan isn't easing off
//   P  new bests, +0.5 each up to +3        D  lifts that dropped 5%+, −0.5 each down to −2
// Rest days, cutback weeks, moved days and pain or gate changes all count as doing the plan.

import { addDays, daysBetween, dowName, mondayOf, type ISODate } from "./dates.ts";
import { adaptPlan } from "./adapt.ts";
import { dayTitle, isHard, type Day, type Phase, type Week } from "./generate.ts";
import { exerciseByKey, parseLine } from "./exercises.ts";
import { itemKey } from "./swaps.ts";
import { painWarnings } from "./warnings.ts";
import { bestOn, compareSession, sessions, type SetLike } from "./progress.ts";
import type { Block } from "./templates.ts";

/* ---------- inputs ---------- */

export interface AcctSet extends SetLike {
  /** The plan day these sets were for, when done early */
  plan_date?: ISODate | null;
}

export interface AcctLog {
  date: ISODate;
  kind: string;
  title?: string | null;
  km: number | null;
  duration_sec: number | null;
  pain: Record<string, number>;
  auto?: boolean;
}

export interface AcctSkip {
  date: ISODate;
  /** When the skip was made (timestamptz); a skip made after the day is shown as such */
  createdAt?: string | null;
}

/** A workout session (migration 0010). Optional until that table is read */
export interface AcctSession {
  plan_date: ISODate;
  auto_ended: boolean;
}

export interface AcctEvent {
  kind: "log_deleted" | "set_deleted";
  date: ISODate;
  payload: Record<string, unknown>;
  created_at?: string;
}

export interface AccountabilityInput {
  /** planFor(...).weeks: moves, skips, swaps and this week's pain or gate changes already applied */
  weeks: Week[];
  logs: AcctLog[];
  sets: AcctSet[];
  skips?: AcctSkip[];
  sessions?: AcctSession[];
  events?: AcctEvent[];
  gatesPending?: boolean;
  today: ISODate;
  /** Oldest date the loaded history is complete from; nothing before it counts as missed */
  horizon?: ISODate | null;
  /** Exercise names for the feed */
  name?: (key: string) => string;
}

/* ---------- outputs ---------- */

export type Band = "locked" | "steady" | "wobbling" | "restart";
export const BANDS: Record<Band, { label: string; copy: string }> = {
  locked: { label: "Locked in", copy: "You're doing what the plan asks." },
  steady: { label: "Steady", copy: "Most of the plan, most weeks." },
  wobbling: { label: "Wobbling", copy: "A couple of misses. One good week fixes it." },
  restart: { label: "Restart", copy: "Pick up today's session, no catch-up needed." },
};
export const bandOf = (score: number): Band => (score >= 90 ? "locked" : score >= 75 ? "steady" : score >= 60 ? "wobbling" : "restart");

export type Glyph = "done" | "partial" | "missed" | "rest" | "moved" | "extra" | "eased" | "skipped" | "today" | "grace" | "future" | "none";
export const GLYPHS: Record<Glyph, string> = {
  done: "●",
  partial: "◐",
  missed: "○",
  rest: "·",
  moved: "⇢",
  extra: "✚",
  eased: "⏸",
  skipped: "⨯",
  today: "◌",
  grace: "◌",
  future: "",
  none: "",
};

export interface DayCell {
  date: ISODate;
  glyph: Glyph;
  title: string;
}

export interface WeekTally {
  start: ISODate;
  label: string;
  phase: Phase | null;
  cutback: boolean;
  days: DayCell[];
  /** Share of the week's planned work done so far; null when nothing was due */
  pct: number | null;
  inProgress: boolean;
  kept: boolean;
}

export type FeedKind =
  | "done"
  | "missed"
  | "partial"
  | "grace"
  | "skipped"
  | "skipped_late"
  | "done_other_day"
  | "sets_short"
  | "set_extra"
  | "exercise_extra"
  | "extra_workout"
  | "set_deleted"
  | "log_deleted"
  | "ended_early"
  | "run_short"
  | "moved"
  | "swapped"
  | "weight_up"
  | "weight_same"
  | "weight_down";

export interface FeedItem {
  id: string;
  kind: FeedKind;
  date: ISODate;
  tone: "good" | "neutral" | "bad";
  /** Exercise key: the row opens its history */
  key?: string;
  title: string;
  detail?: string;
  /** The plain consequence on the right: "12/15 sets", "+3 sets", "half credit", "+2.5 kg" */
  delta: string;
  /** Weight change in kg, for showing in the viewer's unit */
  kg?: number;
}

export interface Accountability {
  /** Null until there's enough to score (see `status`) */
  score: number | null;
  status: "ok" | "building" | "not_started" | "empty";
  band: Band | null;
  /** The plan's last day has passed: the score is frozen on its final 4 weeks */
  finished: boolean;
  parts: { a: number; e: number; p: number; d: number };
  /** Past planned days that count, and how many are needed before a number shows */
  counted: number;
  needed: number;
  sessions: { done: number; planned: number };
  sets: { done: number; planned: number };
  /** Unplanned workouts in the window */
  extras: number;
  /** Weeks kept (80%+) in a row */
  streak: number;
  from: ISODate;
  weeks: WeekTally[];
  feed: FeedItem[];
}

/* ---------- constants ---------- */

export const WINDOW_DAYS = 28;
export const HALF_LIFE_DAYS = 14;
export const KEPT_PCT = 80;
export const MIN_COUNTED = 3;
const E_MAX = 8;
const E_SCALE = 50;
const P_EACH = 0.5;
const P_MAX = 3;
const D_EACH = 0.5;
const D_MAX = 2;
const RUN_U = 20;
const LONG_U = 30;
const WALK_U = 6;
/** Runs this close to the plan get full credit */
const RUN_FULL = 0.9;
/** Intervals, tests and runs without a number: any run this long counts in full */
const RUN_MIN_SEC = 600;
const SHOWN_WEEKS = 6;
const STREAK_WEEKS = 12;

const LIFT = new Set<Block["kind"]>(["legs", "upper", "abs", "mobility"]);
const isRun = (b: Block) => b.kind === "run" || b.kind === "test";
const isWalk = (b: Block) => b.kind === "walk" || b.kind === "gate";
const NO_EXTRA: Phase[] = ["recovery", "return", "tt", "taper", "race"];
const counts = (s: SetLike) => (s.reps ?? 0) >= 1 || (s.duration_sec ?? 0) >= 1;
const planDay = (s: AcctSet) => s.plan_date ?? s.date;
const r1 = (n: number) => Math.round(n * 10) / 10;
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const xs = m.get(k);
  if (xs) xs.push(v);
  else m.set(k, [v]);
};
const fmtNum = (n: number) => String(r1(n));

/* ---------- per-day scoring ---------- */

interface Line {
  key: string | null;
  name: string;
  u: number;
  c: number;
  light: boolean;
}

interface RunMatch {
  block: Block;
  u: number;
  c: number;
  /** Log date when done on another day of the week */
  from?: ISODate;
  /** "24 of 30 min" when short */
  short?: string;
}

interface Tally {
  date: ISODate;
  week: Week | null;
  day: Day | null;
  blocks: Block[];
  state: "planned" | "rest" | "skipped" | "future";
  eased: boolean;
  /** Planned units and credit as scored (today: u = c) */
  u: number;
  c: number;
  /** Units the day asks for in full, before the today/grace rules */
  fullU: number;
  lines: Line[];
  runs: RunMatch[];
  walkU: number;
  walkC: number;
  active: boolean;
  counted: boolean;
  grace: boolean;
  /** Sets beyond the plan, by key */
  extraSets: Map<string, { n: number; onDay: boolean; light: boolean }>;
  /** Unplanned runs and walks */
  extraLogs: AcctLog[];
  extraU: number;
  skipNote?: "late";
}

/** Planned minutes or km, and the credit for what was logged. */
export function runCredit(b: Block, u: number, logs: AcctLog[]): { c: number; short?: string } {
  if (!logs.length) return { c: 0 };
  const km = logs.reduce((t, l) => t + (l.km ?? 0), 0);
  const sec = logs.reduce((t, l) => t + (l.duration_sec ?? 0), 0);
  const min = !isHard(b) && b.kind === "run" && !b.km ? Number(/(\d+) min/.exec(b.title)?.[1] ?? 0) : 0;
  let f: number | null = null;
  let short: string | undefined;
  if (b.km && km > 0) {
    f = km / b.km;
    short = `${fmtNum(km)} of ${fmtNum(b.km)} km`;
  } else if (min && sec > 0) {
    f = sec / 60 / min;
    short = `${Math.round(sec / 60)} of ${min} min`;
  }
  if (f == null) return { c: !sec || sec >= RUN_MIN_SEC ? u : (u * sec) / RUN_MIN_SEC };
  if (f >= RUN_FULL) return { c: u };
  return { c: u * Math.min(1, f), short };
}

function blockLines(b: Block, sized: boolean, name: (k: string) => string): Line[] {
  if (!LIFT.has(b.kind)) return [];
  return b.items.flatMap((line, i) => {
    if (/^optional/i.test(line.trim())) return [];
    const target = b.swaps?.[i]?.target ?? parseLine(line)?.target;
    const key = itemKey(b, i);
    if (!target) return [{ key: null, name: line, u: 1, c: 0, light: !!b.light }];
    const u = sized && (b.light || b.foldedFrom) ? Math.min(target.sets, 2) : target.sets;
    return [{ key, name: b.swaps?.[i]?.name ?? (key ? name(key) : line), u, c: 0, light: !!b.light || !!b.foldedFrom }];
  });
}

const blockUnits = (b: Block, name: (k: string) => string) =>
  isRun(b) ? (b.km || b.kind === "test" ? LONG_U : RUN_U) : isWalk(b) ? WALK_U : blockLines(b, true, name).reduce((t, l) => t + l.u, 0);

/* ---------- the whole thing ---------- */

export function accountability(input: AccountabilityInput): Accountability {
  const { weeks, logs, sets } = input;
  const name = input.name ?? ((k: string) => exerciseByKey(k)?.name ?? k);
  const empty = (status: Accountability["status"], from: ISODate, extra: Partial<Accountability> = {}): Accountability => ({
    score: null,
    status,
    band: null,
    finished: false,
    parts: { a: 0, e: 0, p: 0, d: 0 },
    counted: 0,
    needed: MIN_COUNTED,
    sessions: { done: 0, planned: 0 },
    sets: { done: 0, planned: 0 },
    extras: 0,
    streak: 0,
    from,
    weeks: [],
    feed: [],
    ...extra,
  });
  if (!weeks.length) return empty("empty", input.today);
  const planStart = weeks[0].start;
  const planEnd = addDays(weeks.at(-1)!.start, 7);
  if (input.today < planStart) return empty("not_started", planStart);
  const finished = input.today >= planEnd;
  const today = finished ? planEnd : input.today;
  const yesterday = addDays(today, -1);
  const horizon = input.horizon && input.horizon > planStart ? input.horizon : planStart;
  const from = [addDays(today, -(WINDOW_DAYS - 1)), horizon].sort().at(-1)!;
  const tallyFrom = [addDays(mondayOf(today), -7 * (STREAK_WEEKS - 1)), horizon].sort().at(-1)!;

  /* index the plan and the history once */
  const dayAt = new Map<ISODate, { day: Day; week: Week }>();
  const weekAt = new Map<ISODate, Week>();
  for (const w of weeks) {
    weekAt.set(w.start, w);
    for (const d of w.days) dayAt.set(d.date, { day: d, week: w });
  }
  const setsByDay = new Map<ISODate, Map<string, number>>();
  const setsByKey = new Map<string, AcctSet[]>();
  for (const s of sets) {
    push(setsByKey, s.exercise_key, s);
    if (!counts(s)) continue;
    const m = setsByDay.get(planDay(s)) ?? new Map<string, number>();
    m.set(s.exercise_key, (m.get(s.exercise_key) ?? 0) + 1);
    setsByDay.set(planDay(s), m);
  }
  const logsByDay = new Map<ISODate, AcctLog[]>();
  for (const l of logs) if (l.kind !== "check") push(logsByDay, l.date, l);
  const runLogs = (date: ISODate) => (logsByDay.get(date) ?? []).filter((l) => !l.auto && (l.kind === "run" || l.kind === "test"));
  const skipMade = new Map((input.skips ?? []).map((s) => [s.date, s.createdAt ? s.createdAt.slice(0, 10) : null]));

  // Pain as it stood on a day: the plan eased off from what was logged before it
  const painMemo = new Map<ISODate, boolean>();
  const painOn = (date: ISODate) => {
    if (!painMemo.has(date)) painMemo.set(date, painWarnings(logs.filter((l) => l.date < date), date).length > 0);
    return painMemo.get(date)!;
  };

  /** A past day as the plan showed it then: pain and gate changes from that day's own point of view */
  const shownThen = (date: ISODate, w: Week, d: Day): Day => {
    if (date >= input.today || d.skipped || !d.blocks.some(isRun)) return d;
    const gated = !!input.gatesPending && w.phase === "return";
    if (!gated && !painOn(date)) return d;
    const warnings = painWarnings(logs.filter((l) => l.date < date), date);
    return adaptPlan([w], { today: date, gatesPending: !!input.gatesPending, warnings })[0].days.find((x) => x.date === date) ?? d;
  };

  /* pass 1: each day's plan, lift credit and same-day runs */
  const tallies: Tally[] = [];
  for (let date = tallyFrom; date <= today; date = addDays(date, 1)) {
    const hit = dayAt.get(date);
    const week = hit?.week ?? weekAt.get(mondayOf(date)) ?? null;
    const t: Tally = {
      date,
      week,
      day: hit?.day ?? null,
      blocks: [],
      state: "rest",
      eased: false,
      u: 0,
      c: 0,
      fullU: 0,
      lines: [],
      runs: [],
      walkU: 0,
      walkC: 0,
      active: false,
      counted: false,
      grace: false,
      extraSets: new Map(),
      extraLogs: [],
      extraU: 0,
    };
    tallies.push(t);
    const daySets = new Map(setsByDay.get(date) ?? []);
    const dayLogs = logsByDay.get(date) ?? [];
    t.active = daySets.size > 0 || dayLogs.length > 0;
    if (hit && hit.day.skipped) t.state = "skipped";
    else if (hit && hit.day.blocks.length) {
      t.state = "planned";
      const shown = shownThen(date, week!, hit.day);
      t.eased = shown !== hit.day;
      // A carry block folded onto a day that had already passed when the skip was made doesn't count here
      t.blocks = shown.blocks.filter((b) => !b.foldedFrom || foldCounts(week!, b, date));
    }

    const lines = t.blocks.flatMap((b) => blockLines(b, true, name));
    const swapFrom = new Map<string, string>();
    for (const b of t.blocks) for (const s of Object.values(b.swaps ?? {})) swapFrom.set(s.to, s.from);
    for (const l of lines) {
      if (!l.key) {
        l.c = t.active ? l.u : 0;
        continue;
      }
      for (const k of [l.key, swapFrom.get(l.key)]) {
        if (!k || l.c >= l.u) continue;
        const take = Math.min(l.u - l.c, daySets.get(k) ?? 0);
        l.c += take;
        daySets.set(k, (daySets.get(k) ?? 0) - take);
      }
    }
    t.lines = lines;
    const onDay = new Map(lines.flatMap((l) => (l.key ? [[l.key, l.light] as const] : [])));
    for (const [k, n] of daySets) if (n > 0) t.extraSets.set(k, { n, onDay: onDay.has(k) || [...swapFrom.values()].includes(k), light: !!onDay.get(k) });

    const runs = runLogs(date);
    const runBlocks = t.blocks.filter(isRun);
    for (const [i, b] of runBlocks.entries()) {
      const u = b.km || b.kind === "test" ? LONG_U : RUN_U;
      // All of the day's runs go to its first run block
      const r = runCredit(b, u, i === 0 ? runs : []);
      t.runs.push({ block: b, u, c: r.c, short: r.short });
    }
    if (!runBlocks.length || t.state !== "planned") t.extraLogs.push(...runs);
    for (const b of t.blocks.filter(isWalk)) {
      t.walkU += WALK_U;
      if (t.active || (b.kind === "gate" && !input.gatesPending)) t.walkC += WALK_U;
    }
    // Walks logged on a day without one are extra
    if (!t.blocks.some(isWalk)) t.extraLogs.push(...dayLogs.filter((l) => !l.auto && l.kind === "walk"));
  }

  /* pass 2: a run logged on another day of the same week stands for a missed run (logs have no plan date) */
  for (const w of new Set(tallies.map((t) => t.week))) {
    if (!w) continue;
    const inWeek = tallies.filter((t) => t.week === w);
    const open = inWeek.flatMap((t) => (t.state === "planned" ? t.runs.filter((r) => r.c === 0).map((r) => ({ t, r })) : []));
    for (const { t, r } of open) {
      const spare = inWeek
        .flatMap((x) => x.extraLogs.filter((l) => l.kind === "run" || l.kind === "test").map((l) => ({ x, l })))
        .sort((a, b) => Math.abs(daysBetween(t.date, a.l.date)) - Math.abs(daysBetween(t.date, b.l.date)))[0];
      if (!spare) break;
      spare.x.extraLogs = spare.x.extraLogs.filter((l) => l !== spare.l);
      const credit = runCredit(r.block, r.u, [spare.l]);
      Object.assign(r, { c: credit.c, short: credit.short, from: spare.l.date });
      t.active = true;
    }
  }

  /* pass 3: units, credit and what counts */
  for (const t of tallies) {
    const liftU = t.lines.reduce((s, l) => s + l.u, 0);
    const liftC = t.lines.reduce((s, l) => s + l.c, 0);
    const runU = t.runs.reduce((s, r) => s + r.u, 0);
    const runC = t.runs.reduce((s, r) => s + r.c, 0);
    if (t.state === "skipped") {
      // Half the day's work, except carry blocks done on another day this week
      const d = t.day!;
      t.fullU = 0.5 * d.blocks.filter((b) => !(b.carry && foldedAway(t.week!, d, b))).reduce((s, b) => s + blockUnits(b, name), 0);
      t.u = t.fullU;
      t.c = 0;
      t.counted = t.date < today;
      const made = skipMade.get(t.date);
      if (made && made > t.date) t.skipNote = "late";
    } else if (t.state === "planned") {
      t.fullU = liftU + runU + t.walkU;
      const c = liftC + runC + t.walkC;
      const logged = t.active || c > 0;
      if (t.date === today) {
        t.u = c;
        t.c = c;
        t.counted = c > 0;
      } else if (!logged && t.date === yesterday) {
        t.grace = true;
      } else {
        t.u = t.fullU;
        t.c = c;
        t.counted = t.fullU > 0;
      }
    }
  }

  /* extras: only in weeks already kept, when the plan isn't easing off */
  const weekPct = new Map<Week, number | null>();
  for (const w of new Set(tallies.map((t) => t.week))) {
    if (!w) continue;
    const xs = tallies.filter((t) => t.week === w && t.counted);
    const u = xs.reduce((s, t) => s + t.u, 0);
    weekPct.set(w, u > 0 ? (100 * xs.reduce((s, t) => s + t.c, 0)) / u : null);
  }
  const whyNoExtra = (t: Tally): string | null => {
    const w = t.week;
    if (!w || NO_EXTRA.includes(w.phase)) return "Not counted in this phase";
    if (w.cutback) return "Cutback week: the plan says less";
    if (painOn(t.date) || (input.gatesPending && w.phase === "return")) return "Extra logged. Plan says ease off";
    const pct = weekPct.get(w);
    if (pct != null && pct < KEPT_PCT) return "Counts once the week is at 80%";
    return null;
  };
  const unplannedU = (l: AcctLog) => {
    const min = l.duration_sec ? l.duration_sec / 60 : l.km ? l.km * 7 : 30;
    return RUN_U * Math.min(1, min / 30);
  };
  for (const t of tallies) {
    if (whyNoExtra(t)) continue;
    let x = 0;
    for (const e of t.extraSets.values()) if (!e.light) x += e.n;
    for (const l of t.extraLogs) x += unplannedU(l);
    t.extraU = Math.min(x, Math.max(0.5 * t.fullU, 10));
  }

  /* the score */
  const inWindow = tallies.filter((t) => t.date >= from);
  const weight = (d: ISODate) => Math.pow(0.5, daysBetween(d, today) / HALF_LIFE_DAYS);
  let wu = 0;
  let wc = 0;
  let wx = 0;
  for (const t of inWindow) {
    const w = weight(t.date);
    if (t.counted) {
      wu += w * t.u;
      wc += w * t.c;
    }
    wx += w * t.extraU;
  }

  // New bests and drops, from each lift's own sessions (grouped once by key)
  let bests = 0;
  let drops = 0;
  const feed: FeedItem[] = [];
  const shownFrom = [addDays(mondayOf(today), -7 * (SHOWN_WEEKS - 1)), tallyFrom].sort().at(-1)!;
  for (const [key, rows] of setsByKey) {
    const all = sessions(rows, key);
    for (const [i, s] of all.entries()) {
      if (s.date < shownFrom || s.date > today) continue;
      const scored = s.date >= from;
      const best = bestOn(all, s.date);
      if (best && scored) bests++;
      const change = compareSession(all, s.date);
      const ph = weekAt.get(mondayOf(s.date))?.phase;
      const dropCounts = change?.kind === "dropped" && ph !== "recovery" && ph !== "return" && !painOn(s.date);
      if (dropCounts && scored) drops++;
      if (s.light || s.topKg == null) continue;
      const prev = all.slice(i + 1).find((p) => !p.light && p.topKg != null);
      if (!prev) continue;
      const diff = s.topKg - prev.topKg!;
      const nm = name(key);
      if (diff > 0.25) feed.push({ id: `up|${s.date}|${key}`, kind: "weight_up", date: s.date, tone: "good", key, title: `${nm}: heavier`, detail: best ? "New best" : undefined, delta: `+${fmtNum(diff)} kg`, kg: diff });
      else if (diff >= -0.25) feed.push({ id: `same|${s.date}|${key}`, kind: "weight_same", date: s.date, tone: "good", key, title: `${nm}: weight held`, detail: best ? "More reps: new best" : undefined, delta: "held" });
      else
        feed.push({
          id: `down|${s.date}|${key}`,
          kind: "weight_down",
          date: s.date,
          tone: dropCounts ? "bad" : "neutral",
          key,
          title: `${nm}: lighter`,
          detail: change?.kind === "dropped" ? (dropCounts ? `${Math.round(-change.pct)}% lighter` : "Lighter while the plan eased off: not counted") : undefined,
          delta: `${fmtNum(diff)} kg`,
          kg: diff,
        });
    }
  }
  // A faster 5K test counts as a best too
  const fives = logs.filter((l) => l.kind === "test" && l.km && Math.abs(l.km - 5) <= 0.3 && l.duration_sec);
  for (const l of fives) if (l.date >= from && l.date <= today && fives.some((x) => x.date < l.date) && fives.every((x) => x.date >= l.date || x.duration_sec! > l.duration_sec!)) bests++;

  const a = wu > 0 ? (100 * wc) / wu : 0;
  const e = wu > 0 ? Math.min(E_MAX, (E_SCALE * wx) / wu) : 0;
  const p = Math.min(P_MAX, P_EACH * bests);
  const d = Math.min(D_MAX, D_EACH * drops);
  const counted = inWindow.filter((t) => t.counted && t.date < today).length;

  /* weeks, newest first */
  const tallyWeeks: WeekTally[] = [];
  for (let ws = mondayOf(today); ws >= mondayOf(tallyFrom); ws = addDays(ws, -7)) {
    const w = weekAt.get(ws) ?? null;
    const cells: DayCell[] = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const date = addDays(ws, i);
      const t = tallies.find((x) => x.date === date);
      return { date, glyph: t ? glyphOf(t, today) : date > today ? "future" : "none", title: t?.day ? dayTitle(t.day) : "Rest" };
    });
    const pct = w ? weekPct.get(w) ?? null : null;
    tallyWeeks.push({ start: ws, label: w?.label ?? "", phase: w?.phase ?? null, cutback: !!w?.cutback, days: cells, pct: pct == null ? null : Math.round(pct), inProgress: ws === mondayOf(today) && !finished, kept: pct != null && pct >= KEPT_PCT });
  }
  let streak = 0;
  for (const [i, w] of tallyWeeks.entries()) {
    if (w.pct == null) continue;
    if (w.kept) streak++;
    else if (i === 0 && w.inProgress) continue;
    else break;
  }

  /* the feed: what changed it */
  for (const t of tallies.filter((x) => x.date >= shownFrom)) feed.push(...feedFor(t, whyNoExtra(t), name, today));
  for (const s of input.sessions ?? [])
    if (s.auto_ended && s.plan_date >= shownFrom && s.plan_date <= today)
      feed.push({ id: `ended|${s.plan_date}`, kind: "ended_early", date: s.plan_date, tone: "neutral", title: "Session closed on its own", detail: "Sets logged still count", delta: "no change" });
  const liveSet = new Set(sets.map((s) => `${planDay(s)}|${s.date}|${s.exercise_key}|${s.set_no}`));
  for (const [i, ev] of (input.events ?? []).entries()) {
    if (ev.date < shownFrom || ev.date > today) continue;
    const pl = ev.payload as Record<string, string | number | null>;
    if (ev.kind === "set_deleted") {
      // Put back since (an undo or a re-log): nothing to show
      if (liveSet.has(`${ev.date}|${pl.date}|${pl.exercise_key}|${pl.set_no}`)) continue;
      const key = String(pl.exercise_key ?? "");
      feed.push({ id: `sdel|${ev.date}|${key}|${pl.set_no}|${i}`, kind: "set_deleted", date: ev.date, tone: "neutral", key: key || undefined, title: `${name(key)}: set ${pl.set_no} removed`, delta: "removed" });
    } else {
      const sets = Number(pl.sets ?? 0);
      feed.push({
        id: `ldel|${ev.date}|${i}`,
        kind: "log_deleted",
        date: ev.date,
        tone: "neutral",
        title: `${pl.title || pl.kind || "Session"} deleted`,
        detail: sets ? `With its ${sets} set${sets === 1 ? "" : "s"}` : undefined,
        delta: "removed",
      });
    }
  }
  const order: Record<FeedKind, number> = {
    done: 0, partial: 0, missed: 0, grace: 0, skipped: 0, skipped_late: 0, done_other_day: 1, moved: 1, run_short: 2, sets_short: 3, swapped: 4,
    weight_up: 5, weight_same: 5, weight_down: 5, set_extra: 6, exercise_extra: 6, extra_workout: 6, ended_early: 7, set_deleted: 8, log_deleted: 8,
  };
  feed.sort((x, y) => (x.date !== y.date ? (x.date < y.date ? 1 : -1) : order[x.kind] - order[y.kind]));

  const windowSets = inWindow.filter((t) => t.counted).flatMap((t) => t.lines.filter((l) => l.key));
  const planned = inWindow.filter((t) => t.counted && (t.date < today || t.c > 0));
  const base: Accountability = {
    score: null,
    status: "building",
    band: null,
    finished,
    parts: { a: r1(a), e: r1(e), p, d },
    counted,
    needed: MIN_COUNTED,
    sessions: { done: planned.filter((t) => t.c > 0).length, planned: planned.length },
    sets: { done: windowSets.reduce((s, l) => s + l.c, 0), planned: windowSets.reduce((s, l) => s + l.u, 0) },
    extras: inWindow.reduce((s, t) => s + t.extraLogs.length + (t.state !== "planned" && t.extraSets.size ? 1 : 0), 0),
    streak,
    from,
    weeks: tallyWeeks.slice(0, SHOWN_WEEKS),
    feed,
  };
  if (counted < MIN_COUNTED || wu <= 0) return base;
  const score = Math.round(Math.max(0, Math.min(100, a + e + p - d)));
  return { ...base, score, status: "ok", band: bandOf(score) };

  /** A block folded here from a skipped day counts unless the skip was made after this day */
  function foldCounts(w: Week, b: Block, date: ISODate): boolean {
    const src = w.days.find((x) => x.skipped && dowName(x.date) === b.foldedFrom);
    const made = src ? skipMade.get(src.date) : null;
    return !made || made <= date;
  }
  /** The carry block from skipped day `d` landed (and counts) on another day */
  function foldedAway(w: Week, d: Day, b: Block): boolean {
    const target = w.days.find((x) => !x.skipped && x.blocks.some((y) => y.foldedFrom === dowName(d.date) && y.title === b.title));
    return !!target && foldCounts(w, { ...b, foldedFrom: dowName(d.date) }, target.date);
  }
}

function glyphOf(t: Tally, today: ISODate): Glyph {
  if (t.date > today) return "future";
  const extra = t.extraLogs.length > 0 || t.extraSets.size > 0;
  if (t.state === "skipped") return "skipped";
  if (t.state === "rest") return extra ? "extra" : "rest";
  if (t.grace) return "grace";
  const full = t.fullU > 0 && t.c >= t.fullU - 1e-9;
  if (t.date === today) return full ? "done" : "today";
  if (t.c <= 0) return "missed";
  if (!full) return "partial";
  if (t.eased) return "eased";
  if (t.day?.movedFrom) return "moved";
  return "done";
}

function feedFor(t: Tally, noExtra: string | null, name: (k: string) => string, today: ISODate): FeedItem[] {
  const out: FeedItem[] = [];
  const title = t.day ? dayTitle(t.day) : "Rest day";
  const id = (k: string, x = "") => `${k}|${t.date}|${x}`;
  if (t.state === "skipped") {
    const late = t.skipNote === "late";
    out.push({ id: id("skip"), kind: late ? "skipped_late" : "skipped", date: t.date, tone: "neutral", title: `Skipped: ${title}`, detail: late ? "Skipped after the day" : "Skipping counts half: better than a miss", delta: "half credit" });
  } else if (t.state === "planned") {
    const liftU = t.lines.reduce((s, l) => s + l.u, 0);
    const liftC = t.lines.reduce((s, l) => s + l.c, 0);
    if (t.grace) out.push({ id: id("grace"), kind: "grace", date: t.date, tone: "neutral", title: `${title}: not logged yet`, detail: "Log it today and it counts in full", delta: "not counted yet" });
    else if (t.date === today) {
      if (t.c > 0) out.push({ id: id("today"), kind: t.c >= t.fullU ? "done" : "partial", date: t.date, tone: "good", title: `${title}: in progress`, delta: liftU ? `${liftC}/${liftU} sets` : "counted" });
    } else if (t.c <= 0) out.push({ id: id("miss"), kind: "missed", date: t.date, tone: "bad", title: `Missed: ${title}`, delta: "missed" });
    else if (t.c >= t.fullU - 1e-9) out.push({ id: id("done"), kind: "done", date: t.date, tone: "good", title: liftU ? `${title}: all ${liftU} sets` : title, detail: t.eased ? "Eased by the plan: counts as kept" : undefined, delta: "full credit" });
    else out.push({ id: id("part"), kind: "partial", date: t.date, tone: "neutral", title: liftU && liftC < liftU ? `${title}: ${liftC} of ${liftU} sets` : `${title}: part done`, delta: liftU && liftC < liftU ? `${liftC}/${liftU} sets` : `${Math.round((100 * t.c) / t.fullU)}%` });

    if (t.day?.movedFrom && t.date <= today) out.push({ id: id("moved"), kind: "moved", date: t.date, tone: "neutral", title: `Moved from ${dowName(t.day.movedFrom)}`, delta: "no change" });
    for (const r of t.runs) {
      if (r.from) out.push({ id: id("other", r.block.title), kind: "done_other_day", date: t.date, tone: "good", title: `${r.block.title}: done ${dowName(r.from)}`, delta: r.c >= r.u ? "full credit" : `${Math.round((100 * r.c) / r.u)}%` });
      if (r.c > 0 && r.c < r.u && r.short) out.push({ id: id("short", r.block.title), kind: "run_short", date: t.date, tone: "neutral", title: `${r.block.title}: ${r.short}`, delta: `${Math.round((100 * r.c) / r.u)}%` });
    }
    if (!t.grace && t.c > 0)
      for (const l of t.lines)
        if (l.key && l.c < l.u) out.push({ id: id("short", l.key), kind: "sets_short", date: t.date, tone: "neutral", key: l.key, title: `${l.name}: ${l.c} of ${l.u} sets`, delta: `${l.c}/${l.u} sets` });
    for (const b of t.blocks)
      for (const s of Object.values(b.swaps ?? {})) if (t.date <= today) out.push({ id: id("swap", s.from), kind: "swapped", date: t.date, tone: "neutral", key: s.to, title: `${name(s.from)} swapped for ${s.name}`, delta: "same credit" });
  }
  for (const [key, e] of t.extraSets) {
    const kind = t.state === "planned" && e.onDay ? "set_extra" : "exercise_extra";
    const why = noExtra ?? (e.light ? "Light week: the plan says less" : null);
    out.push({
      id: id(kind, key),
      kind,
      date: t.date,
      tone: why ? "neutral" : "good",
      key,
      title: `${name(key)}: ${e.n} extra set${e.n === 1 ? "" : "s"}`,
      detail: why ?? (kind === "exercise_extra" ? "Not in the plan that day" : undefined),
      delta: why ? "not counted" : `+${e.n} set${e.n === 1 ? "" : "s"}`,
    });
  }
  for (const [i, l] of t.extraLogs.entries()) {
    const min = l.duration_sec ? Math.round(l.duration_sec / 60) : null;
    out.push({
      id: id("xlog", String(i)),
      kind: "extra_workout",
      date: t.date,
      tone: noExtra ? "neutral" : "good",
      title: `Extra ${l.kind === "walk" ? "walk" : "run"}${l.km ? ` ${fmtNum(l.km)} km` : min ? ` ${min} min` : ""}`,
      detail: noExtra ?? undefined,
      delta: noExtra ? "not counted" : "counts extra",
    });
  }
  return out;
}
