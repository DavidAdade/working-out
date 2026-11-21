"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Block, BlockKind } from "@/lib/plan/templates.ts";
import { dayTitle, type Day } from "@/lib/plan/generate.ts";
import { addDays, daysBetween, dowName } from "@/lib/plan/dates.ts";
import { parseLine } from "@/lib/plan/exercises.ts";
import { addedKeys, addedTarget, completion, dayExercises, finishesDay, isLocked, LIFT_KINDS, nextInRound, sessionDate, type DayExercise } from "@/lib/plan/workout.ts";
import { dayGroups, daySlots, daySupersets, editGroup, type DayGroup } from "@/lib/plan/supersets.ts";
import { asExercise } from "@/lib/plan/catalog.ts";
import { itemKey, itemLine } from "@/lib/plan/swaps.ts";
import type { SetRow } from "@/lib/types";
import type { Exercise, Target } from "@/lib/plan/exercises.ts";
import { ExerciseRow, fmtSet, planDayOf, restFor, useSets, type SupersetFlow } from "./Sets";
import { SwapSheet, useSwap } from "./SwapSheet";
import { groupColor, SupersetSheet, useSuperset, type SheetRow } from "./Superset";
import { useWorkout, WorkoutBar } from "./Workout";
import { takeGoto, useGotoListener, type Goto } from "./RestTimer";

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

