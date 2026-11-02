import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/supabase/user";
import type { ProfileRow } from "@/lib/types";
import { headers } from "next/headers";
import SettingsForm from "@/components/SettingsForm";
import Connections, { type TokenInfo } from "@/components/Connections";
import { RestTimerDock, RestTimerProvider } from "@/components/RestTimer";
import { pushEnabled, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { user, transient } = await checkUser(supabase);
  if (transient) throw new Error("Couldn't reach the server");
  if (!user) redirect("/login");
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>();
  // A failed read is a hiccup, not a sign-out
  if (error) throw new Error("Couldn't load your profile");
  if (!profile) redirect("/login");
  const zones = Intl.supportedValuesOf("timeZone");
  const { data: tokens } = await supabase.from("user_tokens").select("purpose, created_at, last_used_at").returns<TokenInfo[]>();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return (
    // The rest timer carries on here, so changing a setting between sets doesn't lose it
    <RestTimerProvider userId={profile.id} enabled={profile.rest_timer} seconds={profile.rest_seconds ?? null} push={pushEnabled()}>
      <SettingsForm profile={profile} firstRun={!profile.start_date} zones={zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones]} vapidKey={vapidPublicKey()}>
        {profile.start_date && <Connections tokens={tokens ?? []} origin={origin} />}
      </SettingsForm>
      <RestTimerDock />
    </RestTimerProvider>
  );
}
