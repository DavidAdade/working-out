"use client";

import { addDays, mondayOf } from "@/lib/plan/dates.ts";
import { painTrend, wins } from "@/lib/plan/ontrack.ts";
import { duration, pace } from "@/lib/plan/format.ts";
import type { PlanSettings } from "@/lib/plan/generate.ts";
import type { LogRow } from "@/lib/types";
import { BarChart, LineChart } from "./charts";
import { useDates } from "./DateLabels";
import { ChangeBanner, fmtWeight, useSets } from "./Sets";
import { compareSession, sessions } from "@/lib/plan/progress.ts";
import { REGIONS, regionOf, type Region } from "@/lib/plan/muscles.ts";
import { useState } from "react";

const AREA_COLORS = ["rgb(var(--area1))", "rgb(var(--area2))", "rgb(var(--area3))"];

export default function ProgressPanel({ logs, settings, painAreas, today }: { logs: LogRow[]; settings: PlanSettings; painAreas: string[]; today: string }) {
  const { short: fmtShort } = useDates();
  const { sets, nameOf } = useSets();
  const trend = painTrend(logs, painAreas, today);
  const recent = wins(logs, sets, nameOf, addDays(today, -27), today);
  const asc = [...logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const isDist = (l: LogRow, km: number, tol: number) => l.kind === "test" && l.km != null && Math.abs(l.km - km) <= tol && !!l.duration_sec;
  const t5 = asc.filter((l) => isDist(l, 5, 0.3));
  const t10 = asc.filter((l) => isDist(l, 10, 0.5));
  const best5 = t5.length ? Math.min(...t5.map((l) => l.duration_sec!)) : null;
  const goal = settings.goal5kSec;

  const pts = [{ label: "Start", sec: settings.current5kSec }, ...t5.map((l) => ({ label: fmtShort(l.date), sec: l.duration_sec! }))];
  const lo = Math.floor(Math.min(goal, ...pts.map((p) => p.sec)) / 60) - 2;
  const hi = Math.ceil(Math.max(...pts.map((p) => p.sec)) / 60) + 2;

  const weekly = new Map<string, number>();
  for (const l of asc) if (l.km && l.kind !== "strength") weekly.set(mondayOf(l.date), (weekly.get(mondayOf(l.date)) ?? 0) + l.km);
  const wks = [...weekly.keys()].sort().slice(-12);

  const painLogs = asc.filter((l) => !l.auto && Object.keys(l.pain ?? {}).length > 0).slice(-24);
  const easy = asc.filter((l) => l.kind === "run" && l.km && l.duration_sec && /easy|long/i.test(l.title ?? "")).slice(-20);
  const easyPaces = easy.map((l) => l.duration_sec! / l.km! / 60);

  return (
    <section className="flex flex-col gap-3.5">
      <article className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="label">5K results</div>
            <h3 className="font-display text-xl font-bold">{best5 ? `Best ${duration(best5)}` : `Start point ${duration(settings.current5kSec)}`}</h3>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${best5 && best5 < goal ? "bg-good/15 text-good" : "bg-sunk"}`}>Goal {duration(goal - 1)}</span>
        </div>
        <LineChart series={[{ color: "rgb(var(--accent))", values: pts.map((p) => p.sec / 60) }]} labels={pts.map((p) => p.label)} yMin={lo} yMax={hi} goal={goal / 60} goalLabel={duration(goal)} yFmt={(v) => `${Math.round(v)}m`} />
        <p className="text-sm text-muted">Log tests as type &quot;Test&quot; with a 5 km distance.</p>
        {t10.length > 0 && (
          <p className="text-sm">
            <span className="label">10K tests </span>
            {t10.map((l) => `${fmtShort(l.date)}: ${duration(l.duration_sec!)}`).join(" · ")}
          </p>
        )}
      </article>

      <article className="card">
        <div className="label">Weekly running distance</div>
        {wks.length ? (
          <>
            <BarChart values={wks.map((w) => +(weekly.get(w) ?? 0).toFixed(1))} labels={wks.map(fmtShort)} yFmt={(v) => `${Math.round(v)}`} />
            <p className="text-sm text-muted">Aim for no more than about 10% more than the previous week.</p>
          </>
        ) : (
          <Empty>Kilometres per week appear here once you log runs with a distance.</Empty>
        )}
      </article>

      {recent.length > 0 && (
        <article className="card gap-1.5">
          <div className="label">Wins, last 4 weeks</div>
          <ul className="flex flex-col gap-1">
            {recent.slice(0, 10).map((w) => (
              <li key={w.date + w.text} className="flex items-baseline gap-2 text-[0.95rem]">
                <span aria-hidden className="text-good">▲</span>
                <span className="min-w-0 flex-1">{w.text}</span>
                <span className="text-xs text-muted">{fmtShort(w.date)}</span>
              </li>
            ))}
          </ul>
        </article>
      )}

      <LiftsCard />

      {painAreas.length > 0 && (
        <article className="card">
          <div className="label">Pain scores, last 24 sessions and check-ins</div>
          {trend.length > 0 && <p className="text-sm first-letter:uppercase">This week: {trend.join(", ")}</p>}
          {painLogs.length ? (
            <>
              <LineChart
                series={painAreas.map((a, i) => ({ color: AREA_COLORS[i % 3], values: painLogs.map((l) => l.pain?.[a] ?? null) }))}
                labels={painLogs.map((l) => fmtShort(l.date))}
                yMin={0}
                yMax={10}
                goal={3}
                goalLabel="back-off line"
                yFmt={(v) => `${Math.round(v)}`}
                height={210}
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.78rem] capitalize text-muted">
                {painAreas.map((a, i) => (
                  <span key={a} className="inline-flex items-center gap-1">
                    <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: AREA_COLORS[i % 3] }} />
                    {a}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <Empty>Each logged session adds its pain scores here. Anything at 3 or above means hold volume.</Empty>
          )}
        </article>
      )}

      {easyPaces.length >= 2 && (
        <article className="card">
          <div className="label">Easy and long run pace</div>
          <LineChart
            series={[{ color: "rgb(var(--area2))", values: easyPaces }]}
            labels={easy.map((l) => fmtShort(l.date))}
            yMin={Math.floor(Math.min(...easyPaces)) - 0.5}
            yMax={Math.ceil(Math.max(...easyPaces)) + 0.5}
            yFmt={(v) => pace(v * 60)}
          />
          <p className="text-sm text-muted">The same easy effort getting faster means your aerobic base is growing.</p>
        </article>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed border-line p-4 text-center text-muted">{children}</div>;
}

const PAGE = 8;

/** Every exercise you've logged: latest top set, change vs the session before, tap for full history. */
function LiftsCard() {
  const { sets, unit, openHistory, exercises } = useSets();
  const dates = useDates();
  const [region, setRegion] = useState<Region | null>(null);
  const [page, setPage] = useState(0);
  const all = exercises
    .map((ex) => {
      const history = sessions(sets, ex.key);
      const latest = history[0];
      if (!latest) return null;
      const prev = history.slice(1).find((s) => !s.light);
      const change = ex.load === "weight" ? compareSession(history, latest.date) : null;
      return { ex, latest, prev, change, region: regionOf(ex.primary_muscles) };
    })
    .filter((r) => r !== null)
    .sort((a, b) => (a.latest.date < b.latest.date ? 1 : a.latest.date > b.latest.date ? -1 : a.ex.name.localeCompare(b.ex.name)));
  const rows = region ? all.filter((r) => r.region === region) : all;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * PAGE, current * PAGE + PAGE);
  const pick = (r: Region | null) => {
    setRegion(r);
    setPage(0);
  };

  return (
    <article className="card">
      <div className="label">Lifts</div>
      {all.length === 0 ? (
        <Empty>Tick sets on a lifting day and each exercise shows its trend here.</Empty>
      ) : (
        <>
          {rows.filter((r) => r.change).map((r) => (
            <ChangeBanner key={r.ex.key} change={r.change!} exerciseKey={r.ex.key} name={r.ex.name} />
          ))}
          <div className="flex gap-1.5" role="group" aria-label="Body region">
            {[null, ...REGIONS].map((r) => {
              const n = r ? all.filter((x) => x.region === r).length : all.length;
              return (
                <button
                  key={r ?? "all"}
                  type="button"
                  aria-pressed={region === r}
                  onClick={() => pick(r)}
                  className={`min-h-11 flex-1 rounded-full border px-2 text-sm font-semibold ${region === r ? "border-ink bg-ink text-bg" : "border-line bg-surface"}`}
                >
                  {r ?? "All"} <span className="font-normal opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <ul className="flex flex-col">
            {shown.map(({ ex, latest, prev }) => {
              const weighted = ex.load === "weight" && latest.topKg != null;
              const now = weighted ? latest.topKg! : latest.best ?? 0;
              const before = prev ? (weighted ? prev.topKg : prev.best) : null;
              const diff = before == null ? null : now - before;
              return (
                <li key={ex.key} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => openHistory(ex.key)} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left">
                    <span className="min-w-0">
                      <b className="block truncate">{ex.name}</b>
                      <span className="text-xs text-muted">{dates.day(latest.date)}</span>
                    </span>
                    <span className="flex items-center gap-2 font-mono text-sm">
                      {weighted ? `${fmtWeight(now, unit)} ${unit}` : `${now}${ex.load === "time" ? "s" : " reps"}`}
                      {diff != null && (
                        <span className={diff > 0 ? "text-good" : diff < 0 ? "text-bad" : "text-muted"}>{diff > 0 ? "▲" : diff < 0 ? "▼" : "="}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label="Lifts pages">
              <button type="button" className="btn-ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
                ‹ Prev
              </button>
              <span className="text-sm text-muted">
                {current * PAGE + 1}–{current * PAGE + shown.length} of {rows.length}
              </span>
              <button type="button" className="btn-ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                Next ›
              </button>
            </nav>
          )}
        </>
      )}
    </article>
  );
}
