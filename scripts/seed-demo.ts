// Fills the demo account (automation@mailinator.com) with about 26 weeks of made-up, good-looking history for
// screen recordings: steady runs getting faster, 5K tests falling toward the goal, lifts climbing in real plate
// steps, a few early misses, then six clean weeks. Today is staged mid-workout: every set of today's lifting
// session is logged except the last exercise's 3 sets, so a take can tick them and finish the workout.
//
//   DEMO_PASSWORD='…' npm run seed:demo            # creates the account if it isn't there, then resets it
//   npm run seed:demo -- --dry                     # builds the same data and prints what the app would show
//   npm run seed:demo -- --dry --paths             # also prints each lift's weight × reps, session by session
//
// Needs SUPABASE_SERVICE_ROLE_KEY. Only ever touches automation@mailinator.com (the address is fixed, and anything
// that isn't @mailinator.com is refused). Safe to re-run before every take: it clears that account's rows first.
// The password is only used to create the account; an existing account keeps its own.

import { generatePlan, isHard, moveDay, weekForDate, type Move, type PlanSettings, type Week, type Day } from "../lib/plan/generate.ts";
import { addDays, daysBetween, mondayOf, todayIn, weekday } from "../lib/plan/dates.ts";
import { EXERCISES, exerciseByKey, parseLine, type Exercise, type Target } from "../lib/plan/exercises.ts";
import { planFor } from "../lib/plan/adapt.ts";
import { accountability, BANDS, type AcctLog, type AcctSet } from "../lib/plan/accountability.ts";
import { onTrack, wins, STATUS_LABEL } from "../lib/plan/ontrack.ts";
import { compareSession, sessions, suggestWeight } from "../lib/plan/progress.ts";
import { mondaysBetween, strengthIndex } from "../lib/plan/stats.ts";
import { completion, dayExercises, finishesDay, LIFT_KINDS, sessionDate } from "../lib/plan/workout.ts";
import { duration, pace } from "../lib/plan/format.ts";

const dry = process.argv.includes("--dry");
const email = "automation@mailinator.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!url || !key)) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)");
if (!email.endsWith("@mailinator.com")) throw new Error(`Refusing to seed ${email}: demo accounts must be @mailinator.com`);

