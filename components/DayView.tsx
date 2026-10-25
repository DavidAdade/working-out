"use client";

import type { Block, BlockKind } from "@/lib/plan/templates.ts";
import { dayTitle, type Day } from "@/lib/plan/generate.ts";
import { videoFor } from "@/lib/plan/videos.ts";
import { ExerciseLine } from "./VideoModal";
import { ExerciseSets } from "./Sets";

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

export function Chip({ kind }: { kind: BlockKind }) {
  const c = CHIP[kind];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>{c.label}</span>;
}

export function BlockView({ block, date, dayTitle, logOpen }: { block: Block; date?: string; dayTitle?: string; logOpen?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5 font-semibold">
        {block.title} <Chip kind={block.kind} />
      </div>
      <ul className="ml-[1.1em] list-disc space-y-0.5 text-[0.92rem]">
        {block.items.map((x, i) => (
          <li key={i}>
            <ExerciseLine text={x} video={videoFor(x)} />
            {date && (
              <ExerciseSets line={x} date={date} light={!!block.light || !!block.foldedFrom} dayTitle={dayTitle ?? block.title} startOpen={!!logOpen} />
            )}
          </li>
        ))}
      </ul>
      {block.note && <div className="text-sm text-muted">{block.note}</div>}
    </div>
  );
}

/** All blocks for one day, plus the skip toggle for 4-day weeks. */
export function DayBlocks({ day, onSkip, compact = false, logOpen = false }: { day: Day; onSkip?: (date: string, skip: boolean) => void; compact?: boolean; logOpen?: boolean }) {
  const lifts = day.blocks.filter((b) => b.kind === "legs" || b.kind === "upper" || b.kind === "abs" || b.kind === "mobility");
  const title = lifts.map((b) => b.title).join(" + ") || dayTitle(day);
  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
      {day.alerts.map((a) => (
        <div key={a} className="rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm">
          {a}
        </div>
      ))}
      {day.skipped ? (
        <p className="text-sm text-muted">Skipped this week. Upper-body work moved to another day.</p>
      ) : (
        day.blocks.map((b, i) => <BlockView key={b.title + i} block={b} date={day.date} dayTitle={title} logOpen={logOpen} />)
      )}
      {onSkip && day.skippable && (
        <div>
          <button className="btn-ghost" onClick={() => onSkip(day.date, !day.skipped)}>
            {day.skipped ? "Restore this day" : "Skip this day (4-day week)"}
          </button>
        </div>
      )}
    </div>
  );
}
