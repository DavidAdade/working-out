"use client";

import { useTransition } from "react";
import { dayForDate, dayKind, dayTitle, weekForDate, PHASE_NAMES, type PlanSettings, type Week } from "@/lib/plan/generate.ts";
import { addDays, fmtDay, fmtShort, mondayOf } from "@/lib/plan/dates.ts";
import { painWarnings } from "@/lib/plan/warnings.ts";
import { setGate, setStartDate } from "@/app/actions";
import { GATES, type LogRow, type ProfileRow } from "@/lib/types";
import { Chip, DayBlocks } from "./DayView";
import WeekCard from "./WeekCard";

interface Props {
  profile: ProfileRow;
  settings: PlanSettings;
  weeks: Week[];
  logs: LogRow[];
  today: string;
  onLog: (date: string) => void;
  onSkip: (date: string, skip: boolean) => void;
}

export default function TodayPanel({ profile, settings, weeks, logs, today, onLog, onSkip }: Props) {
  const day = dayForDate(weeks, today);
  const next = weeks.flatMap((w) => w.days).find((d) => d.date > today && !d.skipped);
  const week = weekForDate(weeks, today);
  const warnings = painWarnings(logs);
  const loggedToday = logs.some((l) => l.date === today);

  return (
    <section className="flex flex-col gap-3.5">
      {warnings.map((w) => (
        <div key={w.message} className={`rounded-[10px] border px-3.5 py-3 text-[0.92rem] ${w.level === "bad" ? "border-bad bg-bad/10" : "border-warn bg-warn/10"}`}>
          {w.message}
        </div>
      ))}

      {day && !day.skipped ? (
        <article className="card">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div>
              <div className="label">
                Today · {fmtDay(today)} · {week ? PHASE_NAMES[week.phase] : ""}
              </div>
              <h2 className="font-display text-2xl font-bold">{dayTitle(day)}</h2>
            </div>
            <Chip kind={dayKind(day)} />
          </div>
          <DayBlocks day={day} onSkip={onSkip} />
          <div className="flex flex-wrap items-center gap-2">
            {loggedToday && <span className="font-bold text-good">✓ Logged</span>}
            <button className="btn" onClick={() => onLog(today)}>
              {loggedToday ? "Log another" : "Log this session"}
            </button>
          </div>
        </article>
      ) : (
        <article className="card">
          <div className="label">Today · {fmtDay(today)}</div>
          <h2 className="font-display text-2xl font-bold">{day?.skipped ? "Skipped" : "Rest day"}</h2>
          <p className="text-muted">
            Walk, stretch, sleep.{next ? ` Next up ${fmtDay(next.date)}: ${dayTitle(next)}.` : ""}
          </p>
          {day?.skipped && (
            <div>
              <button className="btn-ghost" onClick={() => onSkip(day.date, false)}>
                Restore today
              </button>
            </div>
          )}
        </article>
      )}

      {settings.returningFromInjury && today < settings.startDate && <GatesCard profile={profile} settings={settings} today={today} />}

      {week && (
        <>
          <div className="label">This week</div>
          <WeekCard week={week} logs={logs} today={today} onSkip={onSkip} open />
        </>
      )}
    </section>
  );
}

function GatesCard({ profile, settings, today }: { profile: ProfileRow; settings: PlanSettings; today: string }) {
  const [pending, startTransition] = useTransition();
  const g = profile.gates ?? {};
  const passed = GATES.filter((x) => g[x.key]).length;
  const all = passed === GATES.length;
  // The next six Mondays, plus the current start if it's further out
  const firstMonday = mondayOf(addDays(today, 7));
  const options = [...new Set([...[0, 1, 2, 3, 4, 5].map((n) => addDays(firstMonday, n * 7)), settings.startDate])].sort();

  return (
    <article className="card" aria-busy={pending}>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <div className="label">Return-to-running gates</div>
          <h3 className="font-display text-xl font-bold">
            Running starts {fmtDay(settings.startDate)}
            {all ? "" : " if all three pass"}
          </h3>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${all ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{all ? "All clear" : `${passed} of 3`}</span>
      </div>
      {GATES.map((gate) => (
        <label key={gate.key} className="flex items-start gap-2.5 border-t border-line py-2 first-of-type:border-t-0">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 flex-none accent-[rgb(var(--accent))]"
            checked={!!g[gate.key]}
            onChange={(e) => startTransition(() => void setGate(gate.key, e.target.checked))}
          />
          <span>
            <b>{gate.title}</b>
            <br />
            <span className="text-sm text-muted">{gate.detail}</span>
          </span>
        </label>
      ))}
      <div className="flex flex-col gap-1">
        <label className="label" htmlFor="startSel">
          First run week
        </label>
        <select
          id="startSel"
          className="input"
          value={settings.startDate}
          onChange={(e) => startTransition(() => void setStartDate(e.target.value))}
        >
          {options.map((d) => (
            <option key={d} value={d}>
              Mon {fmtShort(d)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-muted">
        Not passing by the weekend before? Move the start back a week. The plan re-dates itself and the time trial stays put. See a physio if stairs still hurt after about a week, or with clicking, locking, swelling or giving way.
      </p>
    </article>
  );
}
