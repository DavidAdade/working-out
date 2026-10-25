import { createClient } from "@supabase/supabase-js";

/** Supabase as nobody: for token routes (calendar feed, Apple Health) that only call security-definer functions. */
export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
