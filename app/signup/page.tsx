"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { signUpWithCode, type SignUpResult } from "@/app/invite-actions";
import { clearSnapshot } from "@/lib/offline";

/** Create an account with the invite code. The plan itself is set up on the next screen. */
export default function SignUpPage() {
  // Someone new on this phone: forget whatever was saved for offline use
  useEffect(() => void clearSnapshot(), []);
  const [state, action, pending] = useActionState<SignUpResult, FormData>(signUpWithCode, null);

  return (
    <main className="mt-10 flex flex-col gap-4">
      <h1 className="font-display text-5xl font-bold text-accent">WorkoutFlex</h1>
      <div className="card">
        <h2 className="font-display text-2xl font-bold">Create your account</h2>
        <form action={action} className="flex flex-col gap-3">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" required defaultValue={state?.email ?? ""} className="input" />
          <label className="label" htmlFor="password">
            Password (8 characters or more)
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
          <label className="label" htmlFor="code">
            Invite code
          </label>
          <input id="code" name="code" type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="input" />
          {state && !state.ok && (
            <p role="alert" className="text-sm text-bad">
              {state.error}
            </p>
          )}
          <button className="btn" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </button>
          <Link href="/login" className="btn-ghost text-center">
            I already have an account
          </Link>
        </form>
      </div>
    </main>
  );
}
