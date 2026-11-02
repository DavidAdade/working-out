"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Block, BlockKind } from "@/lib/plan/templates.ts";
import { dayTitle, type Day } from "@/lib/plan/generate.ts";
import { daysBetween, dowName } from "@/lib/plan/dates.ts";
import { parseLine } from "@/lib/plan/exercises.ts";
import { completion, dayExercises, isLocked, LIFT_KINDS, sessionDate } from "@/lib/plan/workout.ts";
import type { SetRow } from "@/lib/types";
import { ExerciseRow, fmtSet, planDayOf, useSets } from "./Sets";
import { SwapSheet, useSwap } from "./SwapSheet";
import { useWorkout, WorkoutBar } from "./Workout";

const CHIP: Record<BlockKind, { label: string; cls: string }> = {
  run: { label: "Run", cls: "bg-accent text-on-accent" },
  test: { label: "Test", cls: "bg-ink text-bg" },
  legs: { label: "Legs", cls: "bg-sunk text-ink" },
  upper: { label: "Upper", cls: "bg-sunk text-ink" },
  abs: { label: "Abs", cls: "bg-sunk text-ink" },
  walk: { label: "Walk", cls: "bg-sunk text-ink" },
  gate: { label: "Gates", cls: "bg-warn/15 text-warn" },
  mobility: { label: "Mobility", cls: "bg-sunk text-ink" },
};

export function Chip({ kind, label }: { kind: BlockKind; label?: string }) {
  const c = CHIP[kind];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>{label ?? c.label}</span>;
}

/** Runs, walks and gate checks: a title and one line of instructions. */
function SimpleBlock({ block }: { block: Block }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-1.5 font-semibold">
        {block.title} <Chip kind={block.kind} />
      </div>
      <p className="text-[0.92rem] text-muted">{block.items.join(" · ")}</p>
      {block.note && <p className="text-xs text-muted">{block.note}</p>}
    </div>
  );
}

