import type { PlanSettings } from "@/lib/plan/generate.ts";
import { cleanOwnRuns, type OwnRun } from "./plan/ownruns.ts";
import { cleanDays, runMode, type RunMode } from "./plan/shape.ts";
import type { DistUnit } from "./plan/format.ts";

export interface ProfileRow {
  /** When the account was made */
  created_at?: string | null;
  id: string;
  display_name: string | null;
  timezone: string;
  start_date: string | null;
  recovery_start: string | null;
  returning_from_injury: boolean;
  time_trial_date: string | null;
  race_date: string | null;
  race_name: string | null;
  current_5k_sec: number | null;
  goal_5k_sec: number | null;
  half_goal_min_sec: number | null;
  half_goal_max_sec: number | null;
  pain_areas: string[];
  /** Whether the person runs and toward what, and the weekdays they train (migration 0022, lib/plan/shape.ts) */
  run_mode?: RunMode | null;
  train_days?: number[] | null;
  gates: Record<string, boolean>;
  /** When each gate was ticked (migration 0021); a gate ticked before that has no time */
  gates_at?: Record<string, string> | null;
  /** Show the plan by week and weekday instead of calendar dates */
  hide_dates: boolean;
  weight_unit: Unit;
  /** Distances and paces shown in km or miles (migration 0023); stored in km either way */
  distance_unit?: DistUnit | null;
  /** Start a rest countdown when a set is ticked */
  rest_timer: boolean;
  /** Rest length in seconds; null = by exercise. Absent until migration 0009 is applied. */
  rest_seconds?: number | null;
  /** Runs from the person's own running plan; the lifting is built around them. Absent until migration 0016 is applied. */
  own_runs?: OwnRun[] | null;
  /** The day the plan switched to own_runs (migration 0018); null takes the whole list */
  own_runs_from?: string | null;
}

export type Unit = "kg" | "lb";

/** Rest lengths offered in Settings, in seconds */
export const REST_CHOICES = [30, 45, 60, 75, 90, 120, 180];

export interface SetRow {
  id: string;
  date: string;
  exercise_key: string;
  set_no: number;
  weight: number | null;
  unit: Unit;
  weight_kg: number | null;
  reps: number | null;
  duration_sec: number | null;
  light_week: boolean;
  /** The plan day these sets were for, when done early */
  plan_date: string | null;
}

/** "check" is a morning check-in: pain scores only. "class" is a fitness class (title = the activity): always extra work */
export type LogKind = "run" | "test" | "strength" | "walk" | "check" | "class";

/** Quick picks in the "Log a class" sheet; anything else is typed in as "Other" */
export const CLASS_ACTIVITIES = ["Yoga", "Pilates", "Spin", "HIIT", "Swim", "Barre", "Boxing"] as const;

/** Does this log count toward its day's planned workout? Check-ins, auto logs and classes never do */
export const countsForDay = (l: { kind: string; auto?: boolean }) => l.kind !== "check" && l.kind !== "class" && !l.auto;

export interface LogRow {
  id: string;
  user_id: string;
  date: string;
  kind: LogKind;
  title: string | null;
  km: number | null;
  duration_sec: number | null;
  rpe: number | null;
  pain: Record<string, number>;
  notes: string | null;
  created_at: string;
  /** Created by set logging */
  auto: boolean;
  /** "health" when imported from Apple Health */
  source: "manual" | "health";
  external_id: string | null;
  avg_hr: number | null;
  /** Saved on this phone, waiting for a connection */
  queued?: boolean;
}

/** A skipped day and when it was skipped, for the Score tab */
export interface SkipRow {
  date: string;
  created_at: string | null;
}

/** A delete noted for the Score tab (activity_events): the only history that otherwise leaves no trace */
export interface ActivityEventRow {
  kind: "log_deleted" | "set_deleted";
  date: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** A profile is ready once the required plan fields are filled in. */
export function profileToSettings(p: ProfileRow): PlanSettings | null {
  const mode = runMode(p.run_mode);
  if (!p.start_date) return null;
  // Lifting only, or lifting with easy runs: a start date and the days are all the plan needs
  if (mode !== "program") return { startDate: p.start_date, returningFromInjury: false, runMode: mode, trainDays: cleanDays(p.train_days, mode), painAreas: p.pain_areas };
  if (!p.time_trial_date || !p.current_5k_sec || !p.goal_5k_sec) return null;
  return {
    startDate: p.start_date,
    recoveryStart: p.recovery_start,
    returningFromInjury: p.returning_from_injury,
    runMode: mode,
    trainDays: cleanDays(p.train_days, mode),
    timeTrialDate: p.time_trial_date,
    raceDate: p.race_date,
    raceName: p.race_name,
    current5kSec: p.current_5k_sec,
    goal5kSec: p.goal_5k_sec,
    halfGoalMinSec: p.half_goal_min_sec,
    halfGoalMaxSec: p.half_goal_max_sec,
    ownRuns: cleanOwnRuns(p.own_runs),
    ownRunsFrom: p.own_runs_from ?? null,
    painAreas: p.pain_areas,
  };
}

/** The three checks before running starts again. The keys are what's saved; the wording follows what the person tracks */
export const GATES = [
  { key: "stairs", title: "Down stairs pain-free", detail: "Every step, no rail needed." },
  { key: "bend", title: "Full knee bend pain-free", detail: "Heel toward glute, no pinch behind the knee." },
  { key: "hop", title: "Hop test passes both legs", detail: "10 easy hops on each leg, no foot or knee pain." },
] as const;
const GATES_ANY: { key: (typeof GATES)[number]["key"]; title: string; detail: string }[] = [
  { key: "stairs", title: "Everyday movement is pain-free", detail: "Walking, stairs and getting up from a chair, with no limp." },
  { key: "bend", title: "Full range of movement, pain-free", detail: "The injured area moves as far as the other side does." },
  { key: "hop", title: "Impact test passes", detail: "10 easy hops on each leg, or a brisk 10 min walk, with no pain during or after." },
];
/** Knee tests for someone tracking a knee; the same three checks in plain terms for anything else */
export const tracksKnee = (painAreas: string[] | null | undefined) => !!painAreas?.some((a) => /knee/i.test(a));
export const gatesFor = (painAreas: string[] | null | undefined): readonly { key: (typeof GATES)[number]["key"]; title: string; detail: string }[] => (tracksKnee(painAreas) ? GATES : GATES_ANY);
