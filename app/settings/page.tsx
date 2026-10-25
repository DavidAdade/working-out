import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";
import { headers } from "next/headers";
import SettingsForm from "@/components/SettingsForm";
import Connections, { type TokenInfo } from "@/components/Connections";

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
  const { data: tokens } = await supabase.from("user_tokens").select("purpose, created_at, last_used_at").returns<TokenInfo[]>();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    <SettingsForm profile={profile} firstRun={!profile.start_date} zones={zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones]}>
      {profile.start_date && <Connections tokens={tokens ?? []} origin={origin} />}
    </SettingsForm>
  );
}
