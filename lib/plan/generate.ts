import { addDays, daysBetween, mondayOf, dowName, weekday, type ISODate } from "./dates.ts";
import { pace, HALF_KM } from "./format.ts";
import { ABS, LEGS, UPPER, light, type Block } from "./templates.ts";

export type Phase = "recovery" | "return" | "base" | "build" | "sharpen" | "tt" | "half" | "taper" | "race";

export const PHASE_NAMES: Record<Phase, string> = {
  recovery: "Recovery strength",
  return: "Return to running",
  base: "Base",
  build: "Build",
  sharpen: "Sharpen",
  tt: "Time trial",
  half: "Half block",
  taper: "Taper",
  race: "Race week",
};

export interface PlanSettings {
  /** Monday running (or the plan) begins */
  startDate: ISODate;
  /** Monday the pre-run strength phase begins; only used when returningFromInjury */
  recoveryStart?: ISODate | null;
  returningFromInjury: boolean;
  timeTrialDate: ISODate;
  /** Optional half marathon after the time trial */
  raceDate?: ISODate | null;
  raceName?: string | null;
  current5kSec: number;
  goal5kSec: number;
  halfGoalMinSec?: number | null;
  halfGoalMaxSec?: number | null;
}

export interface Day {
  date: ISODate;
  blocks: Block[];
  skipped: boolean;
  /** Can this day be skipped on a 4-day week */
  skippable: boolean;
  alerts: string[];
}

export interface Week {
  label: string;
  index: number | null;
  start: ISODate;
  phase: Phase;
  cutback: boolean;
  days: Day[];
  notes: string[];
}

export interface GenerateOptions {
  /** Dates the person chose to skip */
  skips?: Iterable<ISODate>;
}

/** The headline of a day: its run if it has one, otherwise its first block. */
export function dayTitle(d: Day): string {
  const main = d.blocks.find((b) => b.kind === "run" || b.kind === "test" || b.kind === "walk" || b.kind === "gate") ?? d.blocks[0];
  return main ? main.title : "Rest";
}

export function dayKind(d: Day): Block["kind"] {
  const main = d.blocks.find((b) => b.kind === "run" || b.kind === "test" || b.kind === "walk" || b.kind === "gate") ?? d.blocks[0];
  return main ? main.kind : "mobility";
}

function weekIndex(start: ISODate, date: ISODate): number {
  return Math.floor(daysBetween(start, date) / 7) + 1;
}

const run = (title: string, items: string[], extra: Partial<Block> = {}): Block => ({ kind: "run", title, items, ...extra });
const test = (title: string, items: string[], note?: string): Block => ({ kind: "test", title, items, note });

