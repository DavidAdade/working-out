"use client";

import { dayTitle, PHASE_NAMES, weekLongRunKm, type Week } from "@/lib/plan/generate.ts";
import { addDays, dowName, fmtShort } from "@/lib/plan/dates.ts";
import type { LogRow } from "@/lib/types";
import { DayBlocks } from "./DayView";

export default function WeekCard({ week, logs, today, onSkip, open = false }: { week: Week; logs: LogRow[]; today: string; onSkip: (d: string, s: boolean) => void; open?: boolean }) {
  const logged = new Set(logs.map((l) => l.date));
  const active = week.days.filter((d) => !d.skipped);
  const past = active.filter((d) => d.date <= today);
  const done = active.filter((d) => logged.has(d.date)).length;
  const km = weekLongRunKm(week);

  return (
    <details open={open} className="group rounded-[10px] border border-line bg-surface open:border-ink">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-2.5 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-[2.6em] font-display text-xl font-bold">{week.label}</span>
        <span>
          <b>
            {PHASE_NAMES[week.phase]}
            {week.cutback ? " · cutback" : ""}
          </b>
          <br />
          <span className="text-[0.82rem] text-muted">
            {fmtShort(week.start)} – {fmtShort(addDays(week.start, 6))}
            {km ? ` · long run ${km} km` : ""} · {active.length} days
          </span>
        </span>
        {past.length ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${done >= past.length ? "bg-good/15 text-good" : "bg-sunk"}`}>
            {done}/{active.length}
          </span>
        ) : (
          <span />
        )}
      </summary>
      {week.notes.length > 0 && (
        <div className="mx-3.5 mb-2 rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm">
          {week.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
      <div className="flex flex-col border-t border-line">
        {week.days.map((d) => (
          <div key={d.date} className={`grid grid-cols-[3.2em_1fr] gap-2.5 border-t border-line px-3.5 py-2.5 first:border-t-0 ${d.date === today ? "bg-accent/[0.08]" : ""} ${d.skipped ? "opacity-60" : ""}`}>
            <div className="text-[0.78rem] leading-tight text-muted">
              <b className="block text-[0.9rem] text-ink">{dowName(d.date)}</b>
              {fmtShort(d.date)}
            </div>
            <div className="min-w-0">
              <div className="mb-1 font-semibold">
                {d.skipped ? <s>{dayTitle(d)}</s> : dayTitle(d)} {logged.has(d.date) && <span className="font-bold text-good">✓</span>}
              </div>
              <DayBlocks day={d} onSkip={onSkip} compact />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
