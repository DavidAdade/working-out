"use client";

import { useState, useTransition } from "react";
import { dayForDate, dayKind, dayTitle, type Week } from "@/lib/plan/generate.ts";
import { duration, pace, parseDuration } from "@/lib/plan/format.ts";
import { deleteLog, updateLog, type LogInput } from "@/app/actions";
import { useDock } from "./Dock";
import Pager, { usePage } from "./Pager";
import type { LogKind, LogRow } from "@/lib/types";
import { Chip } from "./DayView";
import { useDates } from "./DateLabels";
import { fmtSet, useSets } from "./Sets";

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
  const { send } = useDock();
  // With dates hidden, pick a plan day ("W3 Wed · Easy 30 min") instead of a calendar date
  const pastDays = dates.hide ? weeks.flatMap((w) => w.days).filter((d) => d.date <= today && !d.skipped).reverse() : [];
  const planned = dayForDate(weeks, date);
  const plannedKind = planned ? dayKind(planned) : "run";
  const defaultKind: LogKind = plannedKind === "test" ? "test" : plannedKind === "legs" || plannedKind === "upper" ? "strength" : plannedKind === "walk" || plannedKind === "gate" ? "walk" : "run";

  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [page, setPage] = useState(0);
  const history = usePage(logs, 10, page);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const pain: Record<string, number> = {};
    for (const [k, v] of f.entries()) if (k.startsWith("pain_")) pain[k.slice(5)] = Number(v) || 0;
    // Check the easy mistakes here, so they show even with no signal
    if (get("time").trim() && parseDuration(get("time")) == null) return setState({ ok: false, text: "Time should look like 34:10 or 1:02:30." });
    if (get("km").trim() && !Number.isFinite(Number(get("km").replace(",", ".")))) return setState({ ok: false, text: "Distance should be a number, like 5 or 7.5." });
    const input: LogInput = { id: crypto.randomUUID(), date: get("date"), kind: get("kind") as LogKind, title: get("title"), km: get("km"), time: get("time"), rpe: get("rpe"), pain, notes: get("notes") };
    setPending(true);
    const r = await send({ id: input.id, t: "log", input });
    setPending(false);
    if (r === "sent") setState({ ok: true, text: "Session saved" });
    else if (r === "queued") setState({ ok: true, text: "No signal. Saved on this phone; it syncs when you're back online." });
    else return setState({ ok: false, text: r.error });
    setFormKey((k) => k + 1);
  };

  return (
    <section className="flex flex-col gap-3.5">
      <article className="card">
        <h3 className="font-display text-xl font-bold">Log a session</h3>
        <form key={`${date}-${formKey}`} onSubmit={submit} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
            {state && <span className={`text-sm ${state.ok ? "font-semibold text-good" : "text-bad"}`}>{state.text}</span>}
          </div>
        </form>
      </article>

      <article className="card">
        <h3 className="font-display text-xl font-bold">History</h3>
        {logs.length ? (
          <>
            <div id="log-history" className="scroll-mt-16">
              {history.shown.map((l) => (
                <Entry key={l.id} log={l} painAreas={painAreas} />
              ))}
            </div>
            <Pager current={history.current} pages={history.pages} label={`${history.from}–${history.to} of ${logs.length}`} onPage={setPage} listId="log-history" />
          </>
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

export function PainSlider({ area, initial = 0 }: { area: string; initial?: number }) {
  const [v, setV] = useState(initial);
  return (
    <div className="grid grid-cols-[5.5em_1fr_2em] items-center gap-2">
      <label htmlFor={`pain_${area}`} className="capitalize">
        {area}
      </label>
      <input id={`pain_${area}`} name={`pain_${area}`} type="range" min={0} max={10} value={v} onChange={(e) => setV(Number(e.target.value))} className="h-11 w-full accent-[rgb(var(--accent))]" />
      <output className={`font-mono ${v >= 4 ? "text-bad" : v === 3 ? "text-warn" : ""}`}>{v}</output>
    </div>
  );
}

function Entry({ log, painAreas }: { log: LogRow; painAreas: string[] }) {
  const [armed, setArmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useDock();
  const p = log.duration_sec && log.km ? `${pace(log.duration_sec / log.km)}/km` : null;
  const kind = log.kind === "strength" ? "legs" : log.kind === "check" ? "gate" : log.kind;
  const dates = useDates();
  // Imported runs arrive without the things only you know
  const needsDetail = log.source === "health" && log.rpe == null && !Object.keys(log.pain ?? {}).length;

  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 border-t border-line py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 font-semibold">
          {log.title || (log.kind === "check" ? "Morning check-in" : log.kind)} <Chip kind={kind} label={log.kind === "check" ? "Check-in" : log.source === "health" ? "Health" : undefined} />
          {log.queued && <span className="rounded bg-warn/15 px-1.5 py-px text-xs font-semibold text-warn">Waiting to sync</span>}
        </div>
        <div className="text-sm text-muted">
          {[dates.day(log.date), log.km != null ? `${log.km} km` : null, log.duration_sec ? duration(log.duration_sec) : null, p, log.avg_hr ? `${log.avg_hr} bpm` : null, log.rpe ? `effort ${log.rpe}` : null].filter(Boolean).join(" · ")}
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
        {needsDetail && !editing && (
          <button type="button" className="btn-ghost mt-1.5" onClick={() => setEditing(true)}>
            Add effort &amp; pain
          </button>
        )}
        {editing && <EditDetails log={log} painAreas={painAreas} onDone={() => setEditing(false)} />}
      </div>
      {!log.queued && (
        <button
          className="btn-ghost self-start"
          disabled={pending}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              setTimeout(() => setArmed(false), 3000);
              return;
            }
            startTransition(async () => {
              try {
                const r = await deleteLog(log.id);
                if (!r.ok) notify({ text: r.error, tone: "error" });
              } catch {
                notify({ text: "No connection. Nothing was deleted.", tone: "error" });
              }
            });
          }}
        >
          {armed ? (log.auto ? "Tap again: deletes all sets" : "Tap again to delete") : "Delete"}
        </button>
      )}
    </div>
  );
}

