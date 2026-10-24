"use client";

import { fmtShort, mondayOf } from "@/lib/plan/dates.ts";
import { duration, pace } from "@/lib/plan/format.ts";
import type { PlanSettings } from "@/lib/plan/generate.ts";
import type { LogRow } from "@/lib/types";
import { BarChart, LineChart } from "./charts";

const AREA_COLORS = ["rgb(var(--area1))", "rgb(var(--area2))", "rgb(var(--area3))"];

export default function ProgressPanel({ logs, settings, painAreas }: { logs: LogRow[]; settings: PlanSettings; painAreas: string[] }) {
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

  const painLogs = asc.slice(-24);
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

      {painAreas.length > 0 && (
        <article className="card">
          <div className="label">Pain scores, last 24 sessions</div>
          {painLogs.length ? (
            <>
              <LineChart
                series={painAreas.map((a, i) => ({ color: AREA_COLORS[i % 3], values: painLogs.map((l) => l.pain?.[a] ?? 0) }))}
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
