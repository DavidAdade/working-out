"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { dayForDate, dayKind, dayTitle, type Week } from "@/lib/plan/generate.ts";
import { duration, pace } from "@/lib/plan/format.ts";
import { addLog, deleteLog, type ActionResult } from "@/app/actions";
import type { LogKind, LogRow } from "@/lib/types";
import { Chip } from "./DayView";
import { useDates } from "./DateLabels";
import { fmtSet, useSets } from "./Sets";
import { exerciseByKey } from "@/lib/plan/exercises.ts";

interface Props {
  weeks: Week[];
  logs: LogRow[];
  today: string;
  painAreas: string[];
  initialDate: string;
}

export default function LogPanel({ weeks, logs, today, painAreas, initialDate }: Props) {
  const [date, setDate] = useState(initialDate);
  const dates = useDates();
  // With dates hidden, pick a plan day ("W3 Wed · Easy 30 min") instead of a calendar date
  const pastDays = dates.hide ? weeks.flatMap((w) => w.days).filter((d) => d.date <= today && !d.skipped).reverse() : [];
  const planned = dayForDate(weeks, date);
  const plannedKind = planned ? dayKind(planned) : "run";
  const defaultKind: LogKind = plannedKind === "test" ? "test" : plannedKind === "legs" || plannedKind === "upper" ? "strength" : plannedKind === "walk" || plannedKind === "gate" ? "walk" : "run";

  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addLog, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setFormKey((k) => k + 1);
  }, [state]);

  return (
    <section className="flex flex-col gap-3.5">
      <article className="card">
        <h3 className="font-display text-xl font-bold">Log a session</h3>
        <form key={`${date}-${formKey}`} ref={formRef} action={action} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Field label="Date" id="date">
            {dates.hide && pastDays.length ? (
              <select id="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input">
                {!pastDays.some((d) => d.date === date) && <option value={date}>{date === today ? "Today" : dates.day(date)}</option>}
                {pastDays.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.date === today ? "Today" : dates.day(d.date)} · {dayTitle(d)}
                  </option>
                ))}
              </select>
            ) : (
              <input id="date" name="date" type="date" required value={date} max={today} onChange={(e) => setDate(e.target.value)} className="input" />
            )}
          </Field>
          <Field label="Type" id="kind">
            <select id="kind" name="kind" defaultValue={defaultKind} className="input">
              <option value="run">Run</option>
              <option value="test">Test / time trial</option>
              <option value="strength">Strength</option>
              <option value="walk">Walk</option>
            </select>
          </Field>
          <Field label="Workout" id="title" wide>
            <input id="title" name="title" defaultValue={planned && !planned.skipped ? dayTitle(planned) : ""} placeholder="Easy 30 min" className="input" />
          </Field>
          <Field label="Distance (km)" id="km">
            <input id="km" name="km" inputMode="decimal" placeholder="5.0" className="input" />
          </Field>
          <Field label="Time (34:10 or 34.10)" id="time">
            <input id="time" name="time" inputMode="decimal" autoComplete="off" placeholder="34:10" className="input" />
          </Field>
          {painAreas.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="label">Pain during or after (0 = none)</span>
              {painAreas.map((a) => (
                <PainSlider key={a} area={a} />
              ))}
            </div>
          )}
          <Field label="Effort (1–10)" id="rpe">
            <input id="rpe" name="rpe" type="number" inputMode="numeric" min={1} max={10} placeholder="4" className="input" />
          </Field>
          <Field label="Notes" id="notes">
            <input id="notes" name="notes" placeholder="Felt smooth, cold out" className="input" />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="btn" disabled={pending}>
              {pending ? "Saving…" : "Save session"}
            </button>
            {state?.ok && <span className="text-sm font-semibold text-good">Session saved</span>}
            {state && !state.ok && <span className="text-sm text-bad">{state.error}</span>}
          </div>
        </form>
      </article>

      <article className="card">
        <h3 className="font-display text-xl font-bold">History</h3>
        {logs.length ? (
          <div>
            {logs.map((l) => (
              <Entry key={l.id} log={l} />
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-line p-4 text-center text-muted">No sessions yet. Your first one will show here with pace and pain scores.</div>
        )}
      </article>
    </section>
  );
}

function Field({ label, id, wide, children }: { label: string; id: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PainSlider({ area }: { area: string }) {
  const [v, setV] = useState(0);
  return (
    <div className="grid grid-cols-[5.5em_1fr_2em] items-center gap-2">
      <label htmlFor={`pain_${area}`} className="capitalize">
        {area}
      </label>
      <input id={`pain_${area}`} name={`pain_${area}`} type="range" min={0} max={10} value={v} onChange={(e) => setV(Number(e.target.value))} className="h-9 w-full accent-[rgb(var(--accent))]" />
      <output className={`font-mono ${v >= 4 ? "text-bad" : v === 3 ? "text-warn" : ""}`}>{v}</output>
    </div>
  );
}

function Entry({ log }: { log: LogRow }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const p = log.duration_sec && log.km ? `${pace(log.duration_sec / log.km)}/km` : null;
  const kind = log.kind === "strength" ? "legs" : log.kind;
  const dates = useDates();

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 border-t border-line py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 font-semibold">
          {log.title || log.kind} <Chip kind={kind} />
        </div>
        <div className="text-sm text-muted">
          {[dates.day(log.date), log.km != null ? `${log.km} km` : null, log.duration_sec ? duration(log.duration_sec) : null, p, log.rpe ? `effort ${log.rpe}` : null].filter(Boolean).join(" · ")}
        </div>
        {Object.keys(log.pain ?? {}).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {Object.entries(log.pain).map(([k, v]) => (
              <span key={k} className={`rounded px-1.5 py-px font-mono ${v >= 4 ? "bg-bad/20 text-bad" : "bg-sunk"}`}>
                {k} {v}
              </span>
            ))}
          </div>
        )}
        {log.auto && <DaySets date={log.date} />}
        {log.notes && <div className="text-sm text-muted">{log.notes}</div>}
      </div>
      <button
        className="btn-ghost self-start"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            setTimeout(() => setArmed(false), 3000);
            return;
          }
          startTransition(() => void deleteLog(log.id));
        }}
      >
        {armed ? (log.auto ? "Tap again: deletes all sets" : "Tap again to delete") : "Delete"}
      </button>
    </div>
  );
}

function DaySets({ date }: { date: string }) {
  const { sets, unit, openHistory } = useSets();
  const byEx = new Map<string, typeof sets>();
  for (const s of sets.filter((x) => x.date === date).sort((a, b) => a.set_no - b.set_no)) byEx.set(s.exercise_key, [...(byEx.get(s.exercise_key) ?? []), s]);
  if (!byEx.size) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-sm">
      {[...byEx.entries()].map(([key, rows]) => (
        <li key={key}>
          <button type="button" className="text-left underline decoration-dotted underline-offset-[3px]" onClick={() => openHistory(key, date)}>
            {exerciseByKey(key)?.name ?? key}
          </button>{" "}
          <span className="font-mono text-muted">{rows.map((r) => fmtSet(r, unit)).join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}
