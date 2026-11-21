import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/supabase/user";
import { paged } from "@/lib/supabase/paged";
import { profileToSettings, type ActivityEventRow, type LogRow, type ProfileRow, type SetRow, type SkipRow } from "@/lib/types";
import { builtinRows, type ExerciseInfo } from "@/lib/plan/catalog.ts";
import { addDays, mondayOf, safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import type { DayCopy, Move } from "@/lib/plan/generate.ts";
import type { Swap } from "@/lib/plan/swaps.ts";
import type { DaySnapshot } from "@/lib/plan/snapshots.ts";
import type { Superset } from "@/lib/plan/supersets.ts";
import type { WorkoutSession } from "@/lib/plan/workout.ts";
import type { SavedReview } from "@/components/CoachCard";
import { aiEnabled } from "@/lib/coach/review";
import { pushEnabled } from "@/lib/push";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

const SETS_MAX = 5000;
const LOGS_MAX = 5000;

export default async function Home() {
  const supabase = await createClient();
  const { user, transient } = await checkUser(supabase);
  // A Supabase hiccup shows the "Try again" screen instead of signing out
  if (transient) throw new Error("Couldn't reach the server");
  if (!user) redirect("/login");

  // Read alongside the rest; awaited below because each may fail on its own (see there). Everything that grows
  // with use is read a page at a time (lib/supabase/paged.ts), in a fixed order
  const workoutsRead = paged((a, b) => supabase.from("workout_sessions").select("plan_date, started_at, ended_at, auto_ended, unlocked_at").order("plan_date", { ascending: false }).range(a, b).returns<WorkoutSession[]>(), 2000);
  const supersetsRead = paged((a, b) => supabase.from("supersets").select("id, keys, off").order("created_at").order("id").range(a, b).returns<Superset[]>());
  const copiesRead = paged((a, b) => supabase.from("day_copies").select("planDate:plan_date, source:source_date").order("plan_date").range(a, b).returns<DayCopy[]>());
  // Past days as they were shown when logged (migration 0021). The Score looks back 12 weeks; older days follow the live plan
  const snapshotsRead = paged((a, b) => supabase.from("day_snapshots").select("planDate:plan_date, blocks").gte("plan_date", addDays(new Date().toISOString().slice(0, 10), -130)).order("plan_date").range(a, b).returns<DaySnapshot[]>());
  const reads = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>(),
    paged((a, b) => supabase.from("logs").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b).returns<LogRow[]>(), LOGS_MAX),
    paged((a, b) => supabase.from("day_overrides").select("date, created_at").eq("status", "skipped").order("date").range(a, b).returns<SkipRow[]>()),
    paged((a, b) => supabase.from("day_moves").select("from:from_date, to:to_date").order("to_date").range(a, b).returns<Move[]>()),
    paged(
      (a, b) =>
        supabase
          .from("set_logs")
          .select("id, date, exercise_key, set_no, weight, unit, weight_kg, reps, duration_sec, light_week, plan_date")
          .order("date", { ascending: false })
          .order("id")
          .range(a, b)
          .returns<SetRow[]>(),
      SETS_MAX,
    ),
    paged((a, b) => supabase.from("exercises").select("key, name, load, primary_muscles, secondary_muscles, equipment, video_ids, video_query, lines, owner, deleted_at").order("name").order("key").range(a, b).returns<ExerciseInfo[]>()),
    paged((a, b) => supabase.from("exercise_swaps").select("planDate:plan_date, from:from_key, to:to_key").order("plan_date").order("from_key").range(a, b).returns<Swap[]>()),
  ]);
  // A failed read is a hiccup, not a sign-out, and an empty history would invite logging twice: show "Try again"
  if (reads.some((r) => r.error)) throw new Error("Couldn't load your data");
  const [{ data: profile }, { data: logs }, { data: skips }, { data: moves }, { data: sets }, { data: exercises }, { data: swaps }] = reads;
  // Before migration 0010 is applied the table is missing: no sessions yet, rather than an error screen
  const workouts = await workoutsRead;
  if (workouts.error && !["42P01", "PGRST205"].includes(workouts.error.code)) throw new Error("Couldn't load your data");
  // Same for migration 0017: no supersets yet
  const supersets = await supersetsRead;
  if (supersets.error && !["42P01", "PGRST205"].includes(supersets.error.code)) throw new Error("Couldn't load your data");
  // The same before migration 0012: no copied days
  const copies = await copiesRead;
  if (copies.error && !["42P01", "PGRST205"].includes(copies.error.code)) throw new Error("Couldn't load your data");
  const snapshots = await snapshotsRead;
  if (snapshots.error && !["42P01", "PGRST205"].includes(snapshots.error.code)) throw new Error("Couldn't load your data");
  // Built-ins from code fill any gap, e.g. before the first sync has run
  const byKey = new Map(builtinRows().map((e) => [e.key, e]));
  for (const e of exercises ?? []) byKey.set(e.key, e);

  // Signed in but no profile row (it's made when the account is): make it, then set up. /login would bounce back here
  if (!profile) {
    const { error } = await supabase.rpc("ensure_profile");
    if (error) throw new Error("Couldn't load your profile");
    redirect("/settings");
  }
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
  const capped = [logs?.length === LOGS_MAX ? logs.at(-1)?.date : null, sets?.length === SETS_MAX ? sets.at(-1)?.date : null].filter((d): d is string => !!d).sort().at(-1) ?? null;
  // Days before the person was using the app are never misses, whatever date their plan starts on (joining
  // mid-week, or a start set in the past): the first thing they logged, or the day the account was made
  const firstUse = [logs?.at(-1)?.date, sets?.at(-1)?.date].filter((d): d is string => !!d).sort()[0] ?? (profile.created_at ? todayIn(safeTimeZone(profile.timezone), new Date(profile.created_at)) : null);
  const horizon = [capped, firstUse].filter((d): d is string => !!d).sort().at(-1) ?? null;

  return (
    <Dashboard
      profile={profile}
      settings={settings}
      logs={(logs ?? []).map((l) => ({ ...l, km: l.km == null ? null : Number(l.km) }))}
      skips={(skips ?? []).map((s) => s.date)}
      moves={moves ?? []}
      swaps={swaps ?? []}
      supersets={supersets.data ?? []}
      copies={copies.data ?? []}
      snapshots={snapshots.data ?? []}
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
