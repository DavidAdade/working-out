"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Block, BlockKind } from "@/lib/plan/templates.ts";
import { dayTitle, type Day } from "@/lib/plan/generate.ts";
import { daysBetween, dowName } from "@/lib/plan/dates.ts";
import { parseLine } from "@/lib/plan/exercises.ts";
import { completion, dayExercises, isLocked, LIFT_KINDS, nextInRound, sessionDate, type DayExercise } from "@/lib/plan/workout.ts";
import { groupOf, loggable } from "@/lib/plan/supersets.ts";
import { asExercise } from "@/lib/plan/catalog.ts";
import { itemKey, itemLine } from "@/lib/plan/swaps.ts";
import type { SetRow } from "@/lib/types";
import { ExerciseRow, fmtSet, planDayOf, restFor, useSets, type SupersetFlow } from "./Sets";
import { SwapSheet, useSwap } from "./SwapSheet";
import { useSuperset } from "./Superset";
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

/**
 * Bring the next exercise into view once the finished one has closed: its top just under the sticky tab bar
 * (which, with the iPhone's safe area, is taller than a scroll margin), and no scroll at all if it's already in
 * the top half of the screen.
 */
function scrollToRow(id: string) {
  // Two frames: the closed row's height is gone from the layout by then
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const nav = document.querySelector<HTMLElement>('nav[role="tablist"]');
      const top = (nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0) + 8;
      const y = el.getBoundingClientRect().top;
      if (y >= top && y <= window.innerHeight * 0.5) return;
      window.scrollTo({ top: Math.max(0, window.scrollY + y - top), behavior: "smooth" });
    }),
  );
}

/** A block's rows with each superset's rows inside one bar, labelled "Superset A" */
function withGroups(b: Block, rows: React.ReactNode[], letterAt: (ii: number) => string | undefined): React.ReactNode[] {
  if (!b.supersets?.length) return rows;
  const out: React.ReactNode[] = [];
  rows.forEach((row, ii) => {
    const g = groupOf(b, ii);
    if (!g) out.push(row);
    else if (g[0] === ii)
      out.push(
        <li key={`superset-${ii}`} className="py-1">
          <div className="flex flex-col border-l-[3px] border-accent pl-2">
            <p className="pt-1 text-xs text-muted">
              <span className="font-semibold text-accent-ink">Superset {letterAt(ii)}</span> · alternate, rest after the round
            </p>
            <ul className="flex flex-col divide-y divide-line">{g.map((i) => rows[i])}</ul>
          </div>
        </li>,
      );
  });
  return out;
}

