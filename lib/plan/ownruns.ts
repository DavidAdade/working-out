// Weeks built around the person's own running plan (another app, a coach): the runs are fixed and
// the lifting is placed around them. Every rule here works from the list of runs alone, so any
// profile with any run days gets a sensible week.
//
// The rules, in order:
//  1. Runs stay on their day and come first. A race day carries nothing else.
//  2. A run of LONG_KM or more gets abs only.
//  3. Legs never fall the day before a run. One full leg session a week, alone on a free day (after the
//     week's long run for preference); a short one may follow an easy run under LONG_KM. At most
//     LEGS_PER_WEEK, LEG_GAP_DAYS apart (across weeks too).
//  4. Upper body twice a week, A then B in turn, each on a free day of its own (never a leg day) and
//     LEG_GAP_DAYS apart: resting the day before a hard run where there's a choice, then spaced 3–4 days.
//     Lifting takes free days up to MAX_DAYS training days, so the upper body gets the depth and one
//     rest day always stays.
//  5. Run days without legs get abs. Everything else is rest.
//  6. Around a race: no legs from 3 days before to the day after, nothing the day before,
//     2 sets (light) for all lifting in the last 3 days, and for legs from a week before to 4 days after.

import { addDays, daysBetween, type ISODate } from "./dates.ts";
import { ABS, LEGS, UPPER, light, type Block } from "./templates.ts";

export interface OwnRun {
  date: ISODate;
  km: number;
  /** As the running plan names it, e.g. "400m Repeats" */
  title: string;
  /** Intervals, tempo, repeats. Read from the title when absent */
  hard?: boolean;
  race?: boolean;
}

/** Runs this long or longer get abs only */
export const LONG_KM = 5.5;
export const LEGS_PER_WEEK = 2;
export const UPPER_PER_WEEK = 2;
/** Days between two leg sessions, and between two upper sessions */
export const LEG_GAP_DAYS = 2;
/** Most training days in a week: lifting never takes the last rest day */
export const MAX_DAYS = 6;

