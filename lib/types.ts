import type { PlanSettings } from "@/lib/plan/generate.ts";

export interface ProfileRow {
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
  gates: Record<string, boolean>;
}

export type LogKind = "run" | "test" | "strength" | "walk";

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
}

/** A profile is ready once the required plan fields are filled in. */
export function profileToSettings(p: ProfileRow): PlanSettings | null {
  if (!p.start_date || !p.time_trial_date || !p.current_5k_sec || !p.goal_5k_sec) return null;
  return {
    startDate: p.start_date,
    recoveryStart: p.recovery_start,
    returningFromInjury: p.returning_from_injury,
    timeTrialDate: p.time_trial_date,
    raceDate: p.race_date,
    raceName: p.race_name,
    current5kSec: p.current_5k_sec,
    goal5kSec: p.goal_5k_sec,
    halfGoalMinSec: p.half_goal_min_sec,
    halfGoalMaxSec: p.half_goal_max_sec,
  };
}

export const GATES = [
  { key: "stairs", title: "Down stairs pain-free", detail: "Every step, no rail needed." },
  { key: "bend", title: "Full knee bend pain-free", detail: "Heel toward glute, no pinch behind the knee." },
  { key: "hop", title: "Hop test passes both legs", detail: "10 easy hops on each leg, no foot or knee pain." },
] as const;
