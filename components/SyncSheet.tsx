"use client";

// "Not synced" sheet: what's still waiting on this phone, what the server refused and why, and a Sync now button.
// Opened from the outbox banner in Dock.tsx once changes have been stuck for a while.

import { useState } from "react";
import { fmtDay } from "@/lib/plan/dates.ts";
import type { Op } from "./Dock";

export interface SyncResult {
  sent: number;
  refused: number;
  /** Still waiting (no connection) */
  left: number;
}

/** A queued write the server said no to when it was replayed */
export interface Refused {
  op: Op;
  error: string;
  at: number;
}

const label = (key: string) => {
  const words = key.replace(/-[0-9a-f]{6}$/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function describe(op: Op): string {
  if (op.t === "set") {
    const i = op.input;
    const what = [i.weight != null ? `${i.weight} ${i.unit}` : null, i.reps != null ? `${i.reps} reps` : null, i.durationSec != null ? `${i.durationSec}s` : null].filter(Boolean).join(" × ");
    return `${label(i.exerciseKey)} set ${i.setNo}${what ? ` (${what})` : ""} · ${fmtDay(i.date)}`;
  }
  if (op.t === "unset") return `Remove ${label(op.key)} set ${op.setNo} · ${fmtDay(op.date)}`;
  if (op.t === "swap") return `${op.to ? `Swap ${label(op.from)} for ${label(op.to)}` : `Put back ${label(op.from)}`} · ${fmtDay(op.planDate)}`;
  if (op.t === "superset") return `${op.on ? "Superset" : "Unlink"} ${label(op.key)} ${op.on ? "with" : "from"} the next exercise · ${fmtDay(op.planDate)}`;
  if (op.t === "workout-start") return `Start workout · ${fmtDay(op.planDate)}`;
  if (op.t === "workout-end") return `End workout · ${fmtDay(op.planDate)}`;
  if (op.t === "copy") return `${op.source ? `Do ${fmtDay(op.source)}'s workout` : "Put back the planned workout"} · ${fmtDay(op.planDate)}`;
  const i = op.input;
  return `${i.title.trim() || `${i.kind.charAt(0).toUpperCase()}${i.kind.slice(1)} session`}${i.km.trim() ? ` ${i.km} km` : ""} · ${fmtDay(i.date)}`;
}

const ago = (t: number) => {
  const min = Math.round((Date.now() - t) / 60000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 60 * 24 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};

export default function SyncSheet({
  queue,
  refused,
  since,
  sync,
  onDismissRefused,
  onClose,
}: {
  queue: Op[];
  refused: Refused[];
  since: number | null;
  sync: () => Promise<SyncResult>;
  onDismissRefused: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const n = queue.length;

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await sync();
      setResult(
        r.left
          ? { text: `Still can't reach the server. ${r.sent ? `${r.sent} synced; ` : ""}${r.left} still safe on this phone, and it keeps trying.`, tone: "bad" }
          : r.refused
            ? { text: `${r.sent} synced. ${r.refused} couldn't be saved: see below.`, tone: "bad" }
            : { text: r.sent ? `All synced: ${r.sent} saved.` : "Everything is synced.", tone: "good" },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Not synced"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[520px] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] sm:rounded-2xl"
      >
        <h2 className="font-display text-2xl font-bold">{n ? "Not synced yet" : refused.length ? "Not saved" : "All synced"}</h2>
        {n > 0 && (
          <>
            <p>
              {n} {n === 1 ? "change" : "changes"} saved on this phone {n === 1 ? "hasn't" : "haven't"} reached the server
              {since ? ` (oldest ${ago(since)})` : ""}. {"They're"} safe here and sync on their own once the connection is back.
            </p>
            <ul className="flex flex-col gap-1 text-sm text-muted">
              {queue.slice(0, 8).map((op) => (
                <li key={op.id} className="truncate">
                  {describe(op)}
                </li>
              ))}
              {n > 8 && <li>and {n - 8} more</li>}
            </ul>
          </>
        )}
        {refused.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-bad p-3">
            <p className="text-sm font-semibold">
              The server refused {refused.length === 1 ? "this change" : `these ${refused.length} changes`}, so {refused.length === 1 ? "it isn't" : "they aren't"} saved. The app shows the server&apos;s version instead.
            </p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {refused.map((r) => (
                <li key={r.op.id}>
                  <div className="truncate">{describe(r.op)}</div>
                  <div className="text-bad">{r.error}</div>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-ghost self-start" onClick={onDismissRefused}>
              Got it
            </button>
          </div>
        )}
        {result && (
          <p role="status" className={`text-sm font-semibold ${result.tone === "good" ? "text-good" : "text-bad"}`}>
            {result.text}
          </p>
        )}
        <div className="flex gap-2">
          {n > 0 || !result ? (
            <button type="button" className="btn flex-1" onClick={() => void run()} disabled={busy}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
          ) : null}
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {n ? "Later" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
