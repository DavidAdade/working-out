"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MUSCLES, MUSCLE_GROUPS } from "@/lib/plan/muscles.ts";
import type { Target } from "@/lib/plan/exercises.ts";
import type { ExerciseInfo } from "@/lib/plan/catalog.ts";
import { rankForSwap, swapTarget, type Pickable } from "@/lib/plan/swaps.ts";
import { fmtSet, useSets, videoFromInfo } from "./Sets";
import { useOpenVideo } from "./VideoModal";
import EquipmentChips from "./EquipmentChips";
import type { EquipmentId } from "@/lib/plan/equipment.ts";
import type { SetRow } from "@/lib/types";

/* ---------- saving a swap: provided by the Dashboard, which owns the plan ---------- */
export interface SwapApi {
  /** Swap the template exercise `from` on plan day `planDate` for `to` (null puts it back); `note` shows once saved, with Undo */
  swap: (planDate: string, from: string, to: string | null, note: string) => void;
  openLibrary: () => void;
}

const Ctx = createContext<SwapApi | null>(null);
export const SwapProvider = Ctx.Provider;
/** Null where swapping isn't offered */
export const useSwap = () => useContext(Ctx);

const MUSCLE = new Map<string, { name: string; group: string }>(MUSCLES.map((m) => [m.id, m]));
const muscleName = (id: string) => MUSCLE.get(id)?.name ?? id;

/** "3×10", "2×30s each": the target an exercise carries into this row */
export const fmtTarget = (t: Target) => `${t.sets}×${t.sec != null ? `${t.sec}s` : t.reps ?? "max"}${t.each ? " each" : ""}`;

type Chip = "suggested" | "all" | (typeof MUSCLE_GROUPS)[number];

/**
 * Pick another exercise for one row of a plan day. Same-muscle suggestions first; typing searches every
 * built-in and custom exercise by name and muscle, forgiving shorthand ("db") and one typo.
 */
