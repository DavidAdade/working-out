"use client";

import { PHASE_NAMES, weekForDate, type Phase, type Week } from "@/lib/plan/generate.ts";
import { addDays, fmtShort } from "@/lib/plan/dates.ts";
import type { LogRow } from "@/lib/types";
import { useState } from "react";
import WeekCard from "./WeekCard";
import Pager, { usePage } from "./Pager";
import { useDates } from "./DateLabels";

const PHASE_COLOR: Record<Phase, string> = {
  recovery: "bg-muted",
  return: "bg-area2",
  base: "bg-good",
  build: "bg-accent",
  sharpen: "bg-area3",
  tt: "bg-ink",
  half: "bg-warn",
  taper: "bg-area3",
  race: "bg-ink",
};

export default function PlanPanel({ weeks, logs, today, onSkip }: { weeks: Week[]; logs: LogRow[]; today: string; onSkip: (d: string, s: boolean) => void }) {
  const current = weekForDate(weeks, today);
  const phases = [...new Set(weeks.map((w) => w.phase))];
  const last = weeks[weeks.length - 1];
  const dates = useDates();
  const PAGE = 6;
  const [page, setPage] = useState(() => Math.max(0, Math.floor(weeks.findIndex((w) => w === current) / PAGE)));
  const { pages, current: cur, shown } = usePage(weeks, PAGE, page);
  const range = (ws: Week[]) => `${ws[0].label}–${ws[ws.length - 1].label} of ${weeks.length}`;

  return (
    <section className="flex flex-col gap-3.5">
      <article className="card">
        <div className="label">
          {weeks.length} weeks{dates.hide ? "" : ` · ${fmtShort(weeks[0].start)} to ${fmtShort(addDays(last.start, 6))}`}
        </div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded">
          {weeks.map((w) => (
            <span key={w.start} title={PHASE_NAMES[w.phase]} className={`h-full flex-1 ${PHASE_COLOR[w.phase]} ${addDays(w.start, 6) < today ? "opacity-35" : ""}`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.78rem] text-muted">
          {phases.map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <i className={`inline-block h-2.5 w-2.5 rounded-sm ${PHASE_COLOR[p]}`} />
              {PHASE_NAMES[p]}
            </span>
          ))}
        </div>
        <details className="text-sm text-muted">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">How a week works</summary>
          Mon gym: legs + pull + abs · Tue easy run · Wed quality run + condo push + abs · Thu condo: legs + back/arms + abs · Fri long run. On a 4-day week, skip a
          day and its upper-body work moves to another lift day.
        </details>
      </article>
      <Pager current={cur} pages={pages} label={range(shown)} onPage={setPage} />
      <div id="plan-weeks" className="flex scroll-mt-16 flex-col gap-3.5">
        {shown.map((w) => (
          <WeekCard key={w.start} week={w} logs={logs} today={today} onSkip={onSkip} open={w === current} />
        ))}
      </div>
      <Pager current={cur} pages={pages} label={range(shown)} onPage={setPage} listId="plan-weeks" />
    </section>
  );
}
