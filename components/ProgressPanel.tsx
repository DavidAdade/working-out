"use client";

import { addDays, mondayOf } from "@/lib/plan/dates.ts";
import { painTrend, wins } from "@/lib/plan/ontrack.ts";
import { duration, pace } from "@/lib/plan/format.ts";
import type { PlanSettings } from "@/lib/plan/generate.ts";
import type { LogRow } from "@/lib/types";
import { BarChart, LineChart, LoadChart, Spark } from "./charts";
import { useDates } from "./DateLabels";
import { ChangeBanner, fmtWeight, useSets } from "./Sets";
import { compareSession, sessions } from "@/lib/plan/progress.ts";
import { REGIONS, regionOf, type Region } from "@/lib/plan/muscles.ts";
import { fitness5k, trainingPaces } from "@/lib/plan/paces.ts";
import { bestsByWeek, fiveKEquivalent, mondaysBetween, paceNeeded, strengthIndex, strengthSeries } from "@/lib/plan/stats.ts";
import { useMemo, useState } from "react";
import Pager, { usePage } from "./Pager";
import { GoalsToggle, useGoalsHidden } from "./GoalsHidden";

const AREA_COLORS = ["rgb(var(--area1))", "rgb(var(--area2))", "rgb(var(--area3))"];
/** Weeks shown on the weekly charts */
const WEEKS = 12;
/** Titles that mark a run as a workout, so its average pace says nothing about easy fitness */
const WORKOUT = /tempo|interval|repeat|fartlek|race|progress|strides|hill|\d\s*[×x]\s*\d/i;