export function SwapSheet({
  original,
  current,
  target,
  light,
  inDay,
  logged,
  onPick,
  onClose,
}: {
  /** The template's exercise for this row */
  original: ExerciseInfo;
  /** What the row shows now: the original, or the exercise swapped in */
  current: ExerciseInfo | { key: string; name: string };
  /** The template target (sets come from it whatever the exercise) */
  target: Target;
  light: boolean;
  /** Keys already shown elsewhere on this day: two rows with one key would share sets */
  inDay: Set<string>;
  /** Sets already logged for `current` on this plan day: they stay */
  logged: SetRow[];
  onPick: (to: ExerciseInfo) => void;
  onClose: () => void;
}) {
  const { exercises, unit } = useSets();
  const openVideo = useOpenVideo();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Chip>("suggested");
  const [gear, setGear] = useState<EquipmentId | null>(null);
  const [limit, setLimit] = useState(40);
  // Typing searches everything, unless a muscle group was picked
  const shownChip: Chip = q.trim() && chip === "suggested" ? "all" : chip;
  const swapped = current.key !== original.key;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Not the search box: the keyboard would cover the suggestions
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const list = useMemo(() => {
    const pool = exercises.filter((e) => e.key !== original.key && e.key !== current.key && (!gear || (e.equipment ?? []).includes(gear)));
    const inGroup = shownChip === "suggested" || shownChip === "all" ? pool : pool.filter((e) => e.primary_muscles.some((m) => MUSCLE.get(m)?.group === shownChip));
    const ranked = rankForSwap<ExerciseInfo>(inGroup, original as Pickable, q, muscleName, shownChip === "all" && !q.trim() ? 0 : 8);
    return ranked;
  }, [exercises, original, current.key, shownChip, q, gear]);

  const sized = (e: ExerciseInfo) => {
    const t = swapTarget(target, e.load);
    return light ? { ...t, sets: Math.min(t.sets, 2) } : t;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Swap ${current.name}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[520px] flex-col overflow-y-auto rounded-t-2xl border border-line bg-surface pb-[max(16px,env(safe-area-inset-bottom,0px))] sm:rounded-2xl"
      >
        <div className="sticky top-0 z-[1] flex flex-col gap-2 border-b border-line bg-surface px-4 pb-2 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="label">Swap exercise</div>
              <h3 className="break-words font-display text-xl font-bold">{current.name}</h3>
            </div>
            <button ref={cancelRef} type="button" className="btn-ghost flex-none" onClick={onClose}>
              Cancel
            </button>
          </div>
          {logged.length > 0 && (
            <p className="rounded-lg border border-line bg-sunk px-3 py-2 text-sm">
              {logged.length} set{logged.length === 1 ? "" : "s"} of {current.name} stay logged ({logged.map((s) => fmtSet(s, unit)).join(", ")}). New sets save under the exercise you pick.
            </p>
          )}
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="Search exercises or muscles"
            aria-label="Search exercises"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(40);
            }}
            className="input"
          />
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label="Show">
            {(["suggested", "all", ...MUSCLE_GROUPS] as Chip[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={shownChip === c}
                onClick={() => {
                  setChip(c);
                  setLimit(40);
                }}
                className={`min-h-11 flex-none rounded-full border px-3 text-sm font-semibold ${shownChip === c ? "border-ink bg-ink text-bg" : "border-line bg-surface"}`}
              >
                {c === "suggested" ? "Suggested" : c === "all" ? "All" : c}
              </button>
            ))}
          </div>
          <EquipmentChips
            value={gear}
            onChange={(g) => {
              setGear(g);
              setLimit(40);
            }}
          />
        </div>

        <ul className="flex flex-col divide-y divide-line px-2">
          {swapped && (
            <SwapOption e={original} detail={`Original · ${fmtTarget(sized(original))}`} tag="Put back" onPick={() => onPick(original)} onVideo={openVideo} />
          )}
          {list.slice(0, limit).map((e) => {
            const taken = inDay.has(e.key);
            const muscles = e.primary_muscles.map(muscleName).join(", ");
            return (
              <SwapOption
                key={e.key}
                e={e}
                detail={`${muscles ? `${muscles} · ` : ""}${fmtTarget(sized(e))}`}
                tag={taken ? "In this workout" : "Swap"}
                disabled={taken}
                onPick={() => onPick(e)}
                onVideo={openVideo}
              />
            );
          })}
        </ul>
        {list.length > limit && (
          <button type="button" className="btn-ghost mx-4 mt-2" onClick={() => setLimit((n) => n + 60)}>
            Show {Math.min(60, list.length - limit)} more
          </button>
        )}
        {list.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">
            {q.trim() ? `No match for "${q.trim()}". ` : "Nothing here yet. "}Try a muscle, or{" "}
            <LibraryLink /> to add your own.
          </p>
        )}
      </div>
    </div>
  );
}

function LibraryLink() {
  const api = useSwap();
  if (!api) return <>use the Library tab</>;
  return (
    <button type="button" className="min-h-11 font-semibold text-accent-ink underline underline-offset-2" onClick={api.openLibrary}>
      open Library
    </button>
  );
}

function SwapOption({
  e,
  detail,
  tag,
  disabled = false,
  onPick,
  onVideo,
}: {
  e: ExerciseInfo;
  detail: string;
  tag: string;
  disabled?: boolean;
  onPick: () => void;
  onVideo: (v: NonNullable<ReturnType<typeof videoFromInfo>>) => void;
}) {
  const video = videoFromInfo(e);
  return (
    <li className="flex items-center gap-1">
      {video ? (
        <button type="button" onClick={() => onVideo(video)} aria-label={`Watch ${e.name} video`} className="flex h-12 w-11 flex-none items-center justify-center rounded-lg text-accent-ink active:bg-sunk">
          <span aria-hidden className="text-[0.8rem]">▶</span>
        </button>
      ) : (
        <span className="w-11 flex-none" />
      )}
      <button type="button" disabled={disabled} onClick={onPick} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left disabled:opacity-50">
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium">
            {e.name}
            {e.owner && <span className="ml-1.5 rounded bg-sunk px-1.5 py-px text-[0.68rem] font-semibold uppercase tracking-wide text-muted">Yours</span>}
          </span>
          <span className="block text-xs text-muted">{detail}</span>
        </span>
        <span className={`whitespace-nowrap text-sm font-semibold ${disabled ? "text-muted" : "text-accent-ink"}`}>{tag}</span>
      </button>
    </li>
  );
}