export function generatePlan(s: PlanSettings, opts: GenerateOptions = {}): Week[] {
  const skips = new Set(opts.skips ?? []);
  const start = mondayOf(s.startDate);
  const ttWeekStart = mondayOf(s.timeTrialDate);
  const raceWeekStart = s.raceDate ? mondayOf(s.raceDate) : null;
  const ttIdx = weekIndex(start, ttWeekStart);
  const lastIdx = raceWeekStart ? weekIndex(start, raceWeekStart) : ttIdx;
  const FEB1 = `${s.timeTrialDate.slice(0, 4)}-02-01`;

  // paces (sec/km)
  const currentPace = s.current5kSec / 5;
  const goalPace = s.goal5kSec / 5 - 5; // aim a touch under goal
  const intervalStart = Math.max(goalPace, currentPace - 30);
  const tenKPace = s.goal5kSec / 5 + 15;
  const halfMin = s.halfGoalMinSec ? s.halfGoalMinSec / HALF_KM : null;
  const halfMax = s.halfGoalMaxSec ? s.halfGoalMaxSec / HALF_KM : null;
  const halfTempo = halfMin ? `${pace(halfMin - 2)}–${pace(halfMin + 13)}/km` : "half-marathon effort";

  const weeks: Week[] = [];

  /* ---------- recovery weeks before running ---------- */
  if (s.returningFromInjury && s.recoveryStart) {
    let k = 0;
    for (let ws = mondayOf(s.recoveryStart); ws < start; ws = addDays(ws, 7), k++) {
      const days: Day[] = [
        mk(ws, 0, [LEGS.A_gym, UPPER.pull, ABS.gym]),
        mk(ws, 1, [{ kind: "walk", title: "Flat walk", items: ["30–40 min easy flat walk"], note: "No downhill walking." }]),
        mk(ws, 2, [{ kind: "walk", title: "Walk or incline treadmill", items: ["30–40 min, flat or 2–5% incline if pain-free"] }, UPPER.push, ABS.condoA]),
        mk(ws, 3, [LEGS.A_condo, UPPER.backArms, ABS.condoB]),
        mk(ws, 4, [
          { kind: "gate", title: "Gate check + walk", items: ["Go down a flight of stairs", "Full knee bend", "10 easy hops on each leg", "30 min flat walk"], note: "Tick the gates on the Today tab when all three are pain-free." },
        ]),
      ];
      if (k === 1) days[0].alerts.push("If stairs still hurt this week, book a physio appointment.");
      weeks.push({ label: `R${k + 1}`, index: null, start: ws, phase: "recovery", cutback: false, days, notes: [] });
    }
  }

  /* ---------- running weeks ---------- */
  const rtn = s.returningFromInjury ? 2 : 0;
  const baseEnd = rtn + 4;
  const buildStart = baseEnd + 1;
  let longKm: number | null = null;
  let session = 0;
  let test10k: number | null = null;

  const sessions = [
    (p: number) => ({ t: "8 × 400 m", x: ["10 min easy warm-up", `8 × 400 m at ${pace(p)}/km (${pace(p * 0.4)} each), 90 s walk/jog between`, "10 min easy cool-down"] }),
    (p: number) => ({ t: "Tempo 3 × 6 min", x: ["10 min easy warm-up", `3 × 6 min at ${pace(p + 40)}/km, 2 min jog between`, "10 min easy cool-down"] }),
    (p: number) => ({ t: "5 × 800 m", x: ["10 min easy warm-up", `5 × 800 m at ${pace(p)}/km (${pace(p * 0.8)} each), 2 min jog between`, "10 min easy cool-down"] }),
    (p: number) => ({ t: "4 × 1 km", x: ["10 min easy warm-up", `4 × 1 km at ${pace(p)}/km, 3 min jog between`, "10 min easy cool-down"] }),
    (p: number) => ({ t: "20 min tempo", x: ["10 min easy warm-up", `20 min steady at ${pace(p + 40)}/km`, "10 min easy cool-down"] }),
  ];

  for (let i = 1; i <= lastIdx; i++) {
    const ws = addDays(start, (i - 1) * 7);
    const phase: Phase =
      raceWeekStart && i === lastIdx ? "race"
      : raceWeekStart && i === lastIdx - 1 ? "taper"
      : i > ttIdx ? "half"
      : i === ttIdx ? "tt"
      : i === ttIdx - 1 ? "sharpen"
      : i <= rtn ? "return"
      : i <= baseEnd ? "base"
      : "build";
    const cut = (phase === "base" || phase === "build") && i % 4 === 0;
    if (phase === "build" && test10k === null && !cut && ws >= `${s.timeTrialDate.slice(0, 4)}-01-11`) test10k = i;
    const stage = phase === "tt" || phase === "taper" || phase === "race" ? "L" : s.returningFromInjury && i <= rtn + 2 ? "B" : "C";
    const isLight = stage === "L";
    const U = (b: Block) => (isLight ? light(b) : b);

    // Tue easy
    let tue: Block;
    if (phase === "return") tue = run("Run-walk 20 min", [i === 1 ? "Alternate 1 min easy run / 1 min walk" : "Alternate 2 min easy run / 1 min walk", "Flat route only"], { note: "Stop if pain goes above 2/10." });
    else {
      let m = phase === "half" ? 40 : phase === "taper" ? 30 : phase === "tt" ? 25 : phase === "race" ? 20 : Math.min(40, 25 + 2 * (i - rtn - 1));
      if (cut) m -= 5;
      tue = run(`Easy ${m} min`, ["Conversational pace (you can talk in full sentences)", phase === "tt" || phase === "race" ? "Finish with 4 × 20 s strides" : "Flat or gently rolling"]);
    }

    // Wed quality
    let wed: Block;
    if (phase === "return") wed = run("Run-walk 25 min", [i === 1 ? "1 min run / 1 min walk" : "3 min run / 1 min walk", "Flat"]);
    else if (phase === "base") {
      if (i === rtn + 3) wed = test("5K baseline test", ["15 min easy warm-up with 3 strides", "5K hard, even effort, flat route", "Log your time. It sets your interval paces."], "If pain scores 3+ during, stop and jog home.");
      else wed = run(`Easy 30 min${i >= rtn + 2 ? " + strides" : ""}`, ["Easy conversational running", i >= rtn + 2 ? "4 × 20 s relaxed strides at the end" : "Keep it flat"]);
    } else if (phase === "build") {
      if (cut) wed = run("Easy 25 min + strides", ["Cutback week. Easy running", "4 × 20 s strides"]);
      else {
        const span = Math.max(1, ttIdx - 1 - buildStart);
        const frac = Math.min(1, Math.max(0, (i - buildStart) / span));
        const p = intervalStart + (goalPace - intervalStart) * frac;
        const sx = sessions[session % sessions.length](p);
        session++;
        wed = run(sx.t, sx.x, { note: "One hard session a week, maximum. Skip it if pain is above 2/10." });
      }
    } else if (phase === "sharpen") wed = run("3 × 1 km at goal pace", ["10 min easy warm-up", `3 × 1 km at ${pace(goalPace)}/km, 3 min jog between`, "4 strides, 10 min cool-down"]);
    else if (phase === "tt") wed = run("Easy 20 min", ["Very easy. Save it for Friday"]);
    else if (phase === "half")
      wed = (i - ttIdx) % 2 === 1
        ? run("Half-pace tempo", ["10 min easy", `2 × 10 min at ${halfTempo}, 3 min jog between`, "10 min easy"])
        : run("5 × 1 km at 10K pace", ["10 min easy", `5 × 1 km at about ${pace(tenKPace)}/km, 2 min jog`, "10 min easy"]);
    else if (phase === "taper") wed = run("2 × 1.6 km at half pace", ["10 min easy", `2 × 1.6 km at ${halfMin ? pace(halfMin + 5) + "/km" : "half effort"}, 3 min jog`, "10 min easy"]);
    else wed = run("Easy 20 min + strides", ["Short and easy", "4 × 20 s strides"]);

    // Fri long
    let fri: Block;
    if (phase === "return") fri = run(`Run-walk ${i === 1 ? 25 : 30} min`, [i === 1 ? "2 min run / 1 min walk" : "4 min run / 1 min walk", "Flat"]);
    else if (phase === "base" || phase === "build") {
      if (longKm === null) longKm = 5;
      else if (!cut && i !== test10k) longKm = Math.min(12, longKm + (ws >= FEB1 ? 1 : 0.5));
      if (i === test10k) fri = test("10K test", ["15 min easy warm-up", "10K at hard, even effort", "Log the time. It replaces the estimate."], "Stop if pain scores 3+.");
      else {
        const km = cut ? Math.max(4, longKm - 1.5) : longKm;
        fri = run(`Long run ${km} km`, ["Easy pace the whole way", "Flat or gently rolling, no long downhills"], { km });
      }
    } else if (phase === "sharpen") {
      const km = Math.max(6, (longKm ?? 8) - 2);
      fri = run(`Easy ${km} km`, ["Relaxed. Time trial is next week"], { km });
    } else if (phase === "tt") fri = test("5K TIME TRIAL", ["15 min warm-up with 4 strides", `Go out at ${pace(s.goal5kSec / 5)}/km, hold it, push the last kilometre`, `Target: under ${Math.floor(s.goal5kSec / 60)}:${String(s.goal5kSec % 60).padStart(2, "0")}`], "This is the goal day.");
    else if (phase === "half") {
      longKm = Math.min(16, Math.max(longKm ?? 10, 11) + 1.5);
      fri = run(`Long run ${longKm} km`, ["Easy pace", `Last 2 km at half pace (${halfTempo}) if nothing hurts`], { km: longKm });
    } else if (phase === "taper") fri = run("Long run 10 km", ["Easy pace", "Last chance to test race-day shoes and fuel"], { km: 10 });
    else fri = run("Shakeout 15 min", ["Very easy", "4 strides"]);

    const days: Day[] = [
      mk(ws, 0, [U(stage === "L" ? LEGS.L_gym : stage === "B" ? LEGS.B_gym : LEGS.C_gym), U(UPPER.pull), U(ABS.gym)]),
      mk(ws, 1, [tue]),
      mk(ws, 2, [wed, U(UPPER.push), U(ABS.condoA)]),
      mk(ws, 3, [U(stage === "L" ? LEGS.L_condo : stage === "B" ? LEGS.B_condo : LEGS.C_condo), U(UPPER.backArms), U(ABS.condoB)]),
      mk(ws, 4, [fri]),
    ];
    if (phase === "tt" || phase === "race") days[3].blocks = [days[3].blocks[0]]; // nothing heavy the day before
    if (phase === "race" && s.raceDate) {
      const off = daysBetween(ws, s.raceDate);
      const raceItems = [
        s.halfGoalMinSec && s.halfGoalMaxSec ? `Target ${fmtH(s.halfGoalMinSec)}–${fmtH(s.halfGoalMaxSec)}` : "Run your own race",
        halfMin && halfMax ? `Start around ${pace(halfMax - 10)}/km, settle at ${pace((halfMin + halfMax) / 2)}/km after 5 km` : "Start easy, settle after 5 km",
        "Watch the knees on any downhill sections",
      ];
      days.push({ date: addDays(ws, off), blocks: [test(s.raceName || "Half marathon", raceItems)], skipped: false, skippable: false, alerts: [] });
    }
    weeks.push({ label: `W${i}`, index: i, start: ws, phase, cutback: cut, days, notes: [] });
  }

  for (const w of weeks) applySkips(w, skips);
  return weeks;

  function mk(ws: ISODate, offset: number, blocks: Block[]): Day {
    return { date: addDays(ws, offset), blocks: blocks.map((b) => ({ ...b })), skipped: false, skippable: true, alerts: [] };
  }
}

