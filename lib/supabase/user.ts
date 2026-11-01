import { isAuthRetryableFetchError, type SupabaseClient, type User } from "@supabase/supabase-js";

export type UserCheck = { user: User; transient?: false } | { user: null; transient: boolean };

const transientError = (e: unknown) => isAuthRetryableFetchError(e) || (typeof (e as { status?: unknown })?.status === "number" && ((e as { status: number }).status === 0 || (e as { status: number }).status >= 500));

/**
 * The signed-in user, telling "signed out" apart from "Supabase or the network hiccuped".
 * getUser() returns no user in both cases; treating a 502 as signed out sent people to /login mid-workout.
 * A hiccup is retried once; if it persists, `transient` is true and the caller should fail softly, not sign out.
 */
export async function checkUser(supabase: SupabaseClient): Promise<UserCheck> {
  for (let attempt = 0; ; attempt++) {
    let error: unknown;
    try {
      const res = await supabase.auth.getUser();
      if (res.data.user) return { user: res.data.user };
      error = res.error;
    } catch (e) {
      error = e;
    }
    if (!transientError(error)) return { user: null, transient: false };
    if (attempt === 1) return { user: null, transient: true };
    await new Promise((r) => setTimeout(r, 400));
  }
}
