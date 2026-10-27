"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, dowName, fmtShort, type ISODate } from "@/lib/plan/dates.ts";
import { dayTitle, moveDay, type Day, type Move, type Week } from "@/lib/plan/generate.ts";
import type { BlockKind } from "@/lib/plan/templates.ts";
import { Chip, DayBlocks } from "./DayView";
import { useDates } from "./DateLabels";

export type OnMoves = (week: ISODate, moves: Move[]) => void;

/**
 * Where the workout on `from` can go: later this week (or today), onto a day with nothing logged or skipped.
 * A day that already has a workout trades places with it.
 */
export function moveTargets(week: Week, from: ISODate, today: ISODate, logged: Set<ISODate>) {
  return [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const date = addDays(week.start, n);
    const there = week.days.find((d) => d.date === date);
    const ok = date !== from && date >= today && !logged.has(date) && !there?.skipped;
    const moves = ok ? moveDay(week, from, date) : null;
    return { date, there, moves };
  });
}

/** One day of the plan: a one-line summary that opens to its workout, with Skip and Move. */
export default function DayCard({
  week,
  day,
  today,
  logged,
  onSkip,
  onMoves,
  todayAbove = false,
}: {
  week: Week;
  day: Day;
  today: ISODate;
  logged: Set<ISODate>;
  onSkip: (date: ISODate, skip: boolean) => void;
  onMoves: OnMoves;
  /** On the Today tab, today's workout is already shown above, so this card just points to it */
  todayAbove?: boolean;
}) {
  const dates = useDates();
  const isToday = day.date === today;
  const done = logged.has(day.date);
  // Closed days render nothing inside, so a week stays light
  const [isOpen, setOpen] = useState(isToday && !todayAbove);
  const [moving, setMoving] = useState(false);
  const kinds = [...new Set(day.blocks.map((b) => b.kind))] as BlockKind[];
  const canMove = !day.skipped && !day.fixed && !done && moveTargets(week, day.date, today, logged).some((t) => t.moves);
  const undo = day.movedFrom && !done && !logged.has(day.movedFrom) ? moveDay(week, day.date, day.movedFrom) : null;

  return (
    <details
      open={isOpen}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={`group/day rounded-[10px] border bg-surface ${isToday ? "border-accent" : "border-line"} ${day.skipped ? "opacity-60" : ""}`}
    >
      <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[2.75rem_1fr_auto] items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col leading-tight">
          <b>{dowName(day.date)}</b>
          {!dates.hide && <span className="text-xs text-muted">{fmtShort(day.date)}</span>}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={`truncate font-semibold ${day.skipped ? "line-through" : ""}`}>{dayTitle(day)}</span>
          <span className="flex flex-wrap gap-1">
            {kinds.map((k) => (
              <Chip key={k} kind={k} />
            ))}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {done ? (
            <span className="font-bold text-good" aria-label="Done">
              ✓
            </span>
          ) : day.skipped ? (
            <span className="text-xs font-semibold text-muted">Skipped</span>
          ) : isToday ? (
            <span className="text-xs font-semibold text-accent-ink">Today</span>
          ) : day.movedFrom ? (
            <span className="text-xs font-semibold text-muted">Moved</span>
          ) : null}
          <span aria-hidden className="text-muted transition-transform group-open/day:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      {isOpen && (
        <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5">
          {day.movedFrom && (
            <div className="flex items-center justify-between gap-2 text-sm text-muted">
              <span>Moved from {dates.hide ? dowName(day.movedFrom) : `${dowName(day.movedFrom)} ${fmtShort(day.movedFrom)}`}</span>
              {undo && (
                <button className="min-h-11 px-1 font-semibold text-ink underline underline-offset-2" onClick={() => onMoves(week.start, undo)}>
                  Undo
                </button>
              )}
            </div>
          )}
          {todayAbove && isToday ? (
            <p className="text-sm text-muted">Today&apos;s workout is above.</p>
          ) : (
            <DayBlocks day={day} onSkip={onSkip} today={today} onMove={canMove ? () => setMoving(true) : undefined} />
          )}
        </div>
      )}
      {moving && (
        <MoveSheet
          week={week}
          day={day}
          today={today}
          logged={logged}
          onClose={() => setMoving(false)}
          onPick={(moves) => {
            setMoving(false);
            onMoves(week.start, moves);
          }}
        />
      )}
    </details>
  );
}

/** Pick a day this week. An empty day takes the workout; a day with one swaps with it. */
export function MoveSheet({ week, day, today, logged, onClose, onPick }: { week: Week; day: Day; today: ISODate; logged: Set<ISODate>; onClose: () => void; onPick: (moves: Move[]) => void }) {
  const dates = useDates();
  const closeRef = useRef<HTMLButtonElement>(null);
  const targets = moveTargets(week, day.date, today, logged);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Move ${dayTitle(day)}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[520px] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="label">Move to another day</div>
            <h3 className="truncate font-display text-xl font-bold">{dayTitle(day)}</h3>
          </div>
          <button ref={closeRef} className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {targets.map(({ date, there, moves }) => {
            const self = date === day.date;
            return (
              <li key={date}>
                <button
                  disabled={!moves}
                  onClick={() => moves && onPick(moves)}
                  className={`grid min-h-11 w-full grid-cols-[3.5rem_1fr_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left ${self ? "border-ink" : "border-line"} ${moves ? "active:bg-sunk" : "opacity-45"}`}
                >
                  <span className="flex flex-col leading-tight">
                    <b>{dowName(date)}</b>
                    {!dates.hide && <span className="text-xs text-muted">{fmtShort(date)}</span>}
                  </span>
                  <span className="truncate text-sm text-muted">{self ? "Now" : there ? (there.skipped ? "Skipped" : dayTitle(there)) : "Rest"}</span>
                  {moves && <span className="text-sm font-semibold text-accent-ink">{there ? "Swap" : "Move here"}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">Workouts stay in their week. Past days, logged days and the time trial or race can&apos;t take a move.</p>
      </div>
    </div>
  );
}
