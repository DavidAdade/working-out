"use client";

// "Swap for another day": a plan day does another day's workout instead, from anywhere in the program.
// Every candidate is compared by intensity (lib/plan/intensity.ts): a match counts in full, anything else can
// still be picked but is warned about, and costs Score credit once done. Saved as a day copy (DayCopy in generate.ts).

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { dowName, fmtShort, type ISODate } from "@/lib/plan/dates.ts";
import { canCopy, copyNote, dayTitle, ownBlocks, planDateOf, weekForDate, PHASE_NAMES, type Day, type Week } from "@/lib/plan/generate.ts";
import { compareDays, dayIntensity, fitBadge, fitWarning, COPY_TOLERANCE, type CopyFit, type Intensity } from "@/lib/plan/intensity.ts";
import type { BlockKind } from "@/lib/plan/templates.ts";
import { Chip, PreviewBlocks } from "./DayView";
import { useDates } from "./DateLabels";

/* ---------- saving a copy: provided by the Dashboard, which owns the plan ---------- */
export interface CopyApi {
  /** The plan as shown, to list every other day */
  weeks: Week[];
  /** Plan day `planDate` does plan day `source`'s workout (null puts its own back); `note` shows once saved, with Undo */
  copy: (planDate: ISODate, source: ISODate | null, note: string) => void;
}

const Ctx = createContext<CopyApi | null>(null);
export const CopyProvider = Ctx.Provider;
/** Null where copying isn't offered */
export const useCopy = () => useContext(Ctx);

/** Tests, the time trial and the race never take another workout */
export const copyable = (day: Day) => !day.fixed && !day.skipped && !ownBlocks(day).some((b) => b.kind === "test");

/** "W7 Wed": a plan date by its week and weekday */
const where = (weeks: Week[], date: ISODate) => `${weekForDate(weeks, date)?.label ?? ""} ${dowName(date)}`.trim();

const kindsOf = (d: Day) => [...new Set(ownBlocks(d).map((b) => b.kind))] as BlockKind[];

interface Candidate {
  week: Week;
  day: Day;
  /** The candidate's plan date: what the copy stores */
  source: ISODate;
  cand: Intensity;
  fit: CopyFit;
  /** Why it can't be picked, or null */
  why: string | null;
}

/** "Copied from W7 Wed" on a copied day, with Undo while nothing is logged. */
export function CopiedLine({ day, logged }: { day: Day; logged: Set<ISODate> }) {
  const api = useCopy();
  const dates = useDates();
  if (!day.copy || !api) return null;
  const { from, fit, replaced } = day.copy;
  const own = dayTitle({ ...day, blocks: replaced });
  return (
    <div className="flex flex-col text-sm text-muted">
      <div className="flex items-center justify-between gap-2">
        <span>
          Copied from {where(api.weeks, from)}
          {dates.hide ? "" : ` ${fmtShort(from)}`}
        </span>
        {!logged.has(day.date) && (
          <button className="min-h-11 px-1 font-semibold text-ink underline underline-offset-2" onClick={() => api.copy(planDateOf(day), null, `${own} is back on ${dowName(day.date)}.`)}>
            Undo
          </button>
        )}
      </div>
      {!fit.match && <span className="text-warn">Intensity doesn&apos;t match: counts as {Math.round(fit.credit * 100)}% of this day in your Score.</span>}
    </div>
  );
}

