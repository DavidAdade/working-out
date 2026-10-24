"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { sendMagicLink, verifyCode, type ActionResult } from "@/app/actions";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(sendMagicLink, null);
  const [codeState, codeAction, codePending] = useActionState<ActionResult | null, FormData>(verifyCode, null);

  return (
    <main className="mt-10 flex flex-col gap-4">
      <h1 className="font-display text-5xl font-bold text-accent">SUB-30</h1>
      <div className="card">
        <h2 className="font-display text-2xl font-bold">Sign in</h2>
        {state?.ok ? (
          <form action={codeAction} className="flex flex-col gap-3">
            <p>
              We emailed <b>{email}</b>. Tap the link, or type the code here.
            </p>
            <input type="hidden" name="email" value={email} />
            <label className="label" htmlFor="code">
              Code
            </label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" required className="input font-mono tracking-[0.3em]" />
            {codeState && !codeState.ok && <p className="text-sm text-bad">{codeState.error}</p>}
            <button className="btn" disabled={codePending}>
              {codePending ? "Checking…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            {params.get("error") && <p className="text-sm text-bad">That link expired or was already used. Request a new one.</p>}
            {state && !state.ok && <p className="text-sm text-bad">{state.error}</p>}
            <button className="btn" disabled={pending}>
              {pending ? "Sending…" : "Email me a sign-in code"}
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
