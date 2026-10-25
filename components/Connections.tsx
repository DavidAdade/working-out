"use client";

import { useState, useTransition } from "react";
import { createToken, revokeToken, type TokenPurpose } from "@/app/actions";

export interface TokenInfo {
  purpose: TokenPurpose;
  created_at: string;
  last_used_at: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "never");

/** Calendar subscription and Apple Health import. Each key is shown once; only its hash is stored. */
export default function Connections({ tokens, origin }: { tokens: TokenInfo[]; origin: string }) {
  return (
    <section className="card gap-3">
      <h2 className="font-display text-xl font-bold">Connections</h2>
      <Connection
        purpose="calendar"
        title="Plan in your calendar"
        blurb="Subscribe once and every workout shows up in Apple or Google Calendar. It follows date changes, skips and new test results."
        info={tokens.find((t) => t.purpose === "calendar")}
        render={(token) => {
          const https = `${origin}/cal/${token}.ics`;
          const webcal = https.replace(/^https?:/, "webcal:");
          return (
            <>
              <a className="btn self-start" href={webcal}>
                Add to Calendar
              </a>
              <Copy label="Or copy the link (Google Calendar → Other calendars → From URL)" value={https} />
            </>
          );
        }}
      />
      <Connection
        purpose="health"
        title="Runs from Apple Watch"
        blurb="A Shortcuts automation sends each run or walk from Apple Health when it ends. You add effort and pain on the Log tab."
        info={tokens.find((t) => t.purpose === "health")}
        render={(token) => (
          <>
            <Copy label="Address" value={`${origin}/api/health`} />
            <Copy label="Key (shown once)" value={token} />
            <ol className="ml-5 list-decimal text-sm text-muted [&>li]:mt-1">
              <li>
                Shortcuts → Automation → <b>+</b> → <b>Apple Watch Workout</b> → <b>Ends</b>, any workout, <b>Run Immediately</b>.
              </li>
              <li>
                Add <b>Find Health Samples</b> (Workouts, sorted by End Date, latest first, limit 1).
              </li>
              <li>
                Add <b>Get Contents of URL</b>: the address above, Method <b>POST</b>, header <code>Authorization</code> = <code>Bearer &lt;key&gt;</code>, Request Body <b>JSON</b> with:{" "}
                <code>id</code> = Start Date, <code>type</code> = Workout Type, <code>start</code> = Start Date (ISO 8601), <code>duration</code> = Duration (seconds), <code>distance</code> = Total Distance, <code>distance_unit</code> = km or mi.
              </li>
              <li>Finish a run: it appears on the Log tab within a minute.</li>
            </ol>
          </>
        )}
      />
    </section>
  );
}

function Connection({ purpose, title, blurb, info, render }: { purpose: TokenPurpose; title: string; blurb: string; info?: TokenInfo; render: (token: string) => React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [on, setOn] = useState(!!info);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const act = (fn: () => Promise<void>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
      } catch {
        setError("No connection. Try again.");
      }
    });
  const make = () =>
    act(async () => {
      const r = await createToken(purpose);
      if (r.ok) {
        setToken(r.token);
        setOn(true);
      } else setError(r.error);
    });
  const off = () =>
    act(async () => {
      const r = await revokeToken(purpose);
      if (r.ok) {
        setToken(null);
        setOn(false);
      } else setError(r.error);
    });

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 first-of-type:border-t-0">
      <b>{title}</b>
      <p className="text-sm text-muted">{blurb}</p>
      {token ? (
        render(token)
      ) : on ? (
        <p className="text-sm">
          On since {when(info?.created_at ?? new Date().toISOString())} · last used {when(info?.last_used_at ?? null)}. The key was shown once; make a new one to see it again.
        </p>
      ) : null}
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={pending} onClick={make}>
          {on ? "Make a new key" : "Turn on"}
        </button>
        {on && (
          <button type="button" className="btn-ghost" disabled={pending} onClick={off}>
            Turn off
          </button>
        )}
      </div>
    </div>
  );
}

function Copy({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <div className="flex gap-1.5">
        <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-base" />
        <button
          type="button"
          className="btn-ghost flex-none"
          onClick={() =>
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
