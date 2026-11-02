import { createClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/supabase/user";
import { pushEnabled } from "@/lib/push";

export const dynamic = "force-dynamic";

/** This phone's push subscription: POST saves it (body: PushSubscription.toJSON()), DELETE forgets it ({ endpoint }). */
export async function POST(req: Request) {
  const who = await signedIn();
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof p256dh !== "string" || p256dh.length > 200 || typeof auth !== "string" || auth.length > 100)
    return Response.json({ ok: false, error: "Bad subscription" }, { status: 400 });
  const { error } = await who.supabase.from("push_subscriptions").upsert({ user_id: who.userId, endpoint, p256dh, auth }, { onConflict: "user_id,endpoint" });
  if (error) return Response.json({ ok: false, error: "Couldn't save. Try again." }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const who = await signedIn();
  if (who instanceof Response) return who;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return Response.json({ ok: false, error: "Bad subscription" }, { status: 400 });
  const { error } = await who.supabase.from("push_subscriptions").delete().eq("user_id", who.userId).eq("endpoint", body.endpoint);
  if (error) return Response.json({ ok: false, error: "Couldn't save. Try again." }, { status: 500 });
  return Response.json({ ok: true });
}

async function signedIn() {
  if (!pushEnabled()) return Response.json({ ok: false, error: "Notifications are off" }, { status: 404 });
  const supabase = await createClient();
  const { user, transient } = await checkUser(supabase);
  if (!user) return Response.json({ ok: false, error: transient ? "Couldn't reach the server" : "Signed out" }, { status: transient ? 503 : 401 });
  return { supabase, userId: user.id };
}
