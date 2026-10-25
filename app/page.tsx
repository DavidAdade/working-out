import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileToSettings, type LogRow, type ProfileRow, type SetRow } from "@/lib/types";
import { todayIn } from "@/lib/plan/dates.ts";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: logs }, { data: skips }, { data: sets }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>(),
    supabase.from("logs").select("*").order("date", { ascending: false }).limit(1000).returns<LogRow[]>(),
    supabase.from("day_overrides").select("date").eq("status", "skipped").returns<{ date: string }[]>(),
    supabase
      .from("set_logs")
      .select("id, date, exercise_key, set_no, weight, unit, weight_kg, reps, duration_sec, light_week")
      .order("date", { ascending: false })
      .limit(5000)
      .returns<SetRow[]>(),
  ]);

  if (!profile) redirect("/login");
  const settings = profileToSettings(profile);
  if (!settings) redirect("/settings");

  return (
    <Dashboard
      profile={profile}
      settings={settings}
      logs={(logs ?? []).map((l) => ({ ...l, km: l.km == null ? null : Number(l.km) }))}
      skips={(skips ?? []).map((s) => s.date)}
      sets={(sets ?? []).map((s) => ({ ...s, weight: s.weight == null ? null : Number(s.weight), weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) }))}
      today={todayIn(profile.timezone || "America/Toronto")}
    />
  );
}
