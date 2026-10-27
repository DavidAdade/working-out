import { createHash } from "node:crypto";
import { anonClient } from "@/lib/supabase/anon";
import { generatePlan, type Move } from "@/lib/plan/generate.ts";
import { fitness5k } from "@/lib/plan/paces.ts";
import { safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import { planToIcs } from "@/lib/plan/ics.ts";
import { profileToSettings, type ProfileRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/** webcal://…/cal/<token>.ics — the person's plan, for Apple/Google Calendar. The token is the only key. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[\w-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const { data } = await anonClient().rpc("calendar_feed", { p_token: token });
  const feed = data as { profile: ProfileRow; skips: string[]; moves?: Move[]; tests: { date: string; kind: string; km: number | null; duration_sec: number | null }[] } | null;
  const settings = feed ? profileToSettings(feed.profile) : null;
  if (!feed || !settings) return new Response("Not found", { status: 404 });
  const today = todayIn(safeTimeZone(feed.profile.timezone));
  const fitness = fitness5k(settings.current5kSec, feed.tests.map((t) => ({ ...t, km: t.km == null ? null : Number(t.km) })), today);
  const weeks = generatePlan(settings, { skips: feed.skips, moves: feed.moves ?? [], fitness5kSec: fitness.sec });
  const ics = planToIcs(weeks, { name: "WorkoutFlex", uidSeed: createHash("sha256").update(token).digest("hex").slice(0, 12) });
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "Content-Disposition": 'inline; filename="workoutflex.ics"' },
  });
}