export default function ProgressPanel({ logs, settings, painAreas, today }: { logs: LogRow[]; settings: PlanSettings; painAreas: string[]; today: string }) {
  const { short: fmtShort } = useDates();
  const { sets, nameOf } = useSets();
  const trend = painTrend(logs, painAreas, today);
  const recent = wins(logs, sets, nameOf, addDays(today, -27), today);
  const asc = useMemo(() => [...logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), [logs]);
  const goal = settings.goal5kSec;
  const [goalsHidden, hideGoals] = useGoalsHidden();

  /* ---------- 5K: tests against the pace of improvement the goal needs ---------- */
  const tests = asc.map((l) => ({ l, sec: fiveKEquivalent(l) })).filter((t): t is { l: LogRow; sec: number } => t.sec != null);
  const t10 = tests.filter((t) => Math.abs((t.l.km ?? 0) - 10) <= 0.5);
  const best5 = tests.length ? Math.min(...tests.map((t) => t.sec)) : null;
  const course = { start: mondayOf(settings.startDate), target: mondayOf(settings.timeTrialDate), startSec: settings.current5kSec, goalSec: goal };
  const courseWeeks = mondaysBetween(course.start, course.target > today ? course.target : today);
  const tested = courseWeeks.map((w, i) => {
    const inWeek = tests.filter((t) => mondayOf(t.l.date) === w).map((t) => t.sec);
    return inWeek.length ? Math.min(...inWeek) : i === 0 ? settings.current5kSec : null;
  });
  const needed = courseWeeks.map((w) => (w <= course.target ? paceNeeded(course, w) : null));
  const lastTest = tests.filter((t) => t.l.date >= course.start).at(-1);
  // Seconds behind (+) or ahead (−) of the line on the day of the latest test
  const gap = lastTest ? Math.round(lastTest.sec - paceNeeded(course, lastTest.l.date)) : null;
  const all5k = [goal, ...tested.filter((v): v is number => v != null)];
  const lo = Math.floor(Math.min(...all5k) / 60) - 1;
  const hi = Math.ceil(Math.max(...all5k) / 60) + 1;

  /* ---------- weekly load: running, lifting and pain on one week axis ---------- */
  const load = useMemo(() => {
    const first = [asc.find((l) => !l.auto)?.date, sets.reduce<string | null>((m, s) => (m == null || s.date < m ? s.date : m), null)].filter((d): d is string => !!d).sort()[0];
    if (!first) return null;
    const weeks = mondaysBetween(first > today ? today : first, today).slice(-WEEKS);
    const at = new Map(weeks.map((w, i) => [w, i]));
    const km = weeks.map(() => 0);
    const lifted = weeks.map(() => 0);
    const pain: (number | null)[] = weeks.map(() => null);
    for (const l of asc) {
      const i = at.get(mondayOf(l.date));
      if (i == null) continue;
      if (l.km && l.kind !== "strength" && l.kind !== "class") km[i] += l.km;
      const scores = l.auto ? [] : Object.values(l.pain ?? {});
      if (scores.length) pain[i] = Math.max(pain[i] ?? 0, ...scores);
    }
    for (const s of sets) {
      const i = at.get(mondayOf(s.date));
      if (i != null && ((s.reps ?? 0) >= 1 || (s.duration_sec ?? 0) >= 1)) lifted[i]++;
    }
    return { weeks, km: km.map((v) => +v.toFixed(1)), lifted, pain };
  }, [asc, sets, today]);

  /* ---------- new bests per week ---------- */
  const bests = useMemo(() => bestsByWeek(sets, asc), [sets, asc]);
  const bestWeeks = load?.weeks ?? [];
  const bestCounts = bestWeeks.map((w) => bests.get(w) ?? 0);

  /* ---------- easy pace: by title, or any steady run clearly slower than threshold pace ---------- */
  const threshold = trainingPaces(fitness5k(settings.current5kSec, logs, today).sec).threshold;
  const easy = asc
    .filter((l) => l.kind === "run" && (l.km ?? 0) >= 2 && l.duration_sec)
    .filter((l) => /easy|long/i.test(l.title ?? "") || (!WORKOUT.test(l.title ?? "") && l.duration_sec! / l.km! >= threshold * 1.08))
    .slice(-20);
  const easyPaces = easy.map((l) => l.duration_sec! / l.km! / 60);

  const painLogs = asc.filter((l) => !l.auto && Object.keys(l.pain ?? {}).length > 0).slice(-24);

  return (
    <section className="flex flex-col gap-3.5">
      {goalsHidden ? (
        <article className="card flex-row items-center justify-between gap-2 py-1">
          <span className="label">5K goal hidden</span>
          <GoalsToggle hidden onChange={hideGoals} />
        </article>
      ) : (
      <article className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="label">5K: on course for the goal?</div>
            <h3 className="font-display text-xl font-bold">{best5 ? `Best ${duration(best5)}` : `Start point ${duration(settings.current5kSec)}`}</h3>
          </div>
          <span className="flex items-center gap-1">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${best5 && best5 < goal ? "bg-good/15 text-good" : "bg-sunk"}`}>Goal {duration(goal - 1)}</span>
            <GoalsToggle hidden={false} onChange={hideGoals} />
          </span>
        </div>
        <LineChart
          series={[
            { color: "rgb(var(--muted))", values: needed, guide: true },
            { color: "rgb(var(--accent))", values: tested },
          ]}
          labels={courseWeeks.map(fmtShort)}
          yMin={lo}
          yMax={hi}
          goal={goal / 60}
          goalLabel={duration(goal)}
          mark={{ index: courseWeeks.indexOf(mondayOf(today)), label: "today" }}
          yFmt={(v) => `${Math.round(v)}m`}
        />
        <p className="text-sm">
          {gap == null
            ? "The dashed line is the 5K time you need week by week to reach the goal. Log a Test with 5 km to see where you are against it."
            : gap <= 0
              ? `Your last test was ${gap === 0 ? "right on" : `${duration(-gap)} ahead of`} the pace needed (dashed line).`
              : `Your last test was ${duration(gap)} behind the pace needed (dashed line).`}
        </p>
        {t10.length > 0 && (
          <p className="text-sm">
            <span className="label">10K tests </span>
            {t10.map((t) => `${fmtShort(t.l.date)}: ${duration(t.l.duration_sec!)}`).join(" · ")}
          </p>
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
          <p className="text-sm text-muted">Lower is faster. The same easy effort getting faster means your aerobic base is growing.</p>
        </article>
      )}

      <StrengthCard today={today} />

      <article className="card">
        <div className="label">Weekly load</div>
        {load && (load.km.some(Boolean) || load.lifted.some(Boolean)) ? (
          <>
            <LoadChart
              bands={[
                { label: "Running, km", color: "rgb(var(--accent))", values: load.km },
                { label: "Lifting, sets", color: "rgb(var(--area2))", values: load.lifted },
              ]}
              labels={load.weeks.map(fmtShort)}
              dots={load.pain.some((p) => p != null) ? load.pain.map((p) => (p == null ? null : p >= 3 ? "rgb(var(--bad))" : "rgb(var(--good))")) : undefined}
            />
            <p className="text-sm text-muted">
              {load.pain.some((p) => p != null) ? "Dots: the week's worst pain score, red at 3 or more. " : ""}
              More work with no red dots is the aim. The faint bars are this week so far.
            </p>
          </>
        ) : (
          <Empty>Kilometres and lifting sets per week appear here once you log.</Empty>
        )}
      </article>

      <article className="card">
        <div className="label">New bests per week</div>
        {bestCounts.some(Boolean) ? (
          <>
            <BarChart values={bestCounts} labels={bestWeeks.map(fmtShort)} yFmt={(v) => `${Math.round(v)}`} height={170} />
            <p className="text-sm text-muted">Heaviest lifts, most reps, longest runs and fastest 5Ks. Fewer as you get fitter is normal; none for a month means it&apos;s time to change something.</p>
          </>
        ) : (
          <Empty>Bests count from your second session of a lift or run, so there is something to beat.</Empty>
        )}
        {recent.length > 0 && (
          <ul className="flex flex-col gap-1">
            {recent.slice(0, 5).map((w) => (
              <li key={w.date + w.text} className="flex items-baseline gap-2 text-[0.95rem]">
                <span aria-hidden className="text-good">▲</span>
                <span className="min-w-0 flex-1">{w.text}</span>
                <span className="text-xs text-muted">{fmtShort(w.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

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
              <Legend items={painAreas.map((a, i) => ({ label: a, color: AREA_COLORS[i % 3] }))} />
            </>
          ) : (
            <Empty>Each logged session adds its pain scores here. Anything at 3 or above means hold volume.</Empty>
          )}
        </article>
      )}
    </section>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.78rem] capitalize text-muted">
      {items.map((x) => (
        <span key={x.label} className="inline-flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />
          {x.label}
        </span>
      ))}
    </div>
  );
}

/** Overall strength by week: moves only when a top set gets heavier or gains reps, never with how much was logged. */
function StrengthCard({ today }: { today: string }) {
  const { sets, exercises } = useSets();
  const { short: fmtShort } = useDates();
  const data = useMemo(() => {
    const keys = (r: Region | null) => exercises.filter((ex) => r == null || regionOf(ex.primary_muscles) === r).map((ex) => ex.key);
    const overall = strengthIndex(sets, keys(null));
    const first = [...overall.keys()].sort()[0];
    if (!first) return null;
    const weeks = mondaysBetween(first, today).slice(-WEEKS);
    const row = (m: Map<string, number>) => weeks.map((w) => m.get(w) ?? null);
    return { weeks, overall: row(overall), upper: row(strengthIndex(sets, keys("Upper"))), lower: row(strengthIndex(sets, keys("Lower"))) };
  }, [sets, exercises, today]);

  const pts = data?.overall.filter((v): v is number => v != null) ?? [];
  if (!data || pts.length < 2) {
    return (
      <article className="card">
        <div className="label">Strength</div>
        <Empty>After two weeks of lifting, one line here shows whether you are getting stronger overall.</Empty>
      </article>
    );
  }
  const pct = Math.round((pts.at(-1)! / pts[0] - 1) * 100);
  const span = data.weeks.length - data.overall.findIndex((v) => v != null) - 1;
  const drawn = [
    { label: "Upper body", color: "rgb(var(--area2))", values: data.upper },
    { label: "Lower body", color: "rgb(var(--area3))", values: data.lower },
  ].filter((s) => s.values.filter((v) => v != null).length >= 2);
  const series = drawn.length ? drawn : [{ label: "All lifts", color: "rgb(var(--accent))", values: data.overall }];
  const vals = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const lo = Math.floor((Math.min(...vals) - 2) / 5) * 5;
  const hi = Math.max(lo + 10, Math.ceil((Math.max(...vals) + 2) / 5) * 5);
  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="label">Strength</div>
          <h3 className="font-display text-xl font-bold">
            {pct > 0 ? `${pct}% stronger` : pct < 0 ? `${-pct}% down` : "Holding level"}
            <span className="text-sm font-normal text-muted"> in {span} {span === 1 ? "week" : "weeks"}</span>
          </h3>
        </div>
      </div>
      <LineChart series={series} labels={data.weeks.map(fmtShort)} yMin={lo} yMax={hi} yFmt={(v) => `${Math.round(v)}`} />
      <Legend items={series} />
      <p className="text-sm text-muted">100 is where each line started. It rises only when a top set gets heavier or gains reps; light weeks are left out.</p>
    </article>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed border-line p-4 text-center text-muted">{children}</div>;
}

const PAGE = 8;
/** Full sessions drawn in each lift's trend line */
const TREND = 8;

/** Every exercise you've logged: last full top set and its trend over 8 sessions, tap for full history. */
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
      const change = ex.load === "weight" ? compareSession(history, latest.date) : null;
      // Last 8 full sessions, oldest first, each as one weight-and-reps number
      const trend = strengthSeries(history).slice(-TREND).map((p) => ({ ...p, session: history.find((s) => s.date === p.date)! }));
      return { ex, latest, trend, change, region: regionOf(ex.primary_muscles) };
    })
    .filter((r) => r !== null)
    .sort((a, b) => (a.latest.date < b.latest.date ? 1 : a.latest.date > b.latest.date ? -1 : a.ex.name.localeCompare(b.ex.name)));
  const rows = region ? all.filter((r) => r.region === region) : all;
  const { pages, current, shown, from, to } = usePage(rows, PAGE, page);
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
            {shown.map(({ ex, latest, trend }) => {
              // The value shown is the last full session's; a light week never reads as a drop
              const full = trend.at(-1);
              const shownSess = full?.session ?? latest;
              const weighted = ex.load === "weight" && shownSess.topKg != null;
              const pct = trend.length >= 2 ? (full!.value / trend[0].value - 1) * 100 : 0;
              const color = pct > 2 ? "rgb(var(--good))" : pct < -2 ? "rgb(var(--bad))" : "rgb(var(--muted))";
              return (
                <li key={ex.key} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => openHistory(ex.key)} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left">
                    <span className="min-w-0">
                      <b className="block truncate">{ex.name}</b>
                      <span className="text-xs text-muted">
                        {dates.day(latest.date)}
                        {latest.light ? " · light week" : trend.length < 2 ? " · first session" : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-sm">
                      <Spark values={trend.map((t) => t.value)} color={color} />
                      <span className="min-w-[4.5rem] text-right">
                        {weighted ? `${fmtWeight(shownSess.topKg!, unit)} ${unit} × ${shownSess.topReps}` : `${shownSess.best ?? 0}${ex.load === "time" ? "s" : " reps"}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pager current={current} pages={pages} label={`${from}–${to} of ${rows.length}`} onPage={setPage} />
        </>
      )}
    </article>
  );
}