function fmtH(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Order in which skipped upper-body work looks for a new home. */
const FOLD_ORDER = [1, 4, 3, 2]; // Mon, Thu, Wed, Tue (weekday numbers)

function applySkips(w: Week, skips: Set<ISODate>) {
  const skipped = w.days.filter((d) => d.skippable && skips.has(d.date));
  if (!skipped.length) return;
  for (const d of skipped) d.skipped = true;
  const open = w.days.filter((d) => !d.skipped && d.skippable);

  for (const d of skipped) {
    const name = dowName(d.date);
    const hadLong = d.blocks.some((b) => b.kind === "run" && b.km);
    const hadTest = d.blocks.some((b) => b.kind === "test");
    if (hadLong) w.notes.push(`Long run skipped on ${name}. It's the key run of the week, so skip Tuesday instead next time if you can.`);
    if (hadTest) w.notes.push(`${name}'s test was skipped. Do it on the next easy-run day instead.`);

    for (const b of d.blocks.filter((x) => x.carry)) {
      const target = FOLD_ORDER.map((wd) => open.find((o) => weekday(o.date) === wd))
        .find((o): o is Day => !!o && !o.blocks.some((x) => x.kind === "test"));
      if (!target) {
        w.notes.push(`${b.title} from ${name} was dropped this week.`);
        continue;
      }
      if (target.blocks.some((x) => x.title === b.title)) continue;
      target.blocks.push({ ...b, carry: false, foldedFrom: name, note: "Moved from " + name + ": 2 sets each to keep the session short." });
    }
  }
}

export function weekLongRunKm(w: Week): number {
  return Math.max(0, ...w.days.filter((d) => !d.skipped).flatMap((d) => d.blocks.map((b) => b.km ?? 0)));
}

export function weekForDate(weeks: Week[], date: ISODate): Week | undefined {
  return weeks.find((w) => date >= w.start && date < addDays(w.start, 7));
}

export function dayForDate(weeks: Week[], date: ISODate): Day | undefined {
  return weeks.flatMap((w) => w.days).find((d) => d.date === date);
}