/** All blocks for one day. Lifts are compact rows; one opens at a time (a superset opens whole) and the next opens when you finish. */
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
  const openRef = useRef(openId);
  openRef.current = openId;
  const doneOf = (key: string) => sets.filter((s) => planDayOf(s) === day.date && s.exercise_key === key).length;

  // Exercises added on top of the workout: picked here (kept on this phone until their first set), then anything
  // else logged on this day that it doesn't show. Logged like the rest, counted as extra work.
  const pickedKey = `wf-added:${day.date}`;
  const [picked, setPicked] = useState<string[]>([]);
  // A pick whose exercise is gone (a custom one deleted since) is dropped
  const added = useMemo(() => (logDate ? addedKeys(day, sets, picked.filter((k) => info(k))) : []), [logDate, day, sets, picked, info]);
  const addedExercise = (key: string): { exercise: Exercise; target: Target } => {
    const e = info(key);
    if (e) return { exercise: asExercise(e), target: addedTarget(e) };
    // A deleted custom exercise that still has sets here: its name and kind from what was logged
    const rows = sets.filter((s) => planDayOf(s) === day.date && s.exercise_key === key);
    const load = rows.some((s) => s.duration_sec != null) ? "time" : rows.some((s) => s.weight != null) ? "weight" : "bodyweight";
    return { exercise: { key, name: nameOf(key), load, lines: [] }, target: addedTarget({ load, lines: [] }) };
  };

  // Supersets on this day: every loggable row (added ones too) by the key it's grouped under, and the groups in force
  const slots = useMemo(() => daySlots(day, added), [day, added]);
  // The person's saved ones, then the pairs the day's templates come with (shown even where they can't be changed)
  const supersetList = useMemo(() => daySupersets(day, supersetApi?.list ?? []), [day, supersetApi]);
  const groups = useMemo(() => dayGroups(slots, supersetList), [slots, supersetList]);
  const groupAt = (id: string | null): DayGroup | undefined => (id ? groups.find((g) => g.rows.includes(id)) : undefined);
  /** A row as logged: the exercise shown on it and its target sets */
  const rowOf = (id: string): DayExercise | undefined => {
    const x = order.find((o) => o.id === id);
    if (x || !id.startsWith("add-") || !added.includes(id.slice(4))) return x;
    return { id, key: id.slice(4), sets: addedExercise(id.slice(4)).target.sets };
  };
  const membersOf = (g: DayGroup) => g.rows.flatMap((r) => rowOf(r) ?? []);
  const isOpen = (id: string) => openId === id || (!!openId && !!groupAt(id)?.rows.includes(openId));
  const toggle = (id: string) => setOpenId(isOpen(id) ? null : id);
  // Landing on a superset: the unfinished exercise in it with the fewest sets, so rounds stay in step
  const enter = (x: DayExercise | undefined) => {
    const g = x && groupAt(x.id);
    if (!x || !g || !logDate) return x;
    const behind = membersOf(g).filter(unfinished);
    return behind.reduce((best, m) => (doneOf(m.key) < doneOf(best.key) ? m : best), behind[0] ?? x);
  };
  // On the Today tab, start on the first exercise you haven't finished
  useEffect(() => {
    if (logOpen && logDate) setOpenId((cur) => cur ?? enter(order.find(unfinished))?.id ?? null);
    // Only on first render: re-running would reopen rows you closed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The day's next unfinished exercise after row `id` (wrapping round), skipping `not`; a superset is entered at its furthest-behind member */
  const nextAfter = (id: string, not: string[] = []) => {
    const i = order.findIndex((x) => x.id === id);
    const open = (x: DayExercise) => unfinished(x) && !not.includes(x.id);
    return enter(order.slice(i + 1).find(open) ?? order.slice(0, Math.max(i, 0)).find(open));
  };

  // The rest timer's "Next set": open that exercise and bring its next set into view (from another tab or page too)
  const tab: Goto["where"] = logOpen ? "today" : "plan";
  const gotoFor = (id: string): Goto | undefined => (logDate ? { date: day.date, row: id, where: tab } : undefined);
  const openAt = (to: string) => {
    if (!order.some((x) => x.id === to) && !added.some((k) => `add-${k}` === to)) return;
    // The exercise it points at is finished (its last set started the rest): on to the next one that isn't
    const at = order.find((x) => x.id === to);
    const row = at && !unfinished(at) ? nextAfter(to)?.id ?? to : to;
    setOpenId(row);
    // Once the row has opened: its first unlogged set, centred, with a brief highlight
    setTimeout(() => {
      const anchor = document.getElementById(`ex-${day.date}-${row}`);
      const set = anchor?.querySelector<HTMLElement>("[data-next-set]");
      const el = set ?? anchor;
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      if (set) {
        set.classList.add("rounded-lg", "ring-2", "ring-accent");
        setTimeout(() => set.classList.remove("ring-2", "ring-accent"), 1600);
      }
    }, 120);
  };
  useEffect(() => {
    const g = takeGoto(day.date, tab);
    if (g) openAt(g.row);
    // Once, on landing here from the timer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useGotoListener((g) => g.date === day.date && takeGoto(day.date, tab) && openAt(g.row));
  // A new set that ticks off the day's last planned set starts no rest timer
  const lastSet = useCallback((key: string) => finishesDay(day, sets, key), [day, sets]);

  // Sets on this plan day under an exercise the day doesn't show (swapped out and back, a deleted custom
  // exercise, logged from the Library): never lost, listed at the end. A swapped row shows its own original's.
  const stray = useMemo(() => {
    const shown = new Set(order.map((x) => x.key));
    for (const b of day.blocks) for (const s of Object.values(b.swaps ?? {})) shown.add(s.from);
    const byKey = new Map<string, SetRow[]>();
    for (const s of sets) if (planDayOf(s) === day.date && !shown.has(s.exercise_key)) byKey.set(s.exercise_key, [...(byKey.get(s.exercise_key) ?? []), s]);
    return [...byKey].map(([key, rows]) => ({ key, rows: rows.sort((a, b) => a.set_no - b.set_no) }));
  }, [order, day.blocks, day.date, sets]);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(pickedKey) ?? "[]");
      if (Array.isArray(v)) setPicked(v.filter((k): k is string => typeof k === "string"));
      // Picks for days more than two weeks back are done with: their sets carry them now
      const old = addDays(today, -14);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith("wf-added:") && k.slice(9) < old) localStorage.removeItem(k);
      }
    } catch {}
  }, [pickedKey, today]);
  const savePicked = (next: string[]) => {
    setPicked(next);
    try {
      if (next.length) localStorage.setItem(pickedKey, JSON.stringify(next));
      else localStorage.removeItem(pickedKey);
    } catch {}
  };
  const [addingEx, setAddingEx] = useState(false);
  const [grouping, setGrouping] = useState<string | null>(null);
  // Ticks to start the superset sheet with: kept while the library is open to add one more exercise to the group
  const [preset, setPreset] = useState<string[] | null>(null);
  const [regroup, setRegroup] = useState<string | null>(null);
  const canAddEx = !!logDate && !locked && day.blocks.length > 0;

  const where = day.date === today ? "today" : `on ${dowName(day.date)}`;
  const closeSwap = (focusId?: string) => {
    setSwapping(null);
    if (focusId) requestAnimationFrame(() => document.getElementById(`swap-ex-${day.date}-${focusId}`)?.focus({ preventScroll: true }));
  };
  const sheet = (() => {
    if (addingEx)
      return (
        <SwapSheet
          original={null}
          current={null}
          target={null}
          light={false}
          inDay={new Set([...order.map((x) => x.key), ...added, ...day.blocks.flatMap((b) => Object.values(b.swaps ?? {}).map((s) => s.from))])}
          logged={[]}
          onClose={() => {
            setAddingEx(false);
            // Opened from the superset sheet: back to it, as it was
            if (regroup) setGrouping(regroup);
            setRegroup(null);
          }}
          onPick={(to) => {
            setAddingEx(false);
            savePicked([...picked.filter((k) => k !== to.key), to.key]);
            const id = `add-${to.key}`;
            if (regroup) {
              // Picked for a superset: back to its sheet with the new exercise ticked
              setPreset((cur) => [...(cur ?? [regroup]).filter((x) => x !== id), id]);
              setGrouping(regroup);
              setRegroup(null);
              return;
            }
            setOpenId(id);
            scrollToRow(`ex-${day.date}-${id}`);
          }}
        />
      );
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
        inDay={new Set([...order.filter((x) => x.id !== id).map((x) => x.key), ...added])}
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
    const next = nextAfter(id);
    setOpenId(next?.id ?? null);
    if (next) scrollToRow(`ex-${day.date}-${next.id}`);
  };

  // Supersets: logging round by round (no rest mid-round, the group's longest rest after it), and changing them
  const nameAt = (b: Block, i: number) => b.swaps?.[i]?.name ?? parseLine(b.items[i])?.name ?? b.items[i];
  const nameOfRow = (id: string) => {
    if (id.startsWith("add-")) return nameOf(id.slice(4));
    const [bi, ii] = id.split("-").map(Number);
    return nameAt(day.blocks[bi], ii);
  };
  /** Bring a row's next set into view with a brief highlight, without closing anything */
  const showNextSet = (row: string) =>
    setTimeout(() => {
      const anchor = document.getElementById(`ex-${day.date}-${row}`);
      const set = anchor?.querySelector<HTMLElement>("[data-next-set]");
      const el = set ?? anchor;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 120 || r.bottom > window.innerHeight - 160) el.scrollIntoView({ block: "center", behavior: "smooth" });
      if (set) {
        set.classList.add("rounded-lg", "ring-2", "ring-accent");
        setTimeout(() => set.classList.remove("ring-2", "ring-accent"), 1600);
      }
    }, 350);
  const flowFor = (id: string): SupersetFlow | undefined => {
    const g = groupAt(id);
    if (!g || !logDate) return undefined;
    const members = membersOf(g);
    const me = members.find((m) => m.id === id);
    if (!me || members.length < 2) return undefined;
    const restOf = (key: string) => {
      const e = info(key);
      return e ? restFor(asExercise(e)) : 90;
    };
    return {
      after: () => {
        // Counts with the set being logged right now
        const step = nextInRound(members, id, (key) => doneOf(key) + (key === me.key ? 1 : 0));
        // Group finished: the day's next exercise, as if this one had been the last of the group
        const onward = step.groupDone ? nextAfter(g.rows[g.rows.length - 1], g.rows)?.id : undefined;
        const target = step.next ?? onward ?? id;
        const rounds = Math.max(...members.map((m) => m.sets));
        return {
          rest: step.rest && { sec: Math.max(...members.map((m) => restOf(m.key))), label: `Superset ${g.letter}, round ${Math.min(step.round, rounds)} of ${rounds}` },
          goto: gotoFor(target),
          go: () => {
            if (step.groupDone) {
              // After the tick has shown, and only if you haven't opened something else meanwhile
              setTimeout(() => {
                if (!openRef.current || !g.rows.includes(openRef.current)) return;
                setOpenId(onward ?? null);
                if (onward) scrollToRow(`ex-${day.date}-${onward}`);
              }, 600);
            } else if (target !== id) showNextSet(target);
          },
        };
      },
    };
  };
  const sheetRows = (): SheetRow[] =>
    slots.flatMap((sl) => {
      const x = rowOf(sl.id);
      if (!x) return [];
      const t = sl.id.startsWith("add-") ? addedExercise(sl.id.slice(4)).target : null;
      const [bi, ii] = sl.id.split("-").map(Number);
      const tt = t ?? day.blocks[bi].swaps?.[ii]?.target ?? parseLine(day.blocks[bi].items[ii])!.target;
      return [{ id: sl.id, name: nameOfRow(sl.id), target: `${x.sets}×${tt.sec ? `${tt.sec}s` : tt.reps ?? "max"}`, letter: groupAt(sl.id)?.letter }];
    });
  const saveGroup = (row: string, chosen: string[]) => {
    if (!supersetApi) return;
    const e = editGroup(supersetList, slots, row, chosen, () => crypto.randomUUID());
    if (!e) return;
    const names = slots.filter((sl) => sl.id === row || chosen.includes(sl.id)).map((sl) => nameOfRow(sl.id));
    supersetApi.edit(e, names.length >= 2 ? `Superset: ${names.join(" + ")}.` : `${nameOfRow(row)} is out of the superset.`);
  };
  /** What a row shows and offers as part of (or outside) a superset */
  const groupProps = (id: string) => {
    const g = groupAt(id);
    const can = !!supersetApi && !locked && slots.length >= 2;
    return {
      badge: g ? `${g.letter}${g.rows.indexOf(id) + 1}` : undefined,
      bar: g ? groupColor(g.letter) : undefined,
      hint: g && g.rows[0] === id ? `Superset ${g.letter} · one set of each, then rest` : undefined,
      superset: flowFor(id),
      onSuperset: can ? () => setGrouping(id) : undefined,
      onLeave: g && can ? () => saveGroup(id, [id]) : undefined,
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
                      open={isOpen(id)}
                      onToggle={() => toggle(id)}
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
                      {...(parseLine(line) ? groupProps(id) : {})}
                      goto={gotoFor(id)}
                      finishesDay={lastSet}
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
      {logDate && (added.length > 0 || canAddEx) && (
        <div className="flex flex-col">
          {added.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                Added <span className="text-xs font-normal text-muted">extra work</span>
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {added.map((key) => {
                  const id = `add-${key}`;
                  const a = addedExercise(key);
                  const hasSets = sets.some((s) => planDayOf(s) === day.date && s.exercise_key === key);
                  return (
                    <ExerciseRow
                      key={id}
                      anchorId={`ex-${day.date}-${id}`}
                      line={a.exercise.name}
                      added={a}
                      logDate={logDate}
                      planDate={day.date}
                      light={false}
                      dayTitle={title}
                      open={isOpen(id)}
                      onToggle={() => toggle(id)}
                      locked={locked}
                      session={live ? sDate : null}
                      onComplete={() => advanceFrom(id)}
                      {...groupProps(id)}
                      goto={gotoFor(id)}
                      finishesDay={lastSet}
                      onRemoveAdded={!hasSets && !locked ? () => savePicked(picked.filter((k) => k !== key)) : undefined}
                    />
                  );
                })}
              </ul>
            </>
          )}
          {canAddEx && (
            <button type="button" className="btn-ghost mt-1 self-start" onClick={() => setAddingEx(true)}>
              + Add exercise
            </button>
          )}
        </div>
      )}
      {!logDate && stray.length > 0 && (
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
      {grouping && rowOf(grouping) && (
        <SupersetSheet
          rows={sheetRows()}
          row={grouping}
          current={groupAt(grouping)?.rows ?? []}
          preset={preset ?? undefined}
          onClose={() => {
            setGrouping(null);
            setPreset(null);
          }}
          onAddNew={
            canAddEx
              ? (chosen) => {
                  setPreset(chosen);
                  setRegroup(grouping);
                  setGrouping(null);
                  setAddingEx(true);
                }
              : undefined
          }
          onSave={(chosen) => {
            const row = grouping;
            setGrouping(null);
            setPreset(null);
            saveGroup(row, chosen);
          }}
        />
      )}
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
