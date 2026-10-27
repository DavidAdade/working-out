"use client";

import { useMemo, useState, useTransition } from "react";
import { catchUp, dayForDate, dayKind, dayTitle, weekForDate, PHASE_NAMES, type Day, type Move, type PlanSettings, type Week } from "@/lib/plan/generate.ts";
import { addDays, daysBetween, dowName, fmtDay, fmtShort, mondayOf } from "@/lib/plan/dates.ts";
import type { Warning } from "@/lib/plan/warnings.ts";
import type { Fitness } from "@/lib/plan/paces.ts";
import { onTrack, wins, STATUS_LABEL, type OnTrack } from "@/lib/plan/ontrack.ts";
import { setGate, setStartDate, type LogInput } from "@/app/actions";
import { useDock } from "./Dock";
import { planDayOf, useSets } from "./Sets";
import { PainSlider } from "./LogPanel";
import { GATES, type LogRow, type ProfileRow } from "@/lib/types";
import { Chip, DayBlocks } from "./DayView";
import { useDates } from "./DateLabels";
import WeekCard, { loggedDates } from "./WeekCard";
import { MoveSheet, moveNote, moveTargets, type OnMoves } from "./DayCard";

interface Props {
  profile: ProfileRow;
  settings: PlanSettings;
  weeks: Week[];
  logs: LogRow[];
  today: string;
  fitness: Fitness;
  warnings: Warning[];
  onLog: (date: string) => void;
  onSkip: (date: string, skip: boolean) => void;
  onMoves: OnMoves;
  /** The weekly AI check-in card */
  coach?: React.ReactNode;
}

