"use client";

import { useState } from "react";
import { PHASE_NAMES, weekLongRunKm, type Week } from "@/lib/plan/generate.ts";
import { dowName, fmtShort } from "@/lib/plan/dates.ts";
import type { LogRow } from "@/lib/types";
import { DayBlocks } from "./DayView";
import { useDates } from "./DateLabels";
import { planDayOf, useSets } from "./Sets";

export default function WeekCard({
  week,
  logs,
  today,
  onSkip,
  open = false,
  todayAbove = false,
}: {
  week: Week;
  logs: LogRow[];
  today: string;
  onSkip: (d: string, s: boolean) => void;
  open?: boolean;
  /** On the Today tab, today's workout is already shown above, so this card just points to it */
  todayAbove?: boolean;
}) {
  const { sets } = useSets();
  const logged = new Set([...logs.filter((l) => l.kind !== "check" && !l.auto).map((l) => l.date), ...sets.map(planDayOf)]);
  const active = week.days.filter((d) => !d.skipped);
  const past = active.filter((d) => d.date <= today);
  const done = active.filter((d) => logged.has(d.date)).length;
  const km = weekLongRunKm(week);
  const dates = useDates();
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
        <>
          {week.notes.length > 0 && (
            <div className="mx-3.5 mb-2 rounded-lg border border-warn bg-warn/10 px-3 py-1.5 text-[0.82rem]">
              {week.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
          <div className="flex flex-col border-t border-line">
            {week.days.map((d) => (
              <section key={d.date} className={`flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5 first:border-t-0 ${d.date === today ? "bg-accent/[0.08]" : ""} ${d.skipped ? "opacity-60" : ""}`}>
                <h4 className="flex items-baseline gap-2 text-sm">
                  <b className="text-ink">{dowName(d.date)}</b>
                  {!dates.hide && <span className="text-muted">{fmtShort(d.date)}</span>}
                  {d.date === today && <span className="font-semibold text-accent-ink">Today</span>}
                  {logged.has(d.date) && <span className="font-bold text-good">✓</span>}
                </h4>
                {todayAbove && d.date === today ? <p className="text-sm text-muted">Today&apos;s workout is above.</p> : <DayBlocks day={d} onSkip={onSkip} today={today} />}
              </section>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