/** All blocks for one day. Lifts are compact rows; one opens at a time and the next opens when you finish. */
export function DayBlocks({
  day,
  onSkip,
  onMove,
  today,
  logOpen = false,
}: {
  day: Day;
  onSkip?: (date: string, skip: boolean) => void;
  /** Opens the move sheet; left out when the day can't move */
  onMove?: () => void;
  today: string;
  logOpen?: boolean;
}) {
  const { sets, info, nameOf, unit, openHistory } = useSets();
  const swapApi = useSwap();
  const [swapping, setSwapping] = useState<{ bi: number; ii: number } | null>(null);
  // Past days and today log on their own date; the next week's workouts can be done early and log under today
  const early = day.date > today && daysBetween(today, day.date) < 7;
  const logDate = day.date <= today ? day.date : early ? today : null;
  const title = day.blocks.filter((b) => LIFT_KINDS.includes(b.kind)).map((b) => b.title).join(" + ") || dayTitle(day);

  // Every loggable exercise in order (a swapped line counts the exercise swapped in), so "next" can cross from one block into the next
  const order = useMemo(() => dayExercises(day), [day]);

  // The workout session: Start / End, auto-started by the first set done today (or early), read-only 12 h after it ends
  const workout = useWorkout();
  const sDate = sessionDate(day);
  const session = workout.get(sDate);
  const locked = isLocked(session, Date.now());
  const live = logDate === today && order.length > 0;
  const done = useMemo(() => completion(day, sets), [day, sets]);
  // Ticking the day's final planned set celebrates (not on opening a finished day)
  const lastStatus = useRef(done.status);
  useEffect(() => {
    const before = lastStatus.current;
    lastStatus.current = done.status;
    if (live && before === "incomplete" && (done.status === "complete" || done.status === "beyond")) workout.celebrate(sDate, done);
  }, [done, live, sDate, workout]);
  const unfinished = useCallback(
    (x: { key: string; sets: number }) => !logDate || sets.filter((s) => planDayOf(s) === day.date && s.exercise_key === x.key).length < x.sets,
    [sets, logDate, day.date],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  // On the Today tab, start on the first exercise you haven't finished
  useEffect(() => {
    if (logOpen && logDate) setOpenId((cur) => cur ?? order.find(unfinished)?.id ?? null);
    // Only on first render: re-running would reopen rows you closed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sets on this plan day under an exercise the day doesn't show (swapped out and back, a deleted custom
  // exercise, logged from the Library): never lost, listed at the end. A swapped row shows its own original's.
  const stray = useMemo(() => {
    const shown = new Set(order.map((x) => x.key));
    for (const b of day.blocks) for (const s of Object.values(b.swaps ?? {})) shown.add(s.from);
    const byKey = new Map<string, SetRow[]>();
    for (const s of sets) if (planDayOf(s) === day.date && !shown.has(s.exercise_key)) byKey.set(s.exercise_key, [...(byKey.get(s.exercise_key) ?? []), s]);
    return [...byKey].map(([key, rows]) => ({ key, rows: rows.sort((a, b) => a.set_no - b.set_no) }));
  }, [order, day.blocks, day.date, sets]);

  const where = day.date === today ? "today" : `on ${dowName(day.date)}`;
  const closeSwap = (focusId?: string) => {
    setSwapping(null);
    if (focusId) requestAnimationFrame(() => document.getElementById(`swap-ex-${day.date}-${focusId}`)?.focus({ preventScroll: true }));
  };
  const sheet = (() => {
    if (!swapping || !swapApi) return null;
    const b = day.blocks[swapping.bi];
    const p = b && parseLine(b.items[swapping.ii]);
    const original = p && info(p.exercise.key);
    if (!b || !p || !original) return null;
    const sw = b.swaps?.[swapping.ii];
    const current = (sw && info(sw.to)) || (sw ? { key: sw.to, name: sw.name } : original);
    const id = `${swapping.bi}-${swapping.ii}`;
    const planDate = b.planDate ?? day.date;
    return (
      <SwapSheet
        original={original}
        current={current}
        target={p.target}
        light={!!b.light || !!b.foldedFrom}
        inDay={new Set(order.filter((x) => x.id !== id).map((x) => x.key))}
        logged={sets.filter((s) => planDayOf(s) === day.date && s.exercise_key === current.key)}
        onClose={() => closeSwap(id)}
        onPick={(to) => {
          closeSwap(id);
          swapApi.swap(planDate, original.key, to.key === original.key ? null : to.key, to.key === original.key ? `${original.name} is back.` : `Swapped ${current.name} for ${to.name} ${where}.`);
        }}
      />
    );
  })();

  const advanceFrom = (id: string) => {
    const i = order.findIndex((x) => x.id === id);
    const next = order.slice(i + 1).find(unfinished) ?? order.slice(0, i).find(unfinished);
    setOpenId(next?.id ?? null);
    if (next) requestAnimationFrame(() => document.getElementById(`ex-${day.date}-${next.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  if (day.skipped)
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Skipped this week.{day.blocks.some((b) => b.carry) ? " Upper-body work moved to another day." : ""}</p>
        {onSkip && day.skippable && (
          <button className="btn-ghost" onClick={() => onSkip(day.date, false)}>
            Restore
          </button>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {day.alerts.map((a) => (
        <div key={a} className="rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm">
          {a}
        </div>
      ))}
      {order.length > 0 && logDate && (live || session) && <WorkoutBar planDate={sDate} canStart={live} completion={done} />}
      {early && order.length > 0 && <p className="text-xs text-muted">Doing this early? Sets save under today and tick off this day.</p>}
      {day.blocks.map((b, bi) =>
        LIFT_KINDS.includes(b.kind) ? (
          <div key={b.title + bi} className="flex flex-col">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold">
              {b.title} <Chip kind={b.kind} />
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {b.items.map((line, ii) => {
                const id = `${bi}-${ii}`;
                const sw = b.swaps?.[ii];
                const from = sw ? info(sw.from) : undefined;
                const canSwap = !!swapApi && !!parseLine(line) && !locked;
                return (
                  <ExerciseRow
                      key={id}
                      anchorId={`ex-${day.date}-${id}`}
                      line={line}
                      logDate={logDate}
                      planDate={day.date}
                      light={!!b.light || !!b.foldedFrom}
                      dayTitle={title}
                      open={openId === id}
                      onToggle={() => setOpenId((cur) => (cur === id ? null : id))}
                      locked={locked}
                      session={live ? sDate : null}
                      onComplete={() => advanceFrom(id)}
                      swap={sw}
                      onSwap={canSwap ? () => setSwapping({ bi, ii }) : undefined}
                      onPutBack={
                        sw && swapApi && !locked
                          ? () => swapApi.swap(b.planDate ?? day.date, sw.from, null, `${from?.name ?? nameOf(sw.from)} is back.`)
                          : undefined
                      }
                    />
                );
              })}
            </ul>
            {b.note && <p className="text-xs text-muted">{b.note}</p>}
          </div>
        ) : (
          <SimpleBlock key={b.title + bi} block={b} />
        ),
      )}
      {stray.length > 0 && (
        <div className="flex flex-col">
          <div className="label">Also logged</div>
          <ul className="flex flex-col divide-y divide-line">
            {stray.map(({ key, rows }) => (
              <li key={key}>
                <button type="button" onClick={() => openHistory(key, rows[0].date)} className="flex min-h-11 w-full items-center gap-2 text-left text-sm">
                  <span className="min-w-0 flex-1 break-words">
                    {nameOf(key)} · {rows.length} set{rows.length === 1 ? "" : "s"}
                  </span>
                  <span className="whitespace-nowrap font-mono text-xs text-muted">{rows.map((x) => fmtSet(x, unit)).join(", ")}</span>
                  <span aria-hidden className="text-muted">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sheet}
      {(onMove || (onSkip && day.skippable)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {onMove && (
            <button className="btn-ghost" onClick={onMove}>
              Move to another day
            </button>
          )}
          {onSkip && day.skippable && (
            <button className="min-h-11 text-sm text-muted underline underline-offset-2" onClick={() => onSkip(day.date, true)}>
              Skip this day (4-day week)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