/** All blocks for one day. Lifts are compact rows; one opens at a time and the next opens when you finish. */
export function DayBlocks({
  day,
  onSkip,
  onMove,
  onCopy,
  today,
  logOpen = false,
}: {
  day: Day;
  onSkip?: (date: string, skip: boolean) => void;
  /** Opens the move sheet; left out when the day can't move */
  onMove?: () => void;
  /** Opens the "Swap for another day" sheet; left out when the day can't take another workout */
  onCopy?: () => void;
  today: string;
  logOpen?: boolean;
}) {
  const { sets, info, nameOf, unit, openHistory } = useSets();
  const swapApi = useSwap();
  const supersetApi = useSuperset();
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
  // Landing on a superset: the unfinished exercise in it with the fewest sets, so rounds stay in step
  const doneOf = (key: string) => sets.filter((s) => planDayOf(s) === day.date && s.exercise_key === key).length;
  const enter = (x: DayExercise | undefined) => {
    if (!x?.group || !logDate) return x;
    const behind = order.filter((m) => m.group?.letter === x.group!.letter && unfinished(m));
    return behind.reduce((best, m) => (doneOf(m.key) < doneOf(best.key) ? m : best), behind[0] ?? x);
  };
  // On the Today tab, start on the first exercise you haven't finished
  useEffect(() => {
    if (logOpen && logDate) setOpenId((cur) => cur ?? enter(order.find(unfinished))?.id ?? null);
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
    const next = enter(order.slice(i + 1).find(unfinished) ?? order.slice(0, i).find(unfinished));
    setOpenId(next?.id ?? null);
    if (next) scrollToRow(`ex-${day.date}-${next.id}`);
  };

  // Supersets: linking, unlinking, and logging round by round (no rest mid-round, the group's longest rest after it)
  const nameAt = (b: Block, i: number) => b.swaps?.[i]?.name ?? parseLine(b.items[i])?.name ?? b.items[i];
  const keyAt = (b: Block, i: number) => parseLine(b.items[i])!.exercise.key;
  const relink = (b: Block, i: number, on: boolean) =>
    supersetApi?.link(b.planDate ?? day.date, keyAt(b, i), on, on ? `Superset: ${nameAt(b, i)} + ${nameAt(b, i + 1)}.` : `${nameAt(b, i)} and ${nameAt(b, i + 1)} are separate again.`);
  const flowFor = (id: string): SupersetFlow | undefined => {
    const me = order.find((x) => x.id === id);
    if (!me?.group || !logDate) return undefined;
    const members = order.filter((x) => x.group?.letter === me.group!.letter);
    const restOf = (key: string) => {
      const e = info(key);
      return e ? restFor(asExercise(e)) : 90;
    };
    return {
      letter: me.group.letter,
      restSec: Math.max(...members.map((x) => restOf(x.key))),
      after: (setNo) => nextInRound(order, id, setNo, doneOf),
      onNext: (next) => {
        // The same row (the longer half of an uneven pair) stays open where it is
        if (next === openId) return;
        setOpenId(next);
        scrollToRow(`ex-${day.date}-${next}`);
      },
      onGroupDone: () => advanceFrom(members[members.length - 1].id),
    };
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
              {withGroups(b, b.items.map((line, ii) => {
                const id = `${bi}-${ii}`;
                const sw = b.swaps?.[ii];
                const from = sw ? info(sw.from) : undefined;
                const canSwap = !!swapApi && !!parseLine(line) && !locked;
                const group = groupOf(b, ii);
                const pos = order.find((x) => x.id === id)?.group;
                const canLink = !!supersetApi && !locked && loggable(b, ii) && loggable(b, ii + 1) && !group?.includes(ii + 1);
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
                      badge={pos ? `${pos.letter}${pos.pos}` : undefined}
                      superset={flowFor(id)}
                      onLink={canLink ? () => relink(b, ii, true) : undefined}
                      // The last exercise leaves by the link above it; the others by their own
                      onUnlink={group && supersetApi && !locked ? () => relink(b, ii === group[group.length - 1] ? ii - 1 : ii, false) : undefined}
                    />
                );
              }), (ii) => order.find((x) => x.id === `${bi}-${ii}`)?.group?.letter)}
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
      {(onMove || onCopy || (onSkip && day.skippable)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {onMove && (
            <button className="btn-ghost" onClick={onMove}>
              Move to another day
            </button>
          )}
          {onCopy && (
            <button className="btn-ghost" onClick={onCopy}>
              Swap for another day
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

/** A day's workout read-only, for the "Swap for another day" preview. Lift lines open their exercise sheet. */
export function PreviewBlocks({ blocks }: { blocks: Block[] }) {
  const { openHistory } = useSets();
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, bi) =>
        LIFT_KINDS.includes(b.kind) ? (
          <div key={b.title + bi} className="flex flex-col">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold">
              {b.title} <Chip kind={b.kind} />
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {b.items.map((_, ii) => {
                const key = itemKey(b, ii);
                return (
                  <li key={ii}>
                    {key ? (
                      <button type="button" onClick={() => openHistory(key)} className="flex min-h-11 w-full items-center gap-2 text-left text-[0.92rem]">
                        <span className="min-w-0 flex-1 break-words">{itemLine(b, ii)}</span>
                        <span aria-hidden className="text-muted">›</span>
                      </button>
                    ) : (
                      <span className="flex min-h-11 items-center text-[0.92rem] text-muted">{itemLine(b, ii)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {b.note && <p className="text-xs text-muted">{b.note}</p>}
          </div>
        ) : (
          <SimpleBlock key={b.title + bi} block={b} />
        ),
      )}
    </div>
  );
}
