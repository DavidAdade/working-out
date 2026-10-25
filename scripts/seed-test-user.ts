// Resets a test account to ~5 weeks of realistic history: profile, runs, a 5K test, lifting sets with
// progression (one stalled lift, one dropped lift so the warnings show), a skipped day and a cutback week.
//
//   npm run seed:test                      # test@mailinator.com
//   npm run seed:test -- other@mailinator.com
//
// Needs SUPABASE_SERVICE_ROLE_KEY. Only touches the named account, and refuses anything but a
// @mailinator.com address so it can never wipe a real person's data. Safe to re-run: it clears that
// account's logs, sets and skips first.

import { generatePlan, type PlanSettings } from "../lib/plan/generate.ts";
import { addDays, daysBetween, todayIn } from "../lib/plan/dates.ts";
import { parseLine } from "../lib/plan/exercises.ts";

const email = (process.argv[2] ?? "test@mailinator.com").toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)");
if (!email.endsWith("@mailinator.com")) throw new Error(`Refusing to seed ${email}: test accounts must be @mailinator.com`);

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Deterministic "random" so every reset gives the same data
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const TZ = "America/Toronto";
const today = todayIn(TZ);
const FROM = addDays(today, -35);

// Monday about five weeks back, so the window covers base weeks with runs, lifts and the 5K baseline
const start = addDays(FROM, (8 - new Date(`${FROM}T12:00:00Z`).getUTCDay()) % 7);
const settings: PlanSettings = {
  startDate: start,
  recoveryStart: null,
  returningFromInjury: false,
  timeTrialDate: addDays(start, 7 * 22 + 4),
  raceDate: null,
  current5kSec: 34 * 60 + 30,
  goal5kSec: 29 * 60 + 59,
};

// Starting working weights (kg); anything not listed starts at 10
const BASE: Record<string, number> = {
  rdl: 40, "bulgarian-split-squat": 12, "step-up": 10, "leg-curl": 25, "sl-calf-raise": 10, "sl-db-rdl": 14,
  "goblet-split-squat": 14, "lat-pulldown": 45, "cable-row": 40, "face-pull": 15, curl: 10, "db-press": 18,
  "db-ohp": 12, "lateral-raise": 6, "triceps-ext": 12, "db-row": 20, "rear-delt-fly": 6, "hammer-curl": 12,
  "skull-crusher": 10, "cable-crunch": 25, "pallof-press": 10, "russian-twist": 6,
};
const STALLED = "lat-pulldown"; // last session same weight and reps as the one before
const DROPPED = "db-ohp"; // last session ~15% lighter