/** Effort, pain and notes for a session that came in without them, e.g. from Apple Health. Also marks a test. */
function EditDetails({ log, painAreas, onDone }: { log: LogRow; painAreas: string[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pain: Record<string, number> = {};
    for (const a of painAreas) pain[a] = Number(f.get(`pain_${a}`)) || 0;
    startTransition(async () => {
      try {
        const r = await updateLog(log.id, { kind: f.get("is_test") === "on" ? "test" : log.kind, rpe: String(f.get("rpe") ?? ""), pain, notes: String(f.get("notes") ?? "") });
        if (r.ok) onDone();
        else setError(r.error);
      } catch {
        setError("No connection. Try again when you have signal.");
      }
    });
  };
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2 rounded-lg border border-line p-3">
      {painAreas.map((a) => (
        <PainSlider key={a} area={a} />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <input name="rpe" type="number" inputMode="numeric" min={1} max={10} placeholder="Effort 1–10" aria-label="Effort 1 to 10" className="input" />
        <input name="notes" placeholder="Notes" aria-label="Notes" defaultValue={log.notes ?? ""} className="input" />
      </div>
      {log.kind === "run" && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="is_test" className="h-5 w-5 accent-[rgb(var(--accent))]" /> This was a test or time trial
        </label>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DaySets({ date }: { date: string }) {
  const { sets, unit, openHistory, nameOf } = useSets();
  const byEx = new Map<string, typeof sets>();
  for (const s of sets.filter((x) => x.date === date).sort((a, b) => a.set_no - b.set_no)) byEx.set(s.exercise_key, [...(byEx.get(s.exercise_key) ?? []), s]);
  if (!byEx.size) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-sm">
      {[...byEx.entries()].map(([key, rows]) => (
        <li key={key}>
          <button type="button" className="min-h-11 py-2 text-left underline decoration-dotted underline-offset-[3px]" onClick={() => openHistory(key, date)}>
            {nameOf(key)}
          </button>{" "}
          <span className="font-mono text-muted">{rows.map((r) => fmtSet(r, unit)).join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}
