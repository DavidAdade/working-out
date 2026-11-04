import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/supabase/user";
import { profileToSettings, type ActivityEventRow, type LogRow, type ProfileRow, type SetRow, type SkipRow } from "@/lib/types";
import { builtinRows, type ExerciseInfo } from "@/lib/plan/catalog.ts";
import { addDays, mondayOf, safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import type { DayCopy, Move } from "@/lib/plan/generate.ts";
import type { Swap } from "@/lib/plan/swaps.ts";
import type { WorkoutSession } from "@/lib/plan/workout.ts";
import type { SavedReview } from "@/components/CoachCard";
import { aiEnabled } from "@/lib/coach/review";
import { pushEnabled } from "@/lib/push";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { user, transient } = await checkUser(supabase);
  // A Supabase hiccup shows the "Try again" screen instead of signing out
  if (transient) throw new Error("Couldn't reach the server");
  if (!user) redirect("/login");

  // Read alongside the rest; awaited below because it may fail on its own (see there)
  const workoutsRead = supabase
    .from("workout_sessions")
    .select("plan_date, started_at, ended_at, auto_ended")
    .order("plan_date", { ascending: false })
    .limit(400)
    .returns<WorkoutSession[]>()
    .then((r) => r);
  const copiesRead = supabase.from("day_copies").select("planDate:plan_date, source:source_date").returns<DayCopy[]>().then((r) => r);
  const reads = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>(),
    supabase.from("logs").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1000).returns<LogRow[]>(),
    supabase.from("day_overrides").select("date, created_at").eq("status", "skipped").returns<SkipRow[]>(),
    supabase.from("day_moves").select("from:from_date, to:to_date").returns<Move[]>(),
    supabase
      .from("set_logs")
      .select("id, date, exercise_key, set_no, weight, unit, weight_kg, reps, duration_sec, light_week, plan_date")
      .order("date", { ascending: false })
      .limit(5000)
      .returns<SetRow[]>(),
    supabase.from("exercises").select("key, name, load, primary_muscles, secondary_muscles, equipment, video_ids, video_query, lines, owner").order("name").returns<ExerciseInfo[]>(),
    supabase.from("exercise_swaps").select("planDate:plan_date, from:from_key, to:to_key").returns<Swap[]>(),
  ]);
  // A failed read is a hiccup, not a sign-out, and an empty history would invite logging twice: show "Try again"
  if (reads.some((r) => r.error)) throw new Error("Couldn't load your data");
  const [{ data: profile }, { data: logs }, { data: skips }, { data: moves }, { data: sets }, { data: exercises }, { data: swaps }] = reads;
  // Before migration 0010 is applied the table is missing: no sessions yet, rather than an error screen
  const workouts = await workoutsRead;
  if (workouts.error && !["42P01", "PGRST205"].includes(workouts.error.code)) throw new Error("Couldn't load your data");
  // The same before migration 0012: no copied days
  const copies = await copiesRead;
  if (copies.error && !["42P01", "PGRST205"].includes(copies.error.code)) throw new Error("Couldn't load your data");
  // Built-ins from code fill any gap, e.g. before the first sync has run
  const byKey = new Map(builtinRows().map((e) => [e.key, e]));
  for (const e of exercises ?? []) byKey.set(e.key, e);

  if (!profile) redirect("/login");
  const settings = profileToSettings(profile);
  if (!settings) redirect("/settings");
  const today = todayIn(safeTimeZone(profile.timezone));
  const ai = aiEnabled();
  const [{ data: review }, { data: events }] = await Promise.all([
    supabase.from("ai_reviews").select("content, created_at").eq("week_start", mondayOf(today)).maybeSingle<{ content: SavedReview["review"]; created_at: string }>(),
    // Deletes for the Score tab; a missing table (migration not pushed yet) just means none
    supabase.from("activity_events").select("kind, date, payload, created_at").gte("date", addDays(today, -84)).order("date", { ascending: false }).limit(1000).returns<ActivityEventRow[]>(),
  ]);
  // History is capped above: before the oldest row of a full read, the Score tab can't tell a miss from a gap
  const horizon = [logs?.length === 1000 ? logs.at(-1)?.date : null, sets?.length === 5000 ? sets.at(-1)?.date : null].filter((d): d is string => !!d).sort().at(-1) ?? null;

  return (
    <Dashboard
      profile={profile}
      settings={settings}
      logs={(logs ?? []).map((l) => ({ ...l, km: l.km == null ? null : Number(l.km) }))}
      skips={(skips ?? []).map((s) => s.date)}
      moves={moves ?? []}
      swaps={swaps ?? []}
      copies={copies.data ?? []}
      workouts={workouts.data ?? []}
      exercises={[...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))}
      sets={(sets ?? []).map((s) => ({ ...s, weight: s.weight == null ? null : Number(s.weight), weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) }))}
      today={today}
      ai={ai}
      review={ai && review ? { review: review.content, createdAt: review.created_at } : null}
      push={pushEnabled()}
      score={{ skippedAt: Object.fromEntries((skips ?? []).map((s) => [s.date, s.created_at])), events: events ?? [], horizon }}
    />
  );
}