const headers = { apikey: key ?? "", Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function api(path: string, init: RequestInit = {}) {
  if (dry) return path.startsWith("/auth/") ? { users: [{ id: "dry-run", email }] } : null;
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Deterministic "random" so every reset gives the same data (for the same day)
let seed = 20261;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a: number, b: number) => a + rand() * (b - a);
const r1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const LB = 0.45359237;

const TZ = "America/Toronto";
const today = todayIn(TZ);
const thisMonday = mondayOf(today);
/** Full weeks of history before this one: today always falls in week 27, a normal (not cutback) build week */
const WEEKS_BACK = 26;
const start = addDays(thisMonday, -7 * WEEKS_BACK);
const weekStart = (n: number) => addDays(start, 7 * (n - 1));
const settings: PlanSettings = {
  startDate: start,
  recoveryStart: null,
  returningFromInjury: false,
  // Friday four weeks out: this week is Build, then a cutback, two more build weeks, sharpen and the time trial
  timeTrialDate: addDays(thisMonday, 7 * 4 + 4),
  raceDate: null,
  current5kSec: 34 * 60 + 30,
  goal5kSec: 29 * 60 + 59,
};

/* ---------- the story: what was missed, skipped, moved and tested ---------- */

// [week, weekday offset from Monday]. All in the first three months; the last 6 weeks are fully kept
const MISSED: [number, number][] = [[2, 3], [4, 1], [6, 0], [11, 2], [13, 3]];
// An easy run skipped the evening before, and a lifting day skipped the Sunday before (its upper work folds onto Monday)
const SKIPPED: { week: number; off: number; madeDaysBefore: number }[] = [
  { week: 5, off: 1, madeDaysBefore: 1 },
  { week: 10, off: 3, madeDaysBefore: 4 },
];
/** An easy Tuesday run done on the Saturday instead */
const MOVED_WEEK = 22;
/** 5K tests run in place of Wednesday's session (week 3 is the plan's own baseline test), seconds */
const TESTS_5K: Record<number, number> = { 3: 34 * 60 + 22, 7: 33 * 60 + 10, 14: 32 * 60 + 5, 19: 31 * 60 + 20 };
const LAST_5K = 30 * 60 + 20;
const TEN_K = 68 * 60 + 40;
const CLASSES: { week: number; off: number; title: string; min: number; rpe: number }[] = [
  { week: 21, off: 5, title: "Yoga", min: 60, rpe: 4 },
  { week: 23, off: 6, title: "Spin", min: 45, rpe: 7 },
  { week: 26, off: 5, title: "Yoga", min: 60, rpe: 4 },
];

/* ---------- lifts: where each one ends (lb), its plate step and about how many steps it climbed ---------- */

type Ev = "up" | "reps" | "flat" | "down";
interface Lift {
  end: number;
  inc: number;
  /** Weight increases over the period, more when the reps run out */
  ups: number;
  /** The last two full sessions: up = heavier, reps = same weight more reps, down = one lighter day */
  tail?: Ev[];
  /** One lighter day somewhere in the middle (only where a plate step is under 5%) */
  dip?: boolean;
}
const LIFTS: Record<string, Lift> = {
  rdl: { end: 185, inc: 5, ups: 14, dip: true },
  "bulgarian-split-squat": { end: 35, inc: 2.5, ups: 8 },
  "leg-curl": { end: 95, inc: 5, ups: 9 },
  "step-up": { end: 35, inc: 2.5, ups: 8 },
  "sl-calf-raise": { end: 40, inc: 2.5, ups: 10 },
  "lat-pulldown": { end: 150, inc: 5, ups: 12, tail: ["down", "up"] },
  "cable-row": { end: 135, inc: 5, ups: 11, tail: ["up", "down"] },
  "face-pull": { end: 50, inc: 2.5, ups: 10 },
  curl: { end: 35, inc: 2.5, ups: 7, tail: ["up", "reps"] },
  "cable-crunch": { end: 100, inc: 5, ups: 10 },
  "pallof-press": { end: 45, inc: 2.5, ups: 10 },
  "db-press": { end: 55, inc: 2.5, ups: 10, dip: true },
  "db-ohp": { end: 40, inc: 2.5, ups: 8 },
  "lateral-raise": { end: 20, inc: 2.5, ups: 5, tail: ["up", "reps"] },
  "triceps-ext": { end: 45, inc: 2.5, ups: 10 },
  "sl-db-rdl": { end: 45, inc: 2.5, ups: 10 },
  "goblet-split-squat": { end: 50, inc: 2.5, ups: 12 },
  "sl-calf-raise-bent": { end: 30, inc: 2.5, ups: 8, tail: ["up", "reps"] },
  "db-row": { end: 60, inc: 2.5, ups: 10, dip: true },
  "rear-delt-fly": { end: 20, inc: 2.5, ups: 5, tail: ["reps", "up"] },
  "hammer-curl": { end: 35, inc: 2.5, ups: 7 },
  "skull-crusher": { end: 30, inc: 2.5, ups: 7 },
  "russian-twist": { end: 30, inc: 2.5, ups: 8 },
};
const DEFAULT_LIFT: Lift = { end: 40, inc: 2.5, ups: 8 };
/** Bodyweight reps and timed holds: first session → last */
const BODY: Record<string, [number, number]> = {
  "push-up": [8, 21],
  "hanging-knee-raise": [8, 15],
  "dead-bug": [10, 16],
  "reverse-crunch": [10, 18],
  "step-down": [8, 13],
  "sl-glute-bridge": [10, 18],
  plank: [40, 80],
  "side-plank": [25, 50],
  "hollow-hold": [20, 45],
};
/** A plate step this small against the bar is a lighter day, not a "dropped 5%" warning */
const DIP_MAX = 0.048;
/** Where the plan's long run tops out (generate.ts) */
const LONG_CAP = 12;
/**
 * What the dashboard really gets: app/page.tsx asks for 5000 set_logs, but the API hands back at most 1000 rows a
 * read (PostgREST max-rows on this project), newest first. So the numbers printed below use the newest 1000.
 */
const APP_SET_ROWS = 1000;

/**
 * One lift's full sessions, oldest first: weight (lb) and top reps. Double progression, so no session ever reads
 * as a stall (two flat sessions in a row) or a drop (5%+ lighter): reps climb at a weight, then the weight steps up.
 */
function liftPath(n: number, lift: Lift, lo: number, cap: number): { w: number; reps: number; ev: Ev | null }[] {
  if (n <= 0) return [];
  const tail = (lift.tail ?? ["up", "up"]).slice(-Math.max(0, n - 1));
  const head = n - 1 - tail.length;
  const slots: Ev[] = Array.from({ length: head }, () => "reps");
  const headUps = Math.max(0, Math.min(head, lift.ups - tail.filter((e) => e === "up").length));
  for (let k = 0; k < headUps; k++) {
    let p = Math.min(head - 1, Math.max(0, Math.floor(((k + 0.5 + between(-0.3, 0.3)) * head) / headUps)));
    while (slots[p] === "up") p = (p + 1) % head;
    slots[p] = "up";
  }
  // A tail that opens on held weight or a lighter day follows a step up, so it can't read as a stall
  if (head > 0 && tail[0] !== "up") slots[head - 1] = "up";
  if (lift.dip) {
    const ok = slots.flatMap((e, i) => (i >= 6 && i < head - 2 && e === "reps" && slots[i - 1] === "up" ? [i] : []));
    if (ok.length) slots[ok[Math.floor(rand() * ok.length)]] = "down";
  }
  // Walk it once to settle what each session really is: reps run out, a flat one is allowed, never two not-up in a row
  const evs: Ev[] = [];
  let r = 0;
  let notUp = false;
  for (const e of [...slots, ...tail]) {
    let ev: Ev = e;
    if (e === "reps") ev = r < cap ? "reps" : notUp ? "up" : "flat";
    if (e === "down" && notUp) ev = "up";
    if (ev === "up") r = 0;
    if (ev === "reps") r++;
    notUp = ev === "flat" || ev === "down";
    evs.push(ev);
  }
  const first = Math.max(lift.inc * 2, lift.end - lift.inc * evs.filter((e) => e === "up").length);
  const out: { w: number; reps: number; ev: Ev | null }[] = [{ w: first, reps: lo, ev: null }];
  let base = first;
  r = 0;
  for (const e of evs) {
    let ev = e;
    // Too light for a plate step down to stay under 5%: hold the weight for one more rep instead
    if (ev === "down" && lift.inc / base >= DIP_MAX) ev = "reps";
    if (ev === "up") {
      base += lift.inc;
      r = 0;
    } else if (ev === "reps") r++;
    out.push(ev === "down" ? { w: base - lift.inc, reps: lo + 1, ev } : { w: base, reps: lo + r, ev });
  }
  return out;
}

/** Bodyweight reps or hold seconds per full session: a slow climb with plateaus, never falling */
function bodyPath(n: number, [from, to]: [number, number], step: number): number[] {
  let best = from;
  return Array.from({ length: n }, (_, i) => {
    const v = roundTo(from + ((to - from) * i) / Math.max(1, n - 1) + between(-0.4, 0.4) * step, step);
    best = Math.max(best, Math.min(to, v));
    return i === n - 1 ? to : best;
  });
}

async function main() {
  /* ---------- the account ---------- */
  const users = (await api("/auth/v1/admin/users?per_page=1000")) as { users: { id: string; email: string }[] };
  let user = users.users.find((u) => u.email?.toLowerCase() === email);
  const existed = !!user;
  if (!user) {
    const password = process.env.DEMO_PASSWORD;
    if (!password) throw new Error(`No user ${email} yet. Set DEMO_PASSWORD to create it, e.g. DEMO_PASSWORD='…' npm run seed:demo`);
    user = (await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) })) as { id: string; email: string };
    if (!user?.id) throw new Error(`Couldn't create ${email}`);
  }
  const uid = user.id;

  /* ---------- the plan, with this account's skips and moves ---------- */
  const skips = SKIPPED.map((s) => ({ date: addDays(weekStart(s.week), s.off), createdAt: `${addDays(weekStart(s.week), s.off - s.madeDaysBefore)}T23:00:00Z` }));
  const missed = new Set(MISSED.map(([w, off]) => addDays(weekStart(w), off)));
  const base = generatePlan(settings);
  const moves: Move[] = [];
  // Today does Monday's session (legs, pull, abs: it ends on a weighted exercise, so the last sets show a suggested
  // weight and start the rest timer). On any other weekday Monday's workout trades places with today's, or moves
  // onto today's rest day: the app's own "Move", so it works whatever day this runs.
  const week0 = weekForDate(base, today);
  if (!week0) throw new Error("Today isn't in the plan");
  if (today !== thisMonday) {
    const m = moveDay(week0, thisMonday, today);
    if (!m) throw new Error(`Can't move Monday's workout to today (${today})`);
    moves.push(...m);
  }
  const movedWeek = weekForDate(base, weekStart(MOVED_WEEK))!;
  moves.push(...(moveDay(movedWeek, addDays(movedWeek.start, 1), addDays(movedWeek.start, 5)) ?? []));
  const weeks = generatePlan(settings, { skips: skips.map((s) => s.date), moves });
  const todayDay = weeks.flatMap((w) => w.days).find((d) => d.date === today);
  if (!todayDay || !dayExercises(todayDay).length) throw new Error("Today has no lifting workout to stage");

  // The exercise left for the camera: the day's last one (the last weighted one, if that's a hold or bodyweight)
  const order = dayExercises(todayDay);
  const staged = [...order].reverse().find((x) => exerciseByKey(x.key)?.load === "weight") ?? order.at(-1)!;

  /* ---------- every lifting line done, by exercise ---------- */
  interface Occ {
    date: string;
    ex: Exercise;
    target: Target;
    light: boolean;
    count: number;
  }
  const done = weeks.flatMap((w) => w.days.map((d) => ({ d, w }))).filter(({ d }) => d.date <= today && !d.skipped && !missed.has(d.date) && d.blocks.length);
  const occs = new Map<string, Occ[]>();
  for (const { d, w } of done) {
    for (const b of d.blocks) {
      if (!LIFT_KINDS.includes(b.kind)) continue;
      const light = w.cutback || !!b.light || !!b.foldedFrom;
      for (const line of b.items) {
        const p = parseLine(line);
        if (!p) continue;
        if (d.date === today && p.exercise.key === staged.key) continue;
        const list = occs.get(p.exercise.key) ?? [];
        // One session per exercise per day
        if (list.some((o) => o.date === d.date)) continue;
        list.push({ date: d.date, ex: p.exercise, target: p.target, light, count: light ? Math.min(p.target.sets, 2) : p.target.sets });
        occs.set(p.exercise.key, list);
      }
    }
  }

  const sets: Record<string, unknown>[] = [];
  const summary: string[] = [];
  const addSet = (o: Occ, n: number, weight: number | null, reps: number | null, sec: number | null) =>
    sets.push({ user_id: uid, date: o.date, exercise_key: o.ex.key, set_no: n, weight, unit: "lb", reps, duration_sec: sec, light_week: o.light });
  for (const [k, list] of occs) {
    const ex = list[0].ex;
    const full = list.filter((o) => !o.light);
    if (ex.load === "weight") {
      const lift = LIFTS[k] ?? DEFAULT_LIFT;
      const lo = full[0]?.target.reps ?? list[0].target.reps ?? 10;
      const top = full[0]?.target.repsMax ?? null;
      const path = liftPath(full.length, lift, lo, top ? top - lo : 3);
      let i = 0;
      let cur = path[0] ?? { w: lift.end, reps: lo, ev: null };
      for (const o of list) {
        if (o.light) {
          for (let s = 1; s <= o.count; s++) addSet(o, s, Math.max(lift.inc, roundTo(cur.w * 0.8, lift.inc)), o.target.reps ?? lo, null);
          continue;
        }
        cur = path[i++];
        // The staged exercise's last session hits every rep, so today's row suggests the next weight up
        const allReps = k === staged.key && i === path.length;
        const need = o.target.repsMax ?? o.target.reps ?? lo;
        for (let s = 1; s <= o.count; s++) {
          let reps = cur.reps;
          if (allReps) reps = Math.max(reps, need);
          else if (s === o.count && cur.reps > lo && rand() < 0.45) reps = cur.reps - 1;
          else if (s === o.count && cur.reps === lo && cur.ev === "up" && rand() < 0.15) reps = lo - 1;
          addSet(o, s, cur.w, reps, null);
        }
      }
      summary.push(`${ex.name} ${path[0]?.w ?? "?"}→${path.at(-1)?.w ?? "?"}`);
      if (process.argv.includes("--paths")) console.log(`  ${k}: ${path.map((x) => `${x.w}×${x.reps}`).join(" ")}`);
    } else {
      const timed = ex.load === "time";
      const range = BODY[k] ?? (timed ? [30, 50] : [10, 15]);
      const path = bodyPath(full.length, range, timed ? 5 : 1);
      let i = 0;
      let cur = path[0] ?? range[0];
      for (const o of list) {
        if (!o.light) cur = path[i++];
        const v = o.light ? Math.max(timed ? 15 : 5, roundTo(cur * 0.8, timed ? 5 : 1)) : cur;
        for (let s = 1; s <= o.count; s++) {
          const x = !o.light && s === o.count && s > 1 && rand() < 0.35 ? v - (timed ? 5 : 1) : v;
          addSet(o, s, null, timed ? null : x, timed ? x : null);
        }
      }
    }
  }

  /* ---------- runs, tests, classes and the lifting days' own log rows ---------- */
  const logs: Record<string, unknown>[] = [];
  const workouts: Record<string, unknown>[] = [];
  const at = (date: string, hour: number, min: number) => `${date}T${String(hour).padStart(2, "0")}:${String(Math.floor(min)).padStart(2, "0")}:00Z`;
  // The latest 5K test: this week's Wednesday session if it's already behind us, else last week's
  const wedOf = (monday: string) => weeks.flatMap((w) => w.days).find((d) => (d.movedFrom ?? d.date) === addDays(monday, 2))?.date;
  const lastTest = [wedOf(thisMonday), wedOf(addDays(thisMonday, -7))].find((d) => d && d < today);
  const tests = new Map<string, number>(Object.entries(TESTS_5K).map(([w, sec]) => [addDays(weekStart(Number(w)), 2), sec]));
  if (lastTest) tests.set(lastTest, LAST_5K);
  const TEST_NOTES = ["Even splits, strong last km", "Cool morning, felt smooth", "Went out controlled, pushed the last 2 km", "Legs felt good the whole way"];
  let longest = 0;
  for (const { d, w } of done) {
    if (d.date === today) continue;
    const i = w.index ?? 1;
    // Easy pace eases from about 7:40/km to about 6:30/km
    const easy = 460 - (68 * (i - 1)) / WEEKS_BACK + between(-6, 6);
    const recent = daysBetween(d.date, today) <= 28;
    const knee = recent ? 0 : rand() < (i <= 6 ? 0.3 : 0.18) ? 1 : 0;
    for (const b of d.blocks) {
      if (b.kind !== "run" && b.kind !== "test") continue;
      const row = (kind: string, title: string, km: number, sec: number, rpe: number, notes: string | null = null) =>
        logs.push({ user_id: uid, date: d.date, kind, title, km, duration_sec: Math.round(sec), rpe, pain: { knee }, notes, auto: false, created_at: at(d.date, 11, between(5, 55)) });
      const five = tests.get(d.date);
      if (five) row("test", b.kind === "test" ? b.title : "5K test", 5, five, 9, TEST_NOTES[tests.size ? [...tests.keys()].sort().indexOf(d.date) % TEST_NOTES.length : 0]);
      else if (b.kind === "test") row("test", b.title, 10, TEN_K, 9, "First 10K. Steady, negative split");
      else if (b.km) {
        // The long run: once the plan tops out, each one goes a touch further than the last
        const km = !w.cutback && (b.km >= longest || b.km >= LONG_CAP) ? r1(Math.max(b.km, longest + (longest ? 0.2 : 0))) : b.km;
        row("run", b.title, km, km * (easy + 8), 5 + Math.round(rand()));
        longest = Math.max(longest, km);
      } else if (isHard(b)) {
        // Warm-up, the session and cool-down as one run: quicker on average, never the week's longest
        const km = r1(Math.min(between(5.6, 6.8), Math.max(4.5, longest - 0.6)));
        row("run", b.title, km, km * (easy - 28), 7 + Math.round(rand()));
      } else {
        const min = Number(/(\d+) min/.exec(b.title)?.[1] ?? 30);
        const km = r1((min * 60) / easy);
        row("run", b.title, km, km * easy, 3 + Math.round(rand()));
      }
      if (five || b.kind === "test") longest = Math.max(longest, five ? 5 : 10);
    }
  }
  for (const { d } of done) {
    const lifts = d.blocks.filter((b) => LIFT_KINDS.includes(b.kind) && b.items.some((l) => parseLine(l)));
    if (!lifts.length) continue;
    const live = d.date === today;
    const began = live ? new Date(Date.now() - 6 * 60e3) : new Date(Date.parse(at(d.date, 22, between(0, 40))));
    logs.push({ user_id: uid, date: d.date, kind: "strength", title: lifts.map((b) => b.title).join(" + "), km: null, duration_sec: null, rpe: null, pain: {}, notes: null, auto: true, created_at: began.toISOString() });
    // Past workouts were started and ended; today's is still running
    workouts.push({ user_id: uid, plan_date: sessionDate(d), started_at: began.toISOString(), ended_at: live ? null : new Date(began.getTime() + between(48, 72) * 60e3).toISOString(), auto_ended: false });
  }
  for (const c of CLASSES) {
    const date = addDays(weekStart(c.week), c.off);
    logs.push({ user_id: uid, date, kind: "class", title: c.title, km: null, duration_sec: c.min * 60, rpe: c.rpe, pain: {}, notes: null, auto: false, created_at: at(date, 15, between(0, 50)) });
  }
  // This morning's check-in, so Today opens on the workout rather than the check-in card
  logs.push({ user_id: uid, date: today, kind: "check", title: "Morning check-in", km: null, duration_sec: null, rpe: null, pain: { knee: 0 }, notes: null, auto: false, created_at: new Date(Date.now() - 5 * 3600e3).toISOString() });

  /* ---------- write: this account only ---------- */
  const profile = {
    display_name: "David",
    timezone: TZ,
    start_date: settings.startDate,
    recovery_start: null,
    returning_from_injury: false,
    time_trial_date: settings.timeTrialDate,
    race_date: null,
    race_name: null,
    current_5k_sec: settings.current5kSec,
    goal_5k_sec: settings.goal5kSec,
    half_goal_min_sec: null,
    half_goal_max_sec: null,
    pain_areas: ["knee"],
    gates: {},
    hide_dates: true,
    weight_unit: "lb",
    rest_timer: true,
    rest_seconds: null,
    own_runs: [],
    own_runs_from: null,
  };
  const saved = (await api(`/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(profile) })) as unknown[] | null;
  if (!dry && !saved?.length) await api("/rest/v1/profiles", { method: "POST", body: JSON.stringify({ id: uid, ...profile }) });
  for (const t of ["set_logs", "logs", "day_overrides", "day_moves", "exercise_swaps", "supersets", "activity_events", "workout_sessions", "day_copies", "ai_reviews"])
    await api(`/rest/v1/${t}?user_id=eq.${uid}`, { method: "DELETE" });
  const post = async (table: string, rows: Record<string, unknown>[]) => {
    for (let i = 0; i < rows.length; i += 500) await api(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(rows.slice(i, i + 500)) });
  };
  const skipRows = skips.map((s) => ({ user_id: uid, date: s.date, status: "skipped", created_at: s.createdAt }));
  const moveRows = moves.map((m) => ({ user_id: uid, from_date: m.from, to_date: m.to }));
  await post("day_overrides", skipRows);
  await post("day_moves", moveRows);
  await post("logs", logs);
  await post("set_logs", sets);
  await post("workout_sessions", workouts);

  /* ---------- what the app will show ---------- */
  const acctLogs = logs as unknown as (AcctLog & { kind: string; km: number | null; duration_sec: number | null })[];
  const allSets = sets.map((s) => ({ ...s, weight_kg: s.weight == null ? null : Math.round(Number(s.weight) * LB * 100) / 100, plan_date: null })) as unknown as (AcctSet & { plan_date: string | null })[];
  // As the app loads them: newest first, capped
  const acctSets = [...allSets].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, APP_SET_ROWS);
  const name = (k: string) => exerciseByKey(k)?.name ?? k;
  const plan = planFor({ settings, logs: acctLogs, skips: skips.map((s) => s.date), moves, gatesPending: false, today, swaps: [], exercise: exerciseByKey });
  const shown = plan.weeks.flatMap((w) => w.days).find((d) => d.date === today) as Day;
  const score = accountability({ weeks: plan.weeks, logs: acctLogs, sets: acctSets, skips, sessions: workouts.map((w) => ({ plan_date: String(w.plan_date), auto_ended: false })), today, name });
  const track = onTrack({
    settings,
    weeks: plan.weeks,
    logs: acctLogs,
    activeDates: new Set([...acctLogs.filter((l) => l.kind !== "check" && l.kind !== "class").map((l) => l.date), ...acctSets.map((s) => s.date)]),
    painAreas: ["knee"],
    warnings: plan.warnings,
    gatesPassed: 0,
    gatesTotal: 3,
    fitness: plan.fitness,
    today,
    scoreShown: true,
  });
  const recap = today === thisMonday;
  const won = wins(acctLogs, acctSets, name, recap ? addDays(thisMonday, -7) : thisMonday, recap ? addDays(thisMonday, -1) : today);
  // The Stats tab's strength card: the last 12 weeks of the overall index
  const index = strengthIndex(acctSets, EXERCISES.map((e) => e.key));
  const idxWeeks = mondaysBetween([...index.keys()].sort()[0] ?? today, today).slice(-12);
  const pts = idxWeeks.map((w) => index.get(w)).filter((v): v is number => v != null);
  const stronger = pts.length >= 2 ? Math.round((pts.at(-1)! / pts[0] - 1) * 100) : 0;
  const span = idxWeeks.length - idxWeeks.findIndex((w) => index.has(w)) - 1;
  // Nothing may read as a stall or a drop, on any day
  const banners: string[] = [];
  for (const k of occs.keys()) {
    const all = sessions(allSets, k);
    for (const s of all) {
      const c = compareSession(all, s.date);
      if (c) banners.push(`${name(k)} ${c.kind} on ${s.date}`);
    }
  }
  const fortnight = score.feed.filter((f) => f.date >= addDays(today, -13));
  const count = (kind: string) => fortnight.filter((f) => f.kind === kind).length;
  const comp = completion(shown, acctSets);
  const stagedEx = exerciseByKey(staged.key)!;
  const stagedTarget = shown.blocks.flatMap((b) => b.items.map(parseLine)).find((p) => p?.exercise.key === staged.key)?.target;
  const suggestion = stagedTarget ? suggestWeight(sessions(acctSets, staged.key).find((s) => s.date < today && !s.light), stagedTarget, "lb") : null;
  const afterTwo = [...acctSets, ...[1, 2].map((n) => ({ ...acctSets[0], date: today, exercise_key: staged.key, set_no: n }))];
  const easyRuns = acctLogs.filter((l) => l.kind === "run" && /^easy \d+ min$/i.test(String(l.title)));
  const paceOf = (l?: { km: number | null; duration_sec: number | null }) => (l?.km && l.duration_sec ? pace(l.duration_sec / l.km) : "—");

  console.log(`seed-demo: ${email} ${dry ? "(dry run, nothing written)" : existed ? "reset (account existed)" : "created and filled"}.`);
  console.log(`  Plan starts ${start} (week 27 today, ${today}), time trial ${settings.timeTrialDate}.`);
  console.log(`  Rows: ${logs.length} logs (${acctLogs.filter((l) => l.kind === "run").length} runs, ${acctLogs.filter((l) => l.kind === "test").length} tests, ${acctLogs.filter((l) => l.kind === "class").length} classes, ${acctLogs.filter((l) => l.kind === "strength").length} lifting days, 1 check-in), ${sets.length} set_logs, ${workouts.length} workout_sessions, ${skipRows.length} day_overrides, ${moveRows.length} day_moves.`);
  if (allSets.length > APP_SET_ROWS) console.log(`  The app loads only the newest ${APP_SET_ROWS} set rows: sets before ${acctSets.at(-1)!.date} are in the database but not on screen (that week's lifting bar on Stats is cut short). Numbers below are as the app shows them.`);
  console.log(`  Missed: ${[...missed].join(", ")}. Skipped: ${skips.map((s) => s.date).join(", ")}. Moves: ${moves.map((m) => `${m.from}→${m.to}`).join(", ")}.`);
  console.log(`  Easy pace ${paceOf(easyRuns[0])}/km → ${paceOf(easyRuns.at(-1))}/km. Longest run ${longest} km. 5K tests: ${acctLogs.filter((l) => l.kind === "test").map((l) => `${l.km === 10 ? "10K " : ""}${duration(l.duration_sec!)}`).join(" → ")}.`);
  console.log(`  Lifts (lb): ${summary.join(", ")}.`);
  console.log(`  Score: ${score.score ?? "—"}% (${score.band ? BANDS[score.band].label : score.status}; adherence ${score.parts.a}, extra +${score.parts.e}, bests +${score.parts.p}, drops −${score.parts.d}). ${score.streak} weeks kept in a row; ${score.sessions.done}/${score.sessions.planned} sessions, ${score.sets.done}/${score.sets.planned} sets, ${score.extras} extra.`);
  console.log(`  Weeks shown: ${score.weeks.map((w) => `${w.label} ${w.pct ?? "—"}%`).join(", ")}.`);
  console.log(`  Feed, last 14 days: ${count("weight_up")} heavier, ${count("weight_same")} weight held, ${count("weight_down")} lighter (${fortnight.filter((f) => f.kind === "weight_down").map((f) => `${f.title} ${f.date}`).join("; ") || "none"}).`);
  console.log(`  Today: ${STATUS_LABEL[track.status]}. ${track.headline}. ${track.lines.join(". ")}.`);
  console.log(`  ${recap ? "Last week's" : "This week's"} wins:${won.length ? "" : " none"}`);
  for (const w of won) console.log(`    ▲ ${w.text}`);
  console.log(`  Strength: ${stronger > 0 ? `${stronger}% stronger` : stronger < 0 ? `${-stronger}% down` : "Holding level"} in ${span} weeks.`);
  console.log(`  Warnings: ${plan.warnings.length ? plan.warnings.map((w) => w.message).join(" ") : "none"}. Stall or drop banners: ${banners.length ? banners.join("; ") : "none"}.`);
  console.log(`  Staged today: ${shown.blocks.map((b) => b.title).join(" + ")}${shown.movedFrom ? ` (moved from ${shown.movedFrom})` : ""}, ${comp.done}/${comp.planned} sets done, workout running for 6 min (session ${sessionDate(shown)}).`);
  console.log(`    Left: ${stagedEx.name}, sets 1–${staged.sets}, row id "ex-${today}-${staged.id}"${suggestion != null ? `, suggests ${suggestion} lb` : ", NO suggested weight"}. Third tick finishes the day: ${finishesDay(shown, afterTwo, staged.key) && !finishesDay(shown, acctSets, staged.key) ? "yes" : "NO"}.`);
  if (comp.planned - comp.done !== staged.sets || banners.length || plan.warnings.length) throw new Error("The staged data doesn't match what the demo needs (see above)");
}

main().catch((e) => {
  console.error(`seed-demo: ${e.message}`);
  process.exit(1);
});
