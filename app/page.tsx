import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileToSettings, type LogRow, type ProfileRow } from "@/lib/types";
import { todayIn } from "@/lib/plan/dates.ts";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: logs }, { data: skips }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>(),
    supabase.from("logs").select("*").order("date", { ascending: false }).limit(1000).returns<LogRow[]>(),
    supabase.from("day_overrides").select("date").eq("status", "skipped").returns<{ date: string }[]>(),
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
      today={todayIn(profile.timezone || "America/Toronto")}
    />
  );
}