/** Pick any other day of the program, see its workout, then use it here. */
export function CopySheet({ day, today, logged, onClose }: { day: Day; today: ISODate; logged: Set<ISODate>; onClose: () => void }) {
  const api = useCopy();
  const dates = useDates();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const weeks = api?.weeks;
  const planDate = planDateOf(day);

  const { orig, list, closest } = useMemo(() => {
    const orig = dayIntensity({ blocks: ownBlocks(day) });
    const list: Candidate[] = (weeks ?? []).flatMap((week) =>
      week.days
        .filter((d) => planDateOf(d) !== planDate)
        .map((d) => {
          const cand = dayIntensity({ blocks: ownBlocks(d) });
          const source = planDateOf(d);
          return { week, day: d, source, cand, fit: compareDays(orig, cand), why: day.copy?.from === source ? "Doing this one now." : canCopy(weeks!, planDate, source, today, logged) };
        }),
    );
    const gap = (c: Candidate) => Math.abs(c.fit.ratio - 1);
    const closest = list.filter((c) => c.fit.match && !c.why).sort((a, b) => gap(a) - gap(b)).slice(0, 5);
    return { orig, list, closest };
  }, [weeks, day, planDate, today, logged]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  // Each step starts at the top with focus on its first button
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), [picked]);

  if (!api || !weeks) return null;
  const title = dayTitle(day);

  const row = (c: Candidate, withWeek: boolean) => (
    <li key={`${withWeek ? "top" : "all"}-${c.source}`}>
      <button
        disabled={!!c.why}
        onClick={() => setPicked(c)}
        className={`grid min-h-11 w-full grid-cols-[3.5rem_1fr_auto] items-center gap-2 rounded-lg border border-line px-3 py-2 text-left ${c.why ? "opacity-45" : "active:bg-sunk"}`}
      >
        <span className="flex flex-col leading-tight">
          <b>{withWeek ? where(weeks, c.source) : dowName(c.day.date)}</b>
          {!dates.hide && <span className="text-xs text-muted">{fmtShort(c.day.date)}</span>}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-semibold">{dayTitle({ ...c.day, blocks: ownBlocks(c.day) })}</span>
          {c.why ? (
            <span className="text-xs text-muted">{c.why}</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {kindsOf(c.day).map((k) => (
                <Chip key={k} kind={k} />
              ))}
            </span>
          )}
        </span>
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${c.fit.match ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{fitBadge(c.fit, c.cand)}</span>
      </button>
    </li>
  );

  const confirm = (c: Candidate) => {
    const name = dayTitle({ ...c.day, blocks: ownBlocks(c.day) });
    const cost = c.fit.match ? "" : ` It counts as ${Math.round(c.fit.credit * 100)}% in your Score.`;
    api.copy(planDate, c.source, `Doing ${where(weeks, c.source)}'s ${name} on ${day.date === today ? "today" : dowName(day.date)} instead.${cost}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        key={picked?.source ?? "list"}
        role="dialog"
        aria-modal="true"
        aria-label={`Swap ${title} for another day`}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85dvh] w-full max-w-[520px] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 sm:rounded-2xl ${picked ? "pb-0" : "pb-[max(16px,env(safe-area-inset-bottom,0px))]"}`}
      >
        {picked ? (
          <Preview candidate={picked} orig={orig} weeks={weeks} planDate={planDate} closeRef={closeRef} onBack={() => setPicked(null)} onUse={() => confirm(picked)} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="label">Swap for another day</div>
                <h3 className="truncate font-display text-xl font-bold">{title}</h3>
              </div>
              <button ref={closeRef} className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
            <p className="text-sm text-muted">
              Do another day&apos;s workout here instead. A match is the same kind of day within {Math.round(COPY_TOLERANCE * 100)}% of this one&apos;s intensity; anything else counts for less in your Score.
            </p>
            {closest.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <div className="label">Closest match</div>
                <ul className="flex flex-col gap-1.5">{closest.map((c) => row(c, true))}</ul>
              </section>
            )}
            {weeks.map((w) => {
              const rows = list.filter((c) => c.week === w);
              if (!rows.length) return null;
              return (
                <section key={w.start} className="flex flex-col gap-1.5">
                  <div className="label">
                    {w.label} · {PHASE_NAMES[w.phase]}
                    {w.cutback ? " · Cutback" : ""}
                  </div>
                  <ul className="flex flex-col gap-1.5">{rows.map((c) => row(c, false))}</ul>
                </section>
              );
            })}
            <p className="text-xs text-muted">Tests, the time trial and the race stay as planned, and a day with anything logged keeps its workout.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Step 2: the candidate day and all its workouts, with the warning when it doesn't match. */
function Preview({
  candidate: c,
  orig,
  weeks,
  planDate,
  closeRef,
  onBack,
  onUse,
}: {
  candidate: Candidate;
  orig: Intensity;
  weeks: Week[];
  planDate: ISODate;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onUse: () => void;
}) {
  const blocks = ownBlocks(c.day);
  const warning = fitWarning(c.fit, orig, c.cand);
  const note = copyNote(weeks, planDate, c.source);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label">
            {where(weeks, c.source)} · {PHASE_NAMES[c.week.phase]}
          </div>
          <h3 className="font-display text-xl font-bold">{dayTitle({ ...c.day, blocks })}</h3>
        </div>
        <span className={`mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${c.fit.match ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{fitBadge(c.fit, c.cand)}</span>
      </div>
      {warning && (
        <div role="alert" className="rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm">
          {warning}
        </div>
      )}
      {note && <p className="text-sm text-muted">{note}</p>}
      <PreviewBlocks blocks={blocks} />
      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-1.5 border-t border-line bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] pt-3">
        {!c.fit.match && <p className="text-xs text-muted">Counts as {Math.round(c.fit.credit * 100)}% of this day in your Score once done.</p>}
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={onUse}>
            Use this workout
          </button>
          <button ref={closeRef} className="btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </>
  );
}
