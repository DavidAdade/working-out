import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>();
  if (!profile) redirect("/login");
  const zones = Intl.supportedValuesOf("timeZone");
  return <SettingsForm profile={profile} firstRun={!profile.start_date} zones={zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones]} />;
}
