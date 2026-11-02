import { createClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/supabase/user";
import { cancelPush, pushEnabled, schedulePush } from "@/lib/push";

export const dynamic = "force-dynamic";
// The request stays alive (inside after()) until the rest is over, so the push goes out on the second.
// Rests are at most a few minutes; anything longer is left to the every-minute sender.
export const maxDuration = 300;

const TAG = "rest";

/** Arm "Rest over" for the end of the rest timer. Body: { endsAt: epoch ms, label }. Re-arming replaces it. */
export async function POST(req: Request) {
  const who = await signedIn();
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { endsAt?: unknown; label?: unknown } | null;
  const endsAt = Number(body?.endsAt);
  const now = Date.now();
  if (!Number.isFinite(endsAt) || endsAt < now - 5000 || endsAt > now + 15 * 60_000) return Response.json({ ok: false, error: "Bad time" }, { status: 400 });
  const label = typeof body?.label === "string" ? body.label.slice(0, 100) : "";
  const r = await schedulePush(who, { at: endsAt, title: "Rest over", body: label ? `Next set: ${label.replace(/ set \d+$/, "")}` : "Time for the next set.", tag: TAG });
  return Response.json(r, { status: r.ok ? 200 : 500 });
}

/** Cancel it: the timer was skipped, or the app is open to beep itself */
export async function DELETE() {
  const who = await signedIn();
  if (who instanceof Response) return who;
  const r = await cancelPush(who, TAG);
  return Response.json(r, { status: r.ok ? 200 : 500 });
}

async function signedIn() {
  if (!pushEnabled()) return Response.json({ ok: false, error: "Notifications are off" }, { status: 404 });
  const { user, transient } = await checkUser(await createClient());
  if (!user) return Response.json({ ok: false, error: transient ? "Couldn't reach the server" : "Signed out" }, { status: transient ? 503 : 401 });
  return user.id;
}
