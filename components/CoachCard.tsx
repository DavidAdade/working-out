"use client";

import { useState, useTransition } from "react";
import { weeklyReview, type ReviewResult } from "@/app/actions";
import type { Review } from "@/lib/coach/review";
import { useDates } from "./DateLabels";

export interface SavedReview {
  review: Review;
  createdAt: string;
}

const ACTION_LABEL = { skip: "Rest", easier: "Easier", note: "Note" } as const;

/** The weekly AI check-in: advice only. A suggested rest day is applied with one tap, nothing changes on its own. */
export default function CoachCard({ initial, onSkip, skipped }: { initial: SavedReview | null; onSkip: (date: string, skip: boolean) => void; skipped: Set<string> }) {
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dates = useDates();
  const ask = (refresh: boolean) =>
    startTransition(async () => {
      setError(null);
      let r: ReviewResult;
      try {
        r = await weeklyReview(refresh);
      } catch {
        return setError("No connection. Try again when you have signal.");
      }
      if (r.ok) setSaved({ review: r.review, createdAt: r.createdAt });
      else setError(r.error);
    });
  const stale = saved && Date.now() - Date.parse(saved.createdAt) > 12 * 3600e3;

  return (
    <article className="card gap-2" aria-busy={pending}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label">Weekly check-in</div>
          {!saved && <p className="text-sm text-muted">A coach&apos;s read of your last week and what to watch this week. Takes about 10 seconds.</p>}
        </div>
        {saved && stale && (
          <button type="button" className="btn-ghost flex-none" disabled={pending} onClick={() => ask(true)}>
            {pending ? "Reading…" : "Ask again"}
          </button>
        )}
      </div>
      {saved ? (
        <>
          <p className="text-[0.95rem]">{saved.review.summary}</p>
          {saved.review.flags.map((f) => (
            <p key={f} className="rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm">
              {f}
            </p>
          ))}
          {saved.review.suggestions.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {saved.review.suggestions.map((s) => (
                <li key={s.date + s.text} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 text-sm">
                    <b>
                      {dates.day(s.date)} · {ACTION_LABEL[s.action]}
                    </b>
                    <br />
                    {s.text}
                  </span>
                  {s.action === "skip" && (
                    <button type="button" className="btn-ghost flex-none" onClick={() => onSkip(s.date, !skipped.has(s.date))}>
                      {skipped.has(s.date) ? "Undo rest" : "Rest that day"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Advice only. Pain rules and your physio come first.</p>
        </>
      ) : (
        <button type="button" className="btn self-start" disabled={pending} onClick={() => ask(false)}>
          {pending ? "Reading your week…" : "Get this week's check-in"}
        </button>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </article>
  );
}
