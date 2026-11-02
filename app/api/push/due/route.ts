import { anonClient } from "@/lib/supabase/anon";
import { pushEnabled, sendNow, type PushSub } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Due {
  tag: string;
  title: string;
  body: string;
  url: string;
  subs: PushSub[];
}

/**
 * Sends every scheduled push that is due. Called every minute by pg_cron + pg_net (supabase/push-cron.sql)
 * with `Authorization: Bearer <secret>`. The secret is checked in the database against Supabase Vault,
 * by the same security-definer functions that hand out the due rows, so this route only needs the anon key.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (secret.length < 32 || secret.length > 200) return Response.json({ ok: false }, { status: 401 });
  if (!pushEnabled()) return Response.json({ ok: true, sent: 0, off: true });
  const supabase = anonClient();
  const { data, error } = await supabase.rpc("claim_due_pushes", { p_secret: secret });
  if (error) return Response.json({ ok: false }, { status: 500 });
  if (data == null) return Response.json({ ok: false }, { status: 401 });
  const due = data as Due[];
  const gone = (await Promise.all(due.map((d) => sendNow(d.subs, d)))).flat();
  if (gone.length) await supabase.rpc("drop_push_subscriptions", { p_secret: secret, p_endpoints: gone });
  return Response.json({ ok: true, sent: due.length });
}
