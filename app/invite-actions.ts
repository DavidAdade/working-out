"use server";

// Getting new people in (migration 0024): the owner's invite link, and sign-up with the invite code.
// Both create an account, which only the service role can do (lib/supabase/admin.ts).

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export type InviteResult = { ok: true; email: string; link: string; existing: boolean } | { ok: false; error: string };
export type SignUpResult = { ok: false; error: string; email?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (code: string) => createHash("sha256").update(code.trim()).digest("hex");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return h.get("origin") ?? (host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
}

/**
 * The owner invites someone: makes their account (or finds it) and returns a one-time link to pass on by text
 * or email. It opens /join, where they tap once to sign in, then set up their plan and a password of their own.
 */
export async function inviteUser(_: unknown, form: FormData): Promise<InviteResult> {
  const supabase = await createClient();
  const { data: who } = await supabase.auth.getUser();
  if (!who.user) return { ok: false, error: "Sign in again." };
  // Row-level security only shows this row to the owner it belongs to
  const { data: owner } = await supabase.from("app_owners").select("user_id").eq("user_id", who.user.id).maybeSingle();
  if (!owner) return { ok: false, error: "Only the owner can invite people." };
  const email = String(form.get("invite_email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "Enter their email address." };
  const admin = adminClient();
  if (!admin) return { ok: false, error: "Inviting isn't set up on this server." };

  let existing = false;
  let made = await admin.auth.admin.generateLink({ type: "invite", email });
  if (made.error) {
    // Already has an account (invited before, or signed up): a fresh sign-in link instead
    existing = true;
    made = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  const token = made.data?.properties?.hashed_token;
  if (made.error || !token) return { ok: false, error: "Couldn't make the invite. Try again." };
  return { ok: true, email, existing, link: `${await origin()}/join?token_hash=${encodeURIComponent(token)}&type=${existing ? "magiclink" : "invite"}` };
}

/** Sign-up with the invite code: checks the code, makes the account and signs it in. */
export async function signUpWithCode(_: unknown, form: FormData): Promise<SignUpResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "");
  const fail = (error: string): SignUpResult => ({ ok: false, error, email });
  if (!EMAIL.test(email)) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Use a password of at least 8 characters.");
  if (!code.trim()) return fail("Enter the invite code you were given.");
  const admin = adminClient();
  if (!admin) return fail("Sign-up isn't open on this server.");
  const { data: known } = await admin.from("invite_codes").select("code_hash, uses").eq("code_hash", hash(code)).maybeSingle<{ code_hash: string; uses: number }>();
  if (!known) {
    // Slow enough that guessing codes isn't worth trying
    await wait(1200);
    return fail("That invite code isn't right.");
  }
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return fail(/already|registered|exists/i.test(error.message) ? "That email already has an account. Sign in instead." : "Couldn't create the account. Try again.");
  await admin.from("invite_codes").update({ uses: known.uses + 1 }).eq("code_hash", known.code_hash);
  const supabase = await createClient();
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  // The account exists either way: if signing in hiccups, they sign in from the usual page
  redirect(signedIn.error ? "/login" : "/");
}
