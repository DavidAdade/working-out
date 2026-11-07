"use client";

// "Log a class": yoga, pilates, spin... done on any day, in about three taps. Saved as a `class` log through the
// Dock outbox (works with no signal). A class is always extra work: it never counts toward a planned day, and adds
// to the Score's extra work by time and effort (classU in lib/plan/accountability.ts).

import { useEffect, useRef, useState } from "react";
import type { ISODate } from "@/lib/plan/dates.ts";
import { CLASS_ACTIVITIES, type LogRow } from "@/lib/types";
import type { LogInput } from "@/app/actions";
import { useDock } from "./Dock";
import { useDates } from "./DateLabels";

const LAST_KEY = "wf:lastClass";
const MINUTES = [30, 45, 60] as const;
const EFFORT = [
  { key: "easy", label: "Easy", rpe: 3 },
  { key: "moderate", label: "Moderate", rpe: 6 },
  { key: "hard", label: "Hard", rpe: 8 },
] as const;

function lastActivity(): string {
  try {
    return localStorage.getItem(LAST_KEY) ?? CLASS_ACTIVITIES[0];
  } catch {
    return CLASS_ACTIVITIES[0];
  }
}

/** A 44px pill you can tap; `on` when picked */
function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`min-h-11 rounded-full border px-3 text-[0.95rem] font-semibold ${on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink active:bg-sunk"}`}>
      {children}
    </button>
  );
}

export function ClassSheet({ date, today, onClose }: { date: ISODate; today: ISODate; onClose: () => void }) {
  const { send, notify } = useDock();
  const dates = useDates();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [activity, setActivity] = useState<string>(() => {
    const last = lastActivity();
    return (CLASS_ACTIVITIES as readonly string[]).includes(last) ? last : "Other";
  });
  const [other, setOther] = useState(() => {
    const last = lastActivity();
    return (CLASS_ACTIVITIES as readonly string[]).includes(last) ? "" : last;
  });
  const [minutes, setMinutes] = useState(45);
  const [effort, setEffort] = useState<(typeof EFFORT)[number]["key"] | null>(null);
  const [day, setDay] = useState(date);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const title = activity === "Other" ? other.trim() : activity;

  const save = async () => {
    if (!title) return setError("What was the class?");
    setError(null);
    setPending(true);
    const id = crypto.randomUUID();
    const rpe = EFFORT.find((e) => e.key === effort)?.rpe;
    const input: LogInput = { id, date: day, kind: "class", title, km: "", time: `${minutes}:00`, rpe: rpe ? String(rpe) : "", pain: {}, notes: "" };
    const r = await send({ id, t: "log", input });
    setPending(false);
    if (r === "sent" || r === "queued") {
      try {
        localStorage.setItem(LAST_KEY, title);
      } catch {}
      notify({ text: r === "sent" ? `${title} saved. Counts as extra work.` : `${title} saved on this phone. Syncs when you're back online.`, tone: "good" });
      onClose();
    } else setError(r.error);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log a class"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[520px] flex-col gap-3.5 overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label">Log a class</div>
            <h3 className="truncate font-display text-xl font-bold">{day === today ? "Today" : dates.day(day)}</h3>
          </div>
          <button ref={closeRef} className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>

        <section className="flex flex-col gap-1.5">
          <div className="label">Class</div>
          <div className="flex flex-wrap gap-2">
            {[...CLASS_ACTIVITIES, "Other"].map((a) => (
              <Pick key={a} on={activity === a} onClick={() => setActivity(a)}>
                {a}
              </Pick>
            ))}
          </div>
          {activity === "Other" && (
            <input aria-label="Class name" autoFocus value={other} maxLength={60} onChange={(e) => setOther(e.target.value)} placeholder="Climbing, dance, rowing…" className="input" />
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <div className="label">How long</div>
          <div className="flex flex-wrap items-center gap-2">
            {MINUTES.map((m) => (
              <Pick key={m} on={minutes === m} onClick={() => setMinutes(m)}>
                {m} min
              </Pick>
            ))}
            <span className="ml-auto flex items-center gap-1">
              <button type="button" aria-label="5 minutes less" className="btn-ghost min-w-11" onClick={() => setMinutes((m) => Math.max(5, m - 5))}>
                −
              </button>
              <span className="min-w-[4.5ch] text-center font-semibold tabular-nums">{minutes} min</span>
              <button type="button" aria-label="5 minutes more" className="btn-ghost min-w-11" onClick={() => setMinutes((m) => Math.min(240, m + 5))}>
                +
              </button>
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <div className="label">Effort (optional)</div>
          <div className="flex flex-wrap gap-2">
            {EFFORT.map((e) => (
              <Pick key={e.key} on={effort === e.key} onClick={() => setEffort(effort === e.key ? null : e.key)}>
                {e.label}
              </Pick>
            ))}
          </div>
        </section>

        <label className="flex flex-col gap-1.5">
          <span className="label">Day</span>
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="input" />
        </label>

        <p className="text-sm text-muted">Classes are extra work: they add to your Score in weeks that are on track, and never replace a planned workout.</p>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button className="btn" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save class"}
        </button>
      </div>
    </div>
  );
}

/** "✓ Yoga 45 min · extra" for each class logged on a day */
export function ClassLines({ logs, date }: { logs: LogRow[]; date: ISODate }) {
  const classes = logs.filter((l) => l.kind === "class" && l.date === date);
  if (!classes.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {classes.map((l) => (
        <li key={l.id}>
          <span className="font-bold text-good">✓</span> {l.title}
          {l.duration_sec ? ` ${Math.round(l.duration_sec / 60)} min` : ""} <span className="text-muted">· extra{l.queued ? " · waiting to sync" : ""}</span>
        </li>
      ))}
    </ul>
  );
}
