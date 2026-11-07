"use client";

import { useState } from "react";
import { PHASE_NAMES, weekLongRunKm, type Week } from "@/lib/plan/generate.ts";
import type { LogRow, SetRow } from "@/lib/types";
import DayCard, { RestRow, type OnMoves } from "./DayCard";
import { restDates, useCopy } from "./CopySheet";
import { useDates } from "./DateLabels";
import { planDayOf, useSets } from "./Sets";

/** Dates with a session or sets logged against them (sets done early count for the plan day). */
export const loggedDates = (logs: LogRow[], sets: SetRow[]) => new Set([...logs.filter((l) => l.kind !== "check" && !l.auto).map((l) => l.date), ...sets.map(planDayOf)]);

export default function WeekCard({
  week,
  logs,
  today,
  onSkip,
  onMoves,
  open = false,
  todayAbove = false,
}: {
  week: Week;
  logs: LogRow[];
  today: string;
  onSkip: (d: string, s: boolean) => void;
  onMoves: OnMoves;
  open?: boolean;
  /** On the Today tab, today's workout is already shown above, so this card just points to it */
  todayAbove?: boolean;
}) {
  const { sets } = useSets();
  const logged = loggedDates(logs, sets);
  // Added workouts are extra: they don't change what the week asks for
  const active = week.days.filter((d) => !d.skipped && !d.added);
  const canAdd = !!useCopy();
  const past = active.filter((d) => d.date <= today);
  const done = active.filter((d) => logged.has(d.date)).length;
  const km = weekLongRunKm(week);
  const dates = useDates();
  const moved = week.days.filter((d) => d.movedFrom);
  // Putting the week back would hand logged sets to a different workout
  const canReset = moved.length > 0 && moved.every((d) => !logged.has(d.date) && !logged.has(d.movedFrom!));
  // Closed weeks render nothing inside, so a long plan stays light
  const [isOpen, setOpen] = useState(open);

  return (
    <details open={isOpen} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-[10px] border border-line bg-surface open:border-ink">
      <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-2.5 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-[2.6em] font-display text-xl font-bold">{week.label}</span>
        <span>
          <b>
            {PHASE_NAMES[week.phase]}
            {week.cutback ? " · cutback" : ""}
          </b>
          <span className="block text-[0.82rem] font-medium text-ink/80">{dates.range(week.start)}</span>
          <span className="block text-[0.82rem] text-muted">{[km ? `Long run ${km} km` : null, `${active.length} days`].filter(Boolean).join(" · ")}</span>
        </span>
        {past.length ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${done >= past.length ? "bg-good/15 text-good" : "bg-sunk"}`}>
            {done}/{active.length}
          </span>
        ) : (
          <span />
        )}
      </summary>
      {isOpen && (
        <div className="flex flex-col gap-2 border-t border-line bg-bg/40 p-2.5">
          {week.notes.length > 0 && (
            <div className="rounded-lg border border-warn bg-warn/10 px-3 py-1.5 text-[0.82rem]">
              {week.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
          {[...week.days.map((d) => ({ date: d.date, d })), ...(canAdd ? restDates(week, today, logged).map((date) => ({ date, d: null })) : [])]
            .sort((a, b) => (a.date < b.date ? -1 : 1))
            .map(({ date, d }) =>
              d ? (
                <DayCard key={date} week={week} day={d} today={today} logged={logged} onSkip={onSkip} onMoves={onMoves} todayAbove={todayAbove} />
              ) : (
                <RestRow key={date} date={date} today={today} logged={logged} />
              ),
            )}
          {canReset && (
            <button className="min-h-11 self-start px-1 text-sm text-muted underline underline-offset-2" onClick={() => onMoves(week.start, [], `${week.label} is back as planned.`)}>
              Put this week back as planned
            </button>
          )}
        </div>
      )}
    </details>
  );
}