const HARD = /repeat|interval|tempo|fartlek|hill|race|progressive run|\d00s|\bmiles\b|\d\s*[×x]\s*\d/i;
/** "Easy 3 miles", "Recovery run", "Easy 5k (Hillside Park)": the title says it's easy, whatever else is in it */
const EASY = /\b(easy|recovery)\b/i;
export const ownHard = (r: OwnRun) => !!r.race || (r.hard ?? (HARD.test(r.title) && !EASY.test(r.title)));

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The saved list, checked and in date order: one run a day, the first one listed wins. */
export function cleanOwnRuns(raw: unknown): OwnRun[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<ISODate, OwnRun>();
  for (const r of raw as Partial<OwnRun>[]) {
    const km = Number(r?.km);
    if (!r || typeof r.date !== "string" || !ISO.test(r.date) || !(km > 0) || km > 200 || byDate.has(r.date)) continue;
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 60) : `${km} km run`;
    byDate.set(r.date, { date: r.date, km, title, ...(typeof r.hard === "boolean" ? { hard: r.hard } : {}), ...(r.race ? { race: true } : {}) });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** One run per line, "2026-11-16, 5, Easy Run" (add "hard" or "race" at the end), for Settings. */
export function parseOwnRuns(text: string): { runs: OwnRun[]; bad: string[] } {
  const bad: string[] = [];
  const rows: Partial<OwnRun>[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [date, km, ...rest] = line.split(",").map((x) => x.trim());
    const flags = rest.filter((x) => /^(hard|easy|race)$/i.test(x)).map((x) => x.toLowerCase());
    const title = rest.filter((x) => !/^(hard|easy|race)$/i.test(x)).join(", ");
    // A date that doesn't exist (30 February) would silently drop the run
    if (!ISO.test(date ?? "") || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || !(Number(km?.replace(/\s*km$/i, "")) > 0)) {
      bad.push(line);
      continue;
    }
    rows.push({ date, km: Number(km.replace(/\s*km$/i, "")), title, ...(flags.includes("race") ? { race: true } : {}), ...(flags.includes("hard") ? { hard: true } : flags.includes("easy") ? { hard: false } : {}) });
  }
  return { runs: cleanOwnRuns(rows), bad };
}

export const formatOwnRuns = (runs: OwnRun[]) =>
  runs.map((r) => [r.date, r.km, r.title, ...(r.race ? ["race"] : r.hard === true ? ["hard"] : r.hard === false ? ["easy"] : [])].join(", ")).join("\n");

export interface OwnDay {
  date: ISODate;
  blocks: Block[];
  /** Races stay on their day */
  fixed: boolean;
}

/** A day the plan itself fixes inside these weeks (its time trial or race): kept as it is and treated as a race */
export interface Anchor {
  date: ISODate;
  blocks: Block[];
}

const fmtKm = (km: number) => `${+km.toFixed(1)} km`;

function runBlock(r: OwnRun, long: boolean): Block {
  const hard = ownHard(r);
  if (r.race) return { kind: "test", title: r.title, items: [`${fmtKm(r.km)} race`, "Warm up 10–15 min with a few strides", "Log it as a Test with the distance. It updates your paces."], hard: true };
  return {
    kind: "run",
    title: r.title,
    items: [`${fmtKm(r.km)}, as your running plan sets it`, hard ? "Warm-up and cool-down included" : "Easy enough to talk"],
    hard,
    ...(long ? { km: r.km } : { dist: r.km }),
  };
}

const noCarry = (b: Block, note?: string): Block => ({ ...b, carry: false, ...(note ? { note } : {}) });

/**
 * The lifting for each week in `weekStarts` (Mondays, in order), around `runs`. Weeks are laid out in turn
 * so leg days keep their distance across the weekend.
 */
export function ownWeeks(runs: OwnRun[], weekStarts: ISODate[], anchors: Anchor[] = []): Map<ISODate, OwnDay[]> {
  const anchorOn = new Map(anchors.map((a) => [a.date, a]));
  const runOn = new Map(runs.filter((r) => !anchorOn.has(r.date)).map((r) => [r.date, r]));
  const races = [...runs.filter((r) => r.race && !anchorOn.has(r.date)).map((r) => r.date), ...anchorOn.keys()];
  const busy = (d: ISODate) => runOn.has(d) || anchorOn.has(d);
  /** Days from `d` to the nearest race that matter: positive before it, negative after */
  const toRace = (d: ISODate) => races.map((r) => daysBetween(d, r)).filter((n) => n >= -7 && n <= 7).sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? null;
  const raceDay = (d: ISODate) => toRace(d) === 0;
  const eve = (d: ISODate) => toRace(d) === 1;
  const noLegs = (d: ISODate) => {
    const n = toRace(d);
    return n != null && n >= -1 && n <= 3;
  };
  // All lifting is light in the last 3 days; legs for the whole week before and the first 4 days after
  const lightDay = (d: ISODate) => {
    const n = toRace(d);
    return n != null && n >= 1 && n <= 3;
  };
  const lightLegs = (d: ISODate) => {
    const n = toRace(d);
    return n != null && n >= -4;
  };

  const out = new Map<ISODate, OwnDay[]>();
  let lastLeg: ISODate | null = null;
  let lastUpper: ISODate | null = null;
  let upperCount = 0;

  for (const ws of weekStarts) {
    const dates = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(ws, n));
    const free = dates.filter((d) => !busy(d));
    const runDays = dates.filter((d) => runOn.has(d));
    const apart = (d: ISODate, others: (ISODate | null)[]) => others.every((x) => !x || Math.abs(daysBetween(x, d)) >= LEG_GAP_DAYS);

    // Lifting-only days this week can take
    const slots = Math.max(0, MAX_DAYS - dates.filter(busy).length);
    const hardNext = (d: ISODate) => {
      const r = runOn.get(addDays(d, 1));
      return anchorOn.has(addDays(d, 1)) || (!!r && ownHard(r));
    };
    const longest0 = Math.max(0, ...runDays.map((d) => (runOn.get(d)!.race ? 0 : runOn.get(d)!.km)));
    const longDay = longest0 >= LONG_KM ? runDays.find((d) => !runOn.get(d)!.race && runOn.get(d)!.km === longest0) ?? null : null;
    const legOk = (d: ISODate) => !busy(addDays(d, 1)) && !noLegs(d) && !eve(d);
    const legs = new Map<ISODate, "full" | "short">();
    // One full leg day on a free day, after the long run for preference
    const after = (d: ISODate) => Number(!!longDay && d > longDay);
    const fullDay = slots > 0 ? free.filter((d) => legOk(d) && apart(d, [lastLeg])).sort((a, b) => after(b) - after(a) || (a < b ? -1 : 1))[0] : undefined;
    if (fullDay) legs.set(fullDay, "full");
    // A short one after an easy short run
    for (const d of runDays) {
      const r = runOn.get(d)!;
      if (legs.size < LEGS_PER_WEEK && ![...legs.values()].includes("short") && r.km < LONG_KM && !ownHard(r) && legOk(d) && apart(d, [lastLeg, ...legs.keys()])) legs.set(d, "short");
    }
    const fullDays = fullDay ? [fullDay] : [];

    // Upper: on free days of their own, apart, resting the day before a hard run where there's a choice
    const cands = free.filter((d) => !legs.has(d) && !eve(d) && apart(d, [lastUpper]));
    const want = Math.min(UPPER_PER_WEEK, slots - fullDays.length);
    const options: ISODate[][] = [[]];
    for (const a of cands) {
      options.push([a]);
      for (const b of cands) if (b > a && daysBetween(a, b) >= LEG_GAP_DAYS) options.push([a, b]);
    }
    const score = (o: ISODate[]) => o.length * 1000 - o.filter(hardNext).length * 100 - (o.length === 2 ? Math.abs(daysBetween(o[0], o[1]) - 3.5) * 10 : 0) - (o[0] ? dates.indexOf(o[0]) * 0.1 : 0);
    const picked = options.filter((o) => o.length <= want).sort((a, b) => score(b) - score(a))[0] ?? [];
    const upper = new Map<ISODate, Block>();
    const sessions = [UPPER.fullA, UPPER.fullB];
    for (const d of picked) upper.set(d, sessions[upperCount++ % 2]);
    // A second, short leg day on a spare free day, only while the week keeps two rest days
    for (const d of free) {
      const training = new Set([...dates.filter(busy), ...legs.keys(), ...upper.keys()]).size;
      if (training < MAX_DAYS - 1 && legs.size < LEGS_PER_WEEK && !upper.has(d) && !legs.has(d) && legOk(d) && apart(d, [lastLeg, ...legs.keys()])) legs.set(d, "short");
    }

    const abs = [ABS.condoA, ABS.condoB, ABS.gym];
    const longest = Math.max(0, ...runDays.map((d) => (runOn.get(d)!.race ? 0 : runOn.get(d)!.km)));
    const days: OwnDay[] = [];
    for (const d of dates) {
      const a = anchorOn.get(d);
      if (a) {
        days.push({ date: d, blocks: a.blocks, fixed: true });
        continue;
      }
      const r = runOn.get(d);
      const blocks: Block[] = [];
      const lift = (b: Block, isLegs = false) => blocks.push(lightDay(d) || (isLegs && lightLegs(d)) ? light(b) : b);
      if (r) blocks.push(runBlock(r, !r.race && r.km === longest && r.km >= LONG_KM));
      const leg = legs.get(d);
      if (leg === "short") lift(LEGS.short, true);
      if (leg === "full") lift(noCarry(LEGS.C_gym, "Leave 2 reps in reserve. Tomorrow has no run."), true);
      const up = upper.get(d);
      if (up) lift(noCarry(up, busy(addDays(d, 1)) ? "Upper body only today: there's a run tomorrow, so the legs stay fresh." : undefined));
      if (r && !r.race && !leg && !eve(d)) lift(abs[runDays.indexOf(d) % abs.length]);
      if (blocks.length) days.push({ date: d, blocks, fixed: !!r?.race });
    }
    out.set(ws, days);
    lastLeg = [...legs.keys()].sort().at(-1) ?? lastLeg;
    lastUpper = [...upper.keys()].sort().at(-1) ?? lastUpper;
  }
  return out;
}
