"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { sendMagicLink, signInWithPassword, type ActionResult } from "@/app/actions";

function LoginForm() {
  const params = useSearchParams();
  const [useLink, setUseLink] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(signInWithPassword, null);
  const [linkState, linkAction, linkPending] = useActionState<ActionResult | null, FormData>(sendMagicLink, null);

  return (
    <main className="mt-10 flex flex-col gap-4">
      <h1 className="font-display text-5xl font-bold text-accent">WorkoutFlex</h1>
      <div className="card">
        <h2 className="font-display text-2xl font-bold">Sign in</h2>
        {params.get("error") && <p className="text-sm text-bad">That link expired or was already used. Request a new one.</p>}
        {!useLink ? (
          <form action={action} className="flex flex-col gap-3">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" required className="input" />
            <label className="label" htmlFor="password">
              Password
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
            {state && !state.ok && <p className="text-sm text-bad">{state.error}</p>}
            <button className="btn" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setUseLink(true)}>
              Email me a sign-in link instead
            </button>
          </form>
        ) : linkState?.ok ? (
          <p>Check your email for a sign-in link. Open it in this same browser.</p>
        ) : (
          <form action={linkAction} className="flex flex-col gap-3">
            <label className="label" htmlFor="link-email">
              Email
            </label>
            <input id="link-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required className="input" />
            {linkState && !linkState.ok && <p className="text-sm text-bad">{linkState.error}</p>}
            <button className="btn" disabled={linkPending}>
              {linkPending ? "Sending…" : "Email me a sign-in link"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setUseLink(false)}>
              Use password
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
