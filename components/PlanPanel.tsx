"use client";

import { PHASE_NAMES, weekForDate, type Phase, type Week } from "@/lib/plan/generate.ts";
import { addDays, dowName, fmtShort } from "@/lib/plan/dates.ts";
import type { LogRow } from "@/lib/types";
import { useState } from "react";
import WeekCard from "./WeekCard";
import type { OnMoves } from "./DayCard";
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

export default function PlanPanel({ weeks, logs, today, onSkip, onMoves }: { weeks: Week[]; logs: LogRow[]; today: string; onSkip: (d: string, s: boolean) => void; onMoves: OnMoves }) {
  const current = weekForDate(weeks, today);
  const phases = [...new Set(weeks.map((w) => w.phase))];
  const last = weeks[weeks.length - 1];
  const dates = useDates();
  const PAGE = 6;
  const [page, setPage] = useState(() => Math.max(0, Math.floor(weeks.findIndex((w) => w === current) / PAGE)));
  const { pages, current: cur, shown } = usePage(weeks, PAGE, page);
  // A typical week to explain the pattern: this one, or the first running week before the plan starts
  const sample = current?.phase !== "recovery" && current ? current : weeks.find((w) => w.phase !== "recovery") ?? current;
  const range = (ws: Week[]) => `${ws[0].label}–${ws[ws.length - 1].label} of ${weeks.length}`;

  return (
    <section className="flex flex-col gap-3.5">
      <article className="card">
        <div>
          <div className="label">{weeks.length} weeks</div>
          {!dates.hide && (
            <div className="text-sm font-semibold">
              {fmtShort(weeks[0].start)} – {fmtShort(addDays(last.start, 6))}
            </div>
          )}
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
        {sample && (
          <details className="group border-t border-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
              How a week works
              <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {sample.days.map((d) => (
                <li key={d.date} className="grid grid-cols-[2.75rem_1fr] gap-2 py-1.5">
                  <b>{dowName(d.date)}</b>
                  <span className="text-muted">{d.blocks.map((b) => b.title).join(" · ")}</span>
                </li>
              ))}
            </ul>
            <p className="pt-2 text-xs text-muted">Need a different day? Open a day and move it anywhere in its week. Doing 4 days one week? Skip a day and its upper-body work moves to another lift day.</p>
          </details>
        )}
      </article>
      <Pager current={cur} pages={pages} label={range(shown)} onPage={setPage} />
      <div id="plan-weeks" className="flex scroll-mt-16 flex-col gap-3.5">
        {shown.map((w) => (
          <WeekCard key={w.start} week={w} logs={logs} today={today} onSkip={onSkip} onMoves={onMoves} open={w === current} />
        ))}
      </div>
      <Pager current={cur} pages={pages} label={range(shown)} onPage={setPage} listId="plan-weeks" />
    </section>
  );
}
