import { createClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";

/**
 * Is the app reachable, Supabase included? The offline copy asks this before switching back to live data.
 * 204 signed in, 401 signed out, 503 Supabase hiccuping. No data in the answer.
 */
export async function GET() {
  const { user, transient } = await checkUser(await createClient());
  return new Response(null, { status: user ? 204 : transient ? 503 : 401, headers: { "Cache-Control": "no-store" } });
}
