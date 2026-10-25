"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Block, BlockKind } from "@/lib/plan/templates.ts";
import { dayTitle, type Day } from "@/lib/plan/generate.ts";
import { daysBetween } from "@/lib/plan/dates.ts";
import { parseLine } from "@/lib/plan/exercises.ts";
import { ExerciseRow, useSets } from "./Sets";

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

const LIFT_KINDS: BlockKind[] = ["legs", "upper", "abs", "mobility"];

export function Chip({ kind }: { kind: BlockKind }) {
  const c = CHIP[kind];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>{c.label}</span>;
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
export function DayBlocks({ day, onSkip, today, logOpen = false }: { day: Day; onSkip?: (date: string, skip: boolean) => void; today: string; logOpen?: boolean }) {
  const { sets } = useSets();
  // Past days and today log on their own date; the next week's workouts can be done early and log under today
  const early = day.date > today && daysBetween(today, day.date) < 7;
  const logDate = day.date <= today ? day.date : early ? today : null;
  const title = day.blocks.filter((b) => LIFT_KINDS.includes(b.kind)).map((b) => b.title).join(" + ") || dayTitle(day);

  // Every loggable exercise in order, so "next" can cross from one block into the next
  const order = useMemo(
    () =>
      day.blocks.flatMap((b, bi) =>
        LIFT_KINDS.includes(b.kind)
          ? b.items.flatMap((line, ii) => {
              const p = parseLine(line);
              return p ? [{ id: `${bi}-${ii}`, key: p.exercise.key, sets: b.light ? Math.min(p.target.sets, 2) : p.target.sets }] : [];
            })
          : [],
      ),
    [day.blocks],
  );
  const unfinished = useCallback(
    (x: { key: string; sets: number }) => !logDate || sets.filter((s) => s.date === logDate && s.exercise_key === x.key).length < x.sets,
    [sets, logDate],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  // On the Today tab, start on the first exercise you haven't finished
  useEffect(() => {
    if (logOpen && logDate) setOpenId((cur) => cur ?? order.find(unfinished)?.id ?? null);
    // Only on first render: re-running would reopen rows you closed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advanceFrom = (id: string) => {
    const i = order.findIndex((x) => x.id === id);
    const next = order.slice(i + 1).find(unfinished) ?? order.slice(0, i).find(unfinished);
    setOpenId(next?.id ?? null);
    if (next) requestAnimationFrame(() => document.getElementById(`ex-${day.date}-${next.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  if (day.skipped)
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Skipped this week. Upper-body work moved to another day.</p>
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
      {early && order.length > 0 && <p className="text-xs text-muted">Doing this early? Sets save under today.</p>}
      {day.blocks.map((b, bi) =>
        LIFT_KINDS.includes(b.kind) ? (
          <div key={b.title + bi} className="flex flex-col">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold">
              {b.title} <Chip kind={b.kind} />
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {b.items.map((line, ii) => {
                const id = `${bi}-${ii}`;
                return (
                  <ExerciseRow
                      key={id}
                      anchorId={`ex-${day.date}-${id}`}
                      line={line}
                      logDate={logDate}
                      light={!!b.light || !!b.foldedFrom}
                      dayTitle={title}
                      open={openId === id}
                      onToggle={() => setOpenId((cur) => (cur === id ? null : id))}
                      onComplete={() => advanceFrom(id)}
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
      {onSkip && day.skippable && (
        <button className="min-h-11 self-start text-sm text-muted underline underline-offset-2" onClick={() => onSkip(day.date, true)}>
          Skip this day (4-day week)
        </button>
      )}
    </div>
  );
}