export default function TodayPanel({ profile, settings, weeks, logs, today, fitness, warnings, onLog, onSkip, onMoves, coach }: Props) {
  const day = dayForDate(weeks, today);
  const next = weeks.flatMap((w) => w.days).find((d) => d.date > today && !d.skipped && d.blocks.length);
  const week = weekForDate(weeks, today);
  const loggedToday = logs.some((l) => l.date === today && l.kind !== "check");
  const dates = useDates();
  const { sets } = useSets();
  const gatesPassed = GATES.filter((g) => profile.gates?.[g.key]).length;
  const showGates = settings.returningFromInjury && (today < settings.startDate || (gatesPassed < GATES.length && (week?.phase === "return" || week?.phase === "recovery")));
  const [early, setEarly] = useState(false);
  // Doable early: within the next week, the same rule the plan uses
  const canStartNext = !!next && daysBetween(today, next.date) < 7;
  const logged = useMemo(() => loggedDates(logs, sets), [logs, sets]);
  const [moving, setMoving] = useState(false);
  const canMove = !!week && !!day && !day.fixed && !logged.has(today) && moveTargets(week, today, today, logged).some((t) => t.moves);
  // The most recent workout this week that wasn't done or skipped
  const missed = week?.days.filter((d) => d.date < today && !d.skipped && !d.fixed && d.blocks.length && !logged.has(d.date)).at(-1);
  const catchMoves = week && missed && !logged.has(today) ? catchUp(week, missed.date, today) : null;

  const track = useMemo(
    () =>
      onTrack({
        settings,
        weeks,
        logs,
        activeDates: new Set([...logs.filter((l) => l.kind !== "check").map((l) => l.date), ...sets.map(planDayOf)]),
        painAreas: profile.pain_areas,
        warnings,
        gatesPassed,
        gatesTotal: GATES.length,
        fitness,
        today,
      }),
    [settings, weeks, logs, sets, profile.pain_areas, warnings, gatesPassed, fitness, today],
  );

  return (
    <section className="flex flex-col gap-3.5">
      {warnings.map((w) => (
        <div key={w.message} className={`rounded-[10px] border px-3.5 py-3 text-[0.92rem] ${w.level === "bad" ? "border-bad bg-bad/10" : "border-warn bg-warn/10"}`}>
          {w.message}
        </div>
      ))}

      <OnTrackCard track={track} />

      {profile.pain_areas.length > 0 && !logs.some((l) => l.date === today && l.kind === "check") && <CheckInCard areas={profile.pain_areas} today={today} />}

      {week && missed && catchMoves && <CatchUpCard week={week} missed={missed.date} day={day && !day.skipped ? day : undefined} moves={catchMoves} today={today} onMoves={onMoves} onSkip={onSkip} onLog={onLog} />}

      {day && !day.skipped && day.blocks.length ? (
        <article className="card">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div>
              <div className="label">
                Today · {dates.day(today)} · {week ? PHASE_NAMES[week.phase] : ""}
              </div>
              <h2 className="font-display text-2xl font-bold">{dayTitle(day)}</h2>
            </div>
            <Chip kind={dayKind(day)} />
          </div>
          <DayBlocks day={day} onSkip={onSkip} onMove={canMove ? () => setMoving(true) : undefined} today={today} logOpen />
          {moving && week && (
            <MoveSheet
              week={week}
              day={day}
              today={today}
              logged={logged}
              onClose={() => setMoving(false)}
              onPick={(moves, to) => {
                setMoving(false);
                onMoves(week.start, moves, moveNote(week, day, to, today));
              }}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {loggedToday && <span className="font-bold text-good">✓ Logged</span>}
            <button className="btn" onClick={() => onLog(today)}>
              {loggedToday ? "Log another" : "Log this session"}
            </button>
          </div>
        </article>
      ) : (
        <article className="card">
          <div className="label">Today · {dates.day(today)}</div>
          <h2 className="font-display text-2xl font-bold">{day?.skipped ? "Skipped" : "Rest day"}</h2>
          <p className="text-muted">
            Walk, stretch, sleep.{next ? ` Next up ${dates.day(next.date)}: ${dayTitle(next)}.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {day?.skipped && (
              <button className="btn-ghost" onClick={() => onSkip(day.date, false)}>
                Restore today
              </button>
            )}
            {canStartNext && !early && (
              <button className="btn-ghost" onClick={() => setEarly(true)}>
                Start {dates.hide ? "the next session" : `${dowName(next!.date)}'s session`} now
              </button>
            )}
          </div>
          {early && next && (
            <div className="border-t border-line pt-2.5">
              <div className="label mb-1">
                {dates.day(next.date)} · {dayTitle(next)}
              </div>
              <DayBlocks day={next} today={today} logOpen />
            </div>
          )}
        </article>
      )}

      {showGates && <GatesCard profile={profile} settings={settings} today={today} />}

      <WinsCard logs={logs} today={today} />

      {coach}

      {week && (
        <>
          <div className="label">This week</div>
          <WeekCard week={week} logs={logs} today={today} onSkip={onSkip} onMoves={onMoves} open todayAbove={!!day && !day.skipped} />
        </>
      )}
    </section>
  );
}

/** A workout earlier this week that wasn't logged: do it today, log it, or let it go. */
function CatchUpCard({
  week,
  missed,
  day,
  moves,
  today,
  onMoves,
  onSkip,
  onLog,
}: {
  week: Week;
  missed: string;
  day?: Day;
  moves: Move[];
  today: string;
  onMoves: OnMoves;
  onSkip: (date: string, skip: boolean) => void;
  onLog: (date: string) => void;
}) {
  const m = week.days.find((d) => d.date === missed)!;
  // Where today's own workout ends up
  const to = day ? moves.find((x) => x.from === (day.movedFrom ?? day.date))?.to : undefined;
  return (
    <article className="card gap-2">
      <div className="label">Missed {dowName(missed)}</div>
      <p>
        <b>{dayTitle(m)}</b> isn&apos;t logged.
        {day && to ? <span className="text-muted">{to > today ? ` Doing it today moves today's ${dayTitle(day)} to ${dowName(to)}.` : ` Doing it today takes the place of today's ${dayTitle(day)}.`}</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          onClick={() => onMoves(week.start, moves, `Moved ${dayTitle(m)} from ${dowName(missed)} to today.${day && to ? ` ${dayTitle(day)} moves to ${dowName(to)}.` : ""}`)}
        >
          Do it today
        </button>
        <button className="btn-ghost" onClick={() => onLog(missed)}>
          I did it: log it
        </button>
        {m.skippable && (
          <button className="min-h-11 px-1 text-sm text-muted underline underline-offset-2" onClick={() => onSkip(missed, true)}>
            Skip it
          </button>
        )}
      </div>
    </article>
  );
}

const STATUS_CLS: Record<OnTrack["status"], string> = { good: "bg-good/15 text-good", hold: "bg-warn/15 text-warn", stop: "bg-bad/15 text-bad" };

function OnTrackCard({ track }: { track: OnTrack }) {
  return (
    <article className="card gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-xl font-bold">{track.headline}</h3>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[track.status]}`}>{STATUS_LABEL[track.status]}</span>
      </div>
      {track.lines.map((l) => (
        <p key={l} className="text-sm text-muted first-letter:uppercase">
          {l}
        </p>
      ))}
    </article>
  );
}

/** Pain scores first thing in the morning: the clearest sign of how yesterday went. */
function CheckInCard({ areas, today }: { areas: string[]; today: string }) {
  const { send } = useDock();
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") return null;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pain: Record<string, number> = {};
    for (const a of areas) pain[a] = Number(f.get(`pain_${a}`)) || 0;
    const input: LogInput = { id: crypto.randomUUID(), date: today, kind: "check", title: "Morning check-in", km: "", time: "", rpe: "", pain, notes: String(f.get("notes") ?? "") };
    setState("saving");
    const r = await send({ id: input.id, t: "log", input });
    if (r === "sent" || r === "queued") setState("done");
    else {
      setState("idle");
      setError(r.error);
    }
  };
  return (
    <details className="card group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>
          <b>Morning check-in</b>
          <span className="block text-sm text-muted">How do {areas.join(", ")} feel today? 20 seconds.</span>
        </span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <form onSubmit={submit} className="flex flex-col gap-2">
        {areas.map((a) => (
          <PainSlider key={a} area={a} />
        ))}
        <input name="notes" placeholder="Anything else? (optional)" aria-label="Notes" className="input" />
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn self-start" disabled={state === "saving"}>
          {state === "saving" ? "Saving…" : "Save check-in"}
        </button>
      </form>
    </details>
  );
}

/** New bests this week; on Monday, last week's as a short recap. */
function WinsCard({ logs, today }: { logs: LogRow[]; today: string }) {
  const { sets, nameOf } = useSets();
  const monday = mondayOf(today);
  const recap = today === monday;
  const from = recap ? addDays(monday, -7) : monday;
  const to = recap ? addDays(monday, -1) : today;
  const list = useMemo(() => wins(logs, sets, nameOf, from, to), [logs, sets, nameOf, from, to]);
  if (!list.length) return null;
  return (
    <article className="card gap-1.5">
      <div className="label">{recap ? "Last week's wins" : "This week's wins"}</div>
      <ul className="flex flex-col gap-1">
        {list.slice(0, 6).map((w) => (
          <li key={w.date + w.text} className="flex items-baseline gap-2 text-[0.95rem]">
            <span aria-hidden className="text-good">▲</span>
            {w.text}
          </li>
        ))}
      </ul>
    </article>
  );
}

function GatesCard({ profile, settings, today }: { profile: ProfileRow; settings: PlanSettings; today: string }) {
  const [pending, startTransition] = useTransition();
  const { notify } = useDock();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const g = { ...(profile.gates ?? {}), ...local };
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, undo?: () => void) =>
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          undo?.();
          notify({ text: r.error ?? "Couldn't save. Try again.", tone: "error" });
        }
      } catch {
        undo?.();
        notify({ text: "No connection. That didn't save.", tone: "error" });
      }
    });
  const passed = GATES.filter((x) => g[x.key]).length;
  const all = passed === GATES.length;
  const dates = useDates();
  // The next six Mondays, plus the current start if it's further out
  const firstMonday = mondayOf(addDays(today, 7));
  const options = [...new Set([...[0, 1, 2, 3, 4, 5].map((n) => addDays(firstMonday, n * 7)), settings.startDate])].sort();

  return (
    <article className="card" aria-busy={pending}>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <div className="label">Return-to-running gates</div>
          <h3 className="font-display text-xl font-bold">
            Running starts {dates.hide ? "week 1" : fmtDay(settings.startDate)}
            {all ? "" : " if all three pass"}
          </h3>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${all ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{all ? "All clear" : `${passed} of 3`}</span>
      </div>
      {GATES.map((gate) => (
        <label key={gate.key} className="flex min-h-11 items-start gap-2.5 border-t border-line py-2 first-of-type:border-t-0">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 flex-none accent-[rgb(var(--accent))]"
            checked={!!g[gate.key]}
            onChange={(e) => {
              const v = e.target.checked;
              setLocal((l) => ({ ...l, [gate.key]: v }));
              run(() => setGate(gate.key, v), () => setLocal((l) => ({ ...l, [gate.key]: !v })));
            }}
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
          onChange={(e) => {
            const d = e.target.value;
            run(() => setStartDate(d));
          }}
        >
          {options.map((d) => (
            <option key={d} value={d}>
              {d === settings.startDate ? "Current start" : `In ${daysBetween(mondayOf(today), d) / 7} week${daysBetween(mondayOf(today), d) === 7 ? "" : "s"}`}{dates.hide ? "" : ` · Mon ${fmtShort(d)}`}
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
