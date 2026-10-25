import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileToSettings, type LogRow, type ProfileRow, type SetRow } from "@/lib/types";
import { builtinRows, type ExerciseInfo } from "@/lib/plan/catalog.ts";
import { safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: logs }, { data: skips }, { data: sets }, { data: exercises }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>(),
    supabase.from("logs").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1000).returns<LogRow[]>(),
    supabase.from("day_overrides").select("date").eq("status", "skipped").returns<{ date: string }[]>(),
    supabase
      .from("set_logs")
      .select("id, date, exercise_key, set_no, weight, unit, weight_kg, reps, duration_sec, light_week, plan_date")
      .order("date", { ascending: false })
      .limit(5000)
      .returns<SetRow[]>(),
    supabase.from("exercises").select("key, name, load, primary_muscles, secondary_muscles, video_ids, video_query, lines, owner").order("name").returns<ExerciseInfo[]>(),
  ]);
  // Built-ins from code fill any gap, e.g. before the first sync has run
  const byKey = new Map(builtinRows().map((e) => [e.key, e]));
  for (const e of exercises ?? []) byKey.set(e.key, e);

  if (!profile) redirect("/login");
  const settings = profileToSettings(profile);
  if (!settings) redirect("/settings");

  return (
    <Dashboard
      profile={profile}
      settings={settings}
      logs={(logs ?? []).map((l) => ({ ...l, km: l.km == null ? null : Number(l.km) }))}
      skips={(skips ?? []).map((s) => s.date)}
      exercises={[...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))}
      sets={(sets ?? []).map((s) => ({ ...s, weight: s.weight == null ? null : Number(s.weight), weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) }))}
      today={todayIn(safeTimeZone(profile.timezone))}
    />
  );
}
