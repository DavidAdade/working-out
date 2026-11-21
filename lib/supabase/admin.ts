import { createClient } from "@supabase/supabase-js";

/**
 * Supabase with the service role, which bypasses row-level security. For the two things only it can do:
 * creating an account (an invite, or a sign-up with the invite code) and reading the invite codes.
 * Server actions in app/invite-actions.ts only. Never import this from a component, a page that renders data, or
 * anything a person's own session can do instead. Null when the key isn't set (then inviting and sign-up are off).
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