async function main() {
  const users = (await api("/auth/v1/admin/users?per_page=1000")) as { users: { id: string; email: string }[] };
  const user = users.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error(`No user ${email}. Create it in Supabase → Authentication → Users first.`);
  const uid = user.id;

  await api(`/rest/v1/profiles?id=eq.${uid}`, {
    method: "PATCH",
    body: JSON.stringify({
      display_name: "Test runner",
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
      pain_areas: ["knee", "foot"],
      gates: {},
      hide_dates: false,
      weight_unit: "kg",
    }),
  });
  for (const t of ["set_logs", "logs", "day_overrides"]) await api(`/rest/v1/${t}?user_id=eq.${uid}`, { method: "DELETE" });

  const skipDate = addDays(start, 7 + 1); // week 2 Tuesday
  const weeks = generatePlan(settings, { skips: [skipDate] });
  const days = weeks.flatMap((w) => w.days.map((d) => ({ d, w }))).filter(({ d }) => d.date >= FROM && d.date < today && !d.skipped);

  const logs: Record<string, unknown>[] = [];
  const sets: Record<string, unknown>[] = [];
  const sessionsByKey = new Map<string, number>();
  const lastByKey = new Map<string, { kg: number; reps: number | null }>();
  let easyPace = 7 * 60 + 40; // sec/km, improves a little each week

  for (const { d, w } of days) {
    const week = Math.floor(daysBetween(start, d.date) / 7);
    for (const b of d.blocks) {
      if (b.kind === "run" || b.kind === "test") {
        const isTest = b.kind === "test";
        const min = Number(b.title.match(/(\d+) min/)?.[1] ?? 0);
        const km = isTest ? 5 : b.km ?? (Math.round(((min * 60) / easyPace) * 10) / 10 || 5);
        const sec = isTest ? 34 * 60 + 5 : Math.round(km * (easyPace + (rand() * 20 - 10)));
        const knee = d.date === addDays(today, -9) ? 3 : rand() < 0.25 ? 1 : 0;
        logs.push({ user_id: uid, date: d.date, kind: isTest ? "test" : "run", title: b.title, km, duration_sec: sec, rpe: isTest ? 9 : 3 + Math.round(rand() * 3), pain: { knee, foot: rand() < 0.15 ? 1 : 0 }, notes: isTest ? "Windy, went out a bit fast" : null, auto: false });
      }
    }
    const lifts = d.blocks.filter((b) => ["legs", "upper", "abs", "mobility"].includes(b.kind));
    if (!lifts.length) continue;
    const light = w.cutback || lifts.some((b) => b.light);
    for (const b of lifts) {
      for (const line of b.items) {
        const p = parseLine(line);
        if (!p) continue;
        const { exercise: ex, target } = p;
        // Cutback sessions don't count as a step up in weight
        const n = (sessionsByKey.get(ex.key) ?? 0) + 1;
        if (!light) sessionsByKey.set(ex.key, n);
        const isLast = !days.some((x) => x.d.date > d.date && x.d.blocks.some((bb) => bb.items.some((l) => parseLine(l)?.exercise.key === ex.key)));
        let kg = 0;
        if (ex.load === "weight") {
          const base = BASE[ex.key] ?? 10;
          const step = base >= 20 ? 2.5 : 1;
          kg = base + step * (n - 1);
          const prev = lastByKey.get(ex.key);
          if (isLast && ex.key === STALLED && prev) kg = prev.kg;
          if (isLast && ex.key === DROPPED && prev) kg = Math.round(prev.kg * 0.85 * 2) / 2;
          if (light) kg = Math.round(kg * 0.8 * 2) / 2;
        }
        const reps = target.reps ?? 12;
        const count = light ? Math.min(target.sets, 2) : target.sets;
        for (let s = 1; s <= count; s++) {
          const r = ex.key === STALLED && isLast ? lastByKey.get(ex.key)?.reps ?? reps : s === count && rand() < 0.4 ? reps - 1 : reps;
          sets.push({
            user_id: uid,
            date: d.date,
            exercise_key: ex.key,
            set_no: s,
            weight: ex.load === "weight" ? kg : null,
            unit: "kg",
            reps: ex.load === "time" ? null : r,
            duration_sec: ex.load === "time" ? (target.sec ?? 30) + 5 * Math.min(week, 3) : null,
            light_week: light,
          });
        }
        if (!light) lastByKey.set(ex.key, { kg, reps });
      }
    }
    logs.push({ user_id: uid, date: d.date, kind: "strength", title: lifts.map((b) => b.title).join(" + "), km: null, duration_sec: null, rpe: null, pain: {}, notes: null, auto: true });
    if (daysBetween(start, d.date) % 7 === 6) easyPace -= 4;
  }

  await api("/rest/v1/day_overrides", { method: "POST", body: JSON.stringify([{ user_id: uid, date: skipDate, status: "skipped" }]) });
  await api("/rest/v1/logs", { method: "POST", body: JSON.stringify(logs) });
  for (let i = 0; i < sets.length; i += 500) await api("/rest/v1/set_logs", { method: "POST", body: JSON.stringify(sets.slice(i, i + 500)) });

  const runs = logs.filter((l) => l.kind !== "strength").length;
  console.log(`seed-test-user: ${email} reset with ${runs} runs/tests, ${logs.length - runs} lifting days, ${sets.length} sets from ${FROM} to ${addDays(today, -1)}.`);
  console.log(`  Plan starts ${start}. Warnings to look for: ${STALLED} (no increase) and ${DROPPED} (dropped ~15%).`);
}

main().catch((e) => {
  console.error(`seed-test-user: ${e.message}`);
  process.exit(1);
});
