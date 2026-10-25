"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { deleteSet, upsertSet } from "@/app/actions";
import { weekForDate, type Week } from "@/lib/plan/generate.ts";
import { parseLine, videoForLine, type Exercise, type Target } from "@/lib/plan/exercises.ts";
import { asExercise, type ExerciseInfo } from "@/lib/plan/catalog.ts";
import type { ExerciseVideo } from "@/lib/plan/videos.ts";
import { deleteExercise } from "@/app/actions";
import MuscleMap, { MuscleChips } from "./MuscleMap";
import { compareSession, sessions, toUnit, type Change, type Session } from "@/lib/plan/progress.ts";
import type { SetRow, Unit } from "@/lib/types";
import { useDates } from "./DateLabels";
import { LineChart } from "./charts";
import { useOpenVideo } from "./VideoModal";

/* ---------- shared state: every logged set, saved optimistically ---------- */
interface SetsCtx {
  sets: SetRow[];
  unit: Unit;
  today: string;
  /** Cutback weeks don't count toward weight comparisons */
  isLightDate: (date: string) => boolean;
  save: (row: Omit<SetRow, "id" | "weight_kg">, dayTitle: string) => void;
  remove: (date: string, key: string, setNo: number) => void;
  openHistory: (key: string, focusDate?: string) => void;
  error: string | null;
  /** Built-in and custom exercises, from the exercises table */
  exercises: ExerciseInfo[];
  info: (key: string) => ExerciseInfo | undefined;
  weeks: Week[];
}

const Ctx = createContext<SetsCtx | null>(null);
export const useSets = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSets outside SetsProvider");
  return c;
};

const toKg = (w: number | null, unit: Unit) => (w == null ? null : unit === "lb" ? Math.round(w * 0.45359237 * 100) / 100 : w);
const id = (date: string, key: string, setNo: number) => `${date}|${key}|${setNo}`;
const same = (a: Pick<SetRow, "date" | "exercise_key" | "set_no">, date: string, key: string, setNo: number) =>
  a.date === date && a.exercise_key === key && a.set_no === setNo;

export function SetsProvider({
  initial,
  unit,
  today,
  weeks,
  exercises,
  children,
}: {
  initial: SetRow[];
  unit: Unit;
  today: string;
  weeks: Week[];
  exercises: ExerciseInfo[];
  children: React.ReactNode;
}) {
  const [sets, setSets] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ key: string; focus?: string } | null>(null);
  // Local saves and deletes, kept on top of server data until a refresh shows them.
  // A refresh triggered by an earlier set can arrive after later sets were saved, so "action finished" isn't enough.
  const pending = useRef(new Map<string, SetRow | null>());
  useEffect(() => {
    const byId = new Map(initial.map((s) => [id(s.date, s.exercise_key, s.set_no), s]));
    for (const [k, row] of pending.current) {
      const server = byId.get(k);
      const agrees = row ? !!server && Number(server.weight ?? -1) === (row.weight ?? -1) && server.reps === row.reps && server.duration_sec === row.duration_sec : !server;
      if (agrees) pending.current.delete(k);
    }
    const out = initial.filter((s) => !pending.current.has(id(s.date, s.exercise_key, s.set_no)));
    for (const row of pending.current.values()) if (row) out.unshift(row);
    setSets(out);
  }, [initial]);
  // A failed write is dropped from the overlay so the revert sticks
  const settle = (k: string, row: SetRow | null) => {
    if (pending.current.get(k) === row) pending.current.delete(k);
  };

  const isLightDate = useCallback(
    (date: string) => {
      const w = weekForDate(weeks, date);
      return !!w?.cutback;
    },
    [weeks],
  );

  const save = useCallback<SetsCtx["save"]>((row, dayTitle) => {
    const optimistic: SetRow = { ...row, id: `tmp-${row.date}-${row.exercise_key}-${row.set_no}`, weight_kg: toKg(row.weight, row.unit) };
    const k = id(row.date, row.exercise_key, row.set_no);
    pending.current.set(k, optimistic);
    let before: SetRow[] = [];
    setSets((cur) => {
      before = cur;
      return [optimistic, ...cur.filter((s) => !same(s, row.date, row.exercise_key, row.set_no))];
    });
    setError(null);
    upsertSet({
      date: row.date,
      exerciseKey: row.exercise_key,
      setNo: row.set_no,
      weight: row.weight,
      unit: row.unit,
      reps: row.reps,
      durationSec: row.duration_sec,
      light: row.light_week,
      dayTitle,
    })
      .then((r) => {
        if (!r.ok) {
          settle(k, optimistic);
          setSets(before);
          setError(r.error);
        }
      })
      .catch(() => {
        settle(k, optimistic);
        setSets(before);
        setError("No connection. That set wasn't saved.");
      });
  }, []);

  const remove = useCallback<SetsCtx["remove"]>((date, key, setNo) => {
    const k = id(date, key, setNo);
    pending.current.set(k, null);
    let before: SetRow[] = [];
    setSets((cur) => {
      before = cur;
      return cur.filter((s) => !same(s, date, key, setNo));
    });
    deleteSet(date, key, setNo)
      .then((r) => !r.ok && (settle(k, null), setSets(before), setError(r.error)))
      .catch(() => (settle(k, null), setSets(before), setError("No connection. That set wasn't removed.")));
  }, []);

  const openHistory = useCallback((key: string, focus?: string) => setHistory({ key, focus }), []);

  const byKey = useMemo(() => new Map(exercises.map((e) => [e.key, e])), [exercises]);
  const info = useCallback((key: string) => byKey.get(key), [byKey]);
  const value = useMemo(
    () => ({ sets, unit, today, isLightDate, save, remove, openHistory, error, exercises, info, weeks }),
    [sets, unit, today, isLightDate, save, remove, openHistory, error, exercises, info, weeks],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {error && (
        <div role="alert" className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom,0px))] z-40 mx-auto flex max-w-[680px] items-center justify-between gap-3 rounded-lg border border-bad bg-surface px-3.5 py-2.5 text-sm shadow-lg">
          <span>{error}</span>
          <button className="btn-ghost" onClick={() => setError(null)}>
            OK
          </button>
        </div>
      )}
      {history && <ExerciseSheet key={history.key} exerciseKey={history.key} focus={history.focus} onClose={() => setHistory(null)} />}
    </Ctx.Provider>
  );
}

/* ---------- formatting ---------- */
export function fmtWeight(kg: number | null, unit: Unit): string {
  if (kg == null) return "";
  return String(Number(toUnit(kg, unit).toFixed(2)));
}

/** "40×8" / "×12" / "40s" for one set, in the viewer's unit */
export function fmtSet(s: Pick<SetRow, "weight_kg" | "reps" | "duration_sec">, unit: Unit): string {
  if (s.duration_sec != null) return `${s.duration_sec}s`;
  const w = s.weight_kg ? fmtWeight(Number(s.weight_kg), unit) : "";
  return w ? `${w}×${s.reps ?? "?"}` : `×${s.reps ?? "?"}`;
}

/* ---------- one exercise: a compact row that opens into its set table ---------- */
export interface RowProps {
  anchorId?: string;
  line: string;
  /** Date the sets save under, or null when this day can't be logged yet */
  logDate: string | null;
  light: boolean;
  dayTitle: string;
  open: boolean;
  onToggle: () => void;
  /** Called once when the last planned set is ticked */
  onComplete: () => void;
}

export function ExerciseRow({ anchorId, line, logDate: planLogDate, light, dayTitle, open, onToggle, onComplete }: RowProps) {
  const parsed = parseLine(line);
  const { sets, unit, today, openHistory } = useSets();
  const dates = useDates();
  const openVideo = useOpenVideo();
  const video = videoForLine(line);
  // Far-off days open read-only; "Log it today" switches this row to logging under today
  const [logToday, setLogToday] = useState(false);
  if (!parsed) {
    return (
      <li id={anchorId} className="flex min-h-11 items-center gap-1 py-1 text-[0.92rem]">
        {video ? <VideoButton onClick={() => openVideo(video)} label={video.name} /> : <span className="w-11 flex-none" />}
        <span className="min-w-0">{line}</span>
      </li>
    );
  }
  const logDate = planLogDate ?? (logToday ? today : null);
  const { exercise, target, name } = parsed;
  const sized = light ? { ...target, sets: Math.min(target.sets, 2) } : target;
  const done = logDate ? sets.filter((s) => s.date === logDate && s.exercise_key === exercise.key).sort((a, b) => a.set_no - b.set_no) : [];
  const complete = done.length >= sized.sets;
  // The weight warning stays visible after the row closes
  const change = logDate && complete && !open && exercise.load === "weight" ? compareSession(sessions(sets, exercise.key), logDate) : null;
  const targetText = `${sized.sets}×${target.sec ? `${target.sec}s` : target.reps ?? "max"}${target.each ? " each" : ""}`;
  const last = logDate ? null : sessions(sets, exercise.key)[0];

  return (
    <li id={anchorId} className={`flex scroll-mt-20 flex-col ${complete && !open ? "opacity-70" : ""}`}>
      <div className="flex min-h-11 items-center gap-1">
        {video ? <VideoButton onClick={() => openVideo(video)} label={video.name} /> : <span className="w-11 flex-none" />}
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="font-medium">{name}</span> <span className="whitespace-nowrap font-mono text-[0.8rem] text-muted">{targetText}</span>
          </span>
          {logDate && (
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${
                complete ? "bg-good/15 text-good" : done.length ? "bg-warn/15 text-warn" : "bg-sunk text-muted"
              }`}
            >
              {complete ? `✓ ${fmtSet(topOf(done), unit)}` : `${done.length}/${sized.sets}`}
            </span>
          )}
          <span aria-hidden className={`w-4 text-center text-muted transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
      </div>
      {change && (
        <div className="mb-2 ml-11">
          <ChangeBanner change={change} exerciseKey={exercise.key} />
        </div>
      )}
      {open && logDate && (
        <SetTable exercise={exercise} target={sized} date={logDate} light={light} dayTitle={dayTitle} done={done} onCollapse={onToggle} onComplete={onComplete} />
      )}
      {open && !logDate && (
        <div className="mb-2 ml-11 flex flex-col gap-1.5 text-sm">
          <p className="text-muted">
            {last ? (
              <>
                Last ({dates.day(last.date)}): <span className="font-mono text-ink">{last.sets.map((x) => fmtSet(x, unit)).join(", ")}</span>
              </>
            ) : (
              "Not logged yet."
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-ghost px-3 text-xs" onClick={() => setLogToday(true)}>
              Log it today
            </button>
            <button type="button" className="btn-ghost px-3 text-xs" onClick={() => openHistory(exercise.key)}>
              History
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function VideoButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Watch ${label} video`} className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-accent-ink active:bg-sunk">
      <span aria-hidden className="text-[0.8rem]">▶</span>
    </button>
  );
}

/** Heaviest set, or the best reps/seconds for bodyweight work */
const topOf = (rows: SetRow[]) =>
  rows.reduce((best, r) => ((r.weight_kg ?? 0) > (best.weight_kg ?? 0) || ((r.weight_kg ?? 0) === (best.weight_kg ?? 0) && (r.reps ?? r.duration_sec ?? 0) > (best.reps ?? best.duration_sec ?? 0)) ? r : best), rows[0]);

function SetTable({
  exercise,
  target,
  date,
  light,
  dayTitle,
  done,
  onCollapse,
  onComplete,
  inset = true,
}: {
  inset?: boolean;
  exercise: Exercise;
  target: Target;
  date: string;
  light: boolean;
  dayTitle: string;
  done: SetRow[];
  onCollapse: () => void;
  onComplete: () => void;
}) {
  const { sets, unit, isLightDate, save, remove, openHistory } = useSets();
  const dates = useDates();
  const all = useMemo(() => sessions(sets, exercise.key), [sets, exercise.key]);
  const prev = all.find((s) => s.date < date);
  const lightSession = light || isLightDate(date);
  const [extra, setExtra] = useState(0);
  const rowCount = Math.max(target.sets, done.length ? done[done.length - 1].set_no : 0) + extra;
  const change = done.length >= Math.min(target.sets, prev?.sets.length ?? target.sets) ? compareSession(all, date) : null;

  // Move on once the last planned set is ticked; opening an already-finished exercise doesn't count
  const count = useRef(done.length);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  useEffect(() => {
    const before = count.current;
    count.current = done.length;
    if (before < target.sets && done.length >= target.sets) setTimeout(() => completeRef.current(), 600);
  }, [done.length, target.sets]);

  const cols = exercise.load === "weight" ? "grid-cols-[1.25rem_5rem_4rem_2.75rem]" : "grid-cols-[1.25rem_5rem_2.75rem]";

  return (
    <div className={`mb-2 flex max-w-sm flex-col gap-1.5 ${inset ? "ml-11" : ""}`}>
      {prev && (
        <button type="button" onClick={() => openHistory(exercise.key, prev.date)} className="text-left text-xs text-muted">
          Last ({dates.day(prev.date)}): <span className="font-mono">{prev.sets.map((x) => fmtSet(x, unit)).join(", ")}</span>
        </button>
      )}
      <div className={`grid ${cols} items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted`}>
        <span>#</span>
        {exercise.load === "weight" && <span className="text-center">{unit}</span>}
        <span className="text-center">{exercise.load === "time" ? "Sec" : "Reps"}</span>
        <span className="text-center">✓</span>
      </div>
      {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) => (
        <SetRowView
          key={`${date}-${n}`}
          cols={cols}
          exercise={exercise}
          setNo={n}
          logged={done.find((d) => d.set_no === n)}
          last={prev ? prev.sets.find((s) => s.set_no === n) ?? prev.sets[prev.sets.length - 1] : undefined}
          target={target}
          onSave={(w, r) =>
            save(
              {
                date,
                exercise_key: exercise.key,
                set_no: n,
                weight: exercise.load === "time" ? null : w,
                unit,
                reps: exercise.load === "time" ? null : r,
                duration_sec: exercise.load === "time" ? r : null,
                light_week: lightSession,
              },
              dayTitle,
            )
          }
          onRemove={() => remove(date, exercise.key, n)}
        />
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-ghost px-3 text-xs" onClick={() => setExtra((x) => x + 1)}>
          + Set
        </button>
        <button type="button" className="btn-ghost px-3 text-xs" onClick={() => openHistory(exercise.key)}>
          History
        </button>
        {target.each && <span className="text-xs text-muted">One side</span>}
        <button type="button" className="btn-ghost ml-auto px-3 text-xs" onClick={onCollapse} aria-label={`Collapse ${exercise.name}`}>
          Collapse ▴
        </button>
      </div>
      {change && <ChangeBanner change={change} exerciseKey={exercise.key} />}
    </div>
  );
}

function SetRowView({
  cols,
  exercise,
  setNo,
  logged,
  last,
  target,
  onSave,
  onRemove,
}: {
  cols: string;
  exercise: Exercise;
  setNo: number;
  logged: SetRow | undefined;
  last: SetRow | undefined;
  target: Target;
  onSave: (weight: number | null, repsOrSec: number | null) => void;
  onRemove: () => void;
}) {
  const { unit } = useSets();
  const timed = exercise.load === "time";
  const loggedWeight = logged?.weight_kg != null ? fmtWeight(Number(logged.weight_kg), unit) : "";
  const loggedCount = logged ? String((timed ? logged.duration_sec : logged.reps) ?? "") : "";
  const [w, setW] = useState(loggedWeight);
  const [r, setR] = useState(loggedCount);
  const countRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setW(loggedWeight);
    setR(loggedCount);
  }, [loggedWeight, loggedCount]);

  // Grey placeholders: last session's numbers, or the plan's target the first time
  const phW = last?.weight_kg ? fmtWeight(Number(last.weight_kg), unit) : "";
  const phR = String((timed ? last?.duration_sec ?? target.sec : last?.reps ?? target.reps) ?? "");
  const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const commit = () => {
    const weight = parse(w || phW);
    const count = parse(r || phR);
    if (count == null || Number.isNaN(count)) {
      countRef.current?.focus();
      return;
    }
    onSave(weight == null || Number.isNaN(weight) ? null : weight, Math.round(count));
  };
  // Editing a ticked row saves when you leave the field
  const onBlurEdit = () => logged && (w !== loggedWeight || r !== loggedCount) && commit();
  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();
  const field = "min-h-11 w-full rounded-lg border bg-bg px-1 text-center font-mono text-base text-ink placeholder:text-muted/60";

  return (
    <div className={`grid ${cols} items-center gap-1.5`}>
      <span className="font-mono text-sm text-muted">{setNo}</span>
      {exercise.load === "weight" && (
        <input
          aria-label={`Set ${setNo} weight (${unit})`}
          inputMode="decimal"
          enterKeyHint="next"
          value={w}
          placeholder={phW}
          onChange={(e) => setW(e.target.value)}
          onFocus={selectAll}
          onBlur={onBlurEdit}
          className={`${field} ${logged ? "border-good/60" : "border-line"}`}
        />
      )}
      <input
        ref={countRef}
        aria-label={`Set ${setNo} ${timed ? "seconds" : "reps"}`}
        inputMode="numeric"
        enterKeyHint="done"
        value={r}
        placeholder={phR}
        onChange={(e) => setR(e.target.value.replace(/\D/g, ""))}
        onFocus={selectAll}
        onBlur={onBlurEdit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), !logged && commit())}
        className={`${field} ${logged ? "border-good/60" : "border-line"}`}
      />
      <button
        type="button"
        aria-label={logged ? `Untick set ${setNo}` : `Done set ${setNo}`}
        aria-pressed={!!logged}
        onClick={() => (logged ? onRemove() : commit())}
        className={`flex h-11 w-11 items-center justify-center rounded-lg border text-lg font-bold ${logged ? "border-good bg-good text-bg" : "border-line bg-surface text-muted"}`}
      >
        ✓
      </button>
    </div>
  );
}

/* ---------- "not heavier" / "lighter" banner ---------- */
export function ChangeBanner({ change, exerciseKey, name }: { change: Change; exerciseKey: string; name?: string }) {
  const { unit, openHistory } = useSets();
  const dates = useDates();
  const prev = fmtWeight(change.previous.topKg, unit);
  const cur = fmtWeight(change.current.topKg, unit);
  const dropped = change.kind === "dropped";
  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm ${dropped ? "border-bad bg-bad/10" : "border-warn bg-warn/10"}`} role="status">
      <span>
        <b>{name ? `${name}: ` : ""}{dropped ? `Down ${Math.round(-change.pct)}% from last time.` : "No weight increase."}</b>{" "}
        {dropped ? `${prev} → ${cur} ${unit}.` : `Same ${cur} ${unit} as ${dates.day(change.previous.date)}. Add a little next set or next week.`}
      </span>
      <button type="button" className="self-start font-semibold text-accent-ink underline underline-offset-2" onClick={() => openHistory(exerciseKey, change.previous.date)}>
        See last session →
      </button>
    </div>
  );
}

/* ---------- one exercise: muscles, video, logging and history in one sheet ---------- */
export const videoFromInfo = (x: ExerciseInfo): ExerciseVideo | null =>
  x.video_ids.length ? { key: x.key, name: x.name, match: /$^/, ids: x.video_ids, query: x.video_query ?? x.name } : null;

function ExerciseSheet({ exerciseKey, focus, onClose }: { exerciseKey: string; focus?: string; onClose: () => void }) {
  const { sets, unit, today, info, weeks } = useSets();
  const dates = useDates();
  const openVideo = useOpenVideo();
  const item = info(exerciseKey);
  const ex = item ? asExercise(item) : undefined;
  const all = useMemo(() => sessions(sets, exerciseKey), [sets, exerciseKey]);
  const focusRef = useRef<HTMLLIElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [logging, setLogging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which plan sessions use it: "Legs: rebuild (gym)", …
  const usedIn = useMemo(
    () => [...new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.filter((b) => b.items.some((l) => parseLine(l)?.exercise.key === exerciseKey)).map((b) => b.title))))],
    [weeks, exerciseKey],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (focusRef.current ?? closeRef.current)?.scrollIntoView({ block: "center" });
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  if (!ex) return null;
  const weighted = ex.load === "weight";
  const metric = (s: Session) => (weighted ? (s.topKg == null ? null : toUnit(s.topKg, unit)) : s.best);
  const chart = [...all].reverse().slice(-12);
  const vals = chart.map(metric).filter((v): v is number => v != null);
  const bestEver = vals.length ? Math.max(...all.map(metric).filter((v): v is number => v != null)) : null;
  const metricUnit = weighted ? unit : ex.load === "time" ? "s" : "reps";
  // Four gridlines on whole numbers
  const yLo = vals.length ? Math.max(0, Math.floor(Math.min(...vals) * 0.9)) : 0;
  const yHi = vals.length ? yLo + Math.max(4, Math.ceil((Math.max(...vals) * 1.1 - yLo) / 4) * 4) : 4;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ex.name}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[720px] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="label">{item!.owner ? "Your exercise" : "Exercise"}</div>
            <h3 className="font-display text-2xl font-bold">{ex.name}</h3>
          </div>
          <button ref={closeRef} className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {item!.primary_muscles.length > 0 && <MuscleChips primary={item!.primary_muscles} secondary={item!.secondary_muscles} />}

        <div className="flex flex-wrap gap-1.5">
          {videoFromInfo(item!) && (
            <button type="button" className="btn-ghost" onClick={() => openVideo(videoFromInfo(item!)!)}>
              ▶ Video
            </button>
          )}
          {!logging && (
            <button type="button" className="btn-ghost" onClick={() => setLogging(true)}>
              Log today
            </button>
          )}
          {item!.owner &&
            (confirmDelete ? (
              <button type="button" className="btn-ghost ml-auto border-bad text-bad" onClick={() => void deleteExercise(ex.key).then((r) => r.ok && onClose())}>
                Delete for good
              </button>
            ) : (
              <button type="button" className="btn-ghost ml-auto" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
        </div>
        {logging && (
          <SetTable
            exercise={ex}
            target={sheetTarget(ex, all.find((s) => s.date < today))}
            date={today}
            light={false}
            dayTitle={ex.name}
            done={sets.filter((s) => s.date === today && s.exercise_key === ex.key).sort((a, b) => a.set_no - b.set_no)}
            onCollapse={() => setLogging(false)}
            onComplete={() => {}}
            inset={false}
          />
        )}
        {item!.primary_muscles.length > 0 && (
          <div className="mx-auto w-full max-w-[260px] border-t border-line pt-2.5">
            <MuscleMap primary={item!.primary_muscles} secondary={item!.secondary_muscles} size="sm" />
          </div>
        )}
        {usedIn.length > 0 && <p className="text-sm text-muted">In your plan: {usedIn.join(" · ")}</p>}

        <div className="label mt-1">History</div>
        {all.length === 0 ? (
          <p className="text-muted">Nothing logged yet. Tick a set and it shows up here.</p>
        ) : (
          <>
            {bestEver != null && (
              <p className="text-sm">
                Best <b className="font-mono">{bestEver} {metricUnit}</b> · {all.length} session{all.length === 1 ? "" : "s"}
              </p>
            )}
            {vals.length >= 2 && (
              <LineChart
                series={[{ color: "rgb(var(--accent))", values: chart.map(metric) }]}
                labels={chart.map((s) => dates.short(s.date))}
                yMin={yLo}
                yMax={yHi}
                yFmt={(v) => `${Math.round(v)}`}
                height={180}
              />
            )}
            <ul className="flex flex-col">
              {all.map((s, i) => {
                const change = weighted ? compareSession(all, s.date) : null;
                const isFocus = s.date === focus;
                return (
                  <li key={s.date} ref={isFocus ? focusRef : undefined} className={`flex flex-col gap-0.5 border-t border-line px-2 py-2.5 first:border-t-0 ${isFocus ? "rounded-lg bg-accent/10" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <b>{dates.day(s.date)}</b>
                      <span className="text-xs text-muted">
                        {isFocus ? "Last session · " : ""}
                        {s.light ? "light week" : change ? (change.kind === "dropped" ? `▼ ${Math.round(-change.pct)}%` : "= same") : i < all.length - 1 && weighted ? "▲" : ""}
                      </span>
                    </div>
                    <span className="font-mono text-sm">{s.sets.map((x) => fmtSet(x, unit)).join(", ")}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Logging from the library: the previous session's shape, or 3 × 10 the first time. */
function sheetTarget(ex: Exercise, last: Session | undefined): Target {
  const top = last?.sets[0];
  return {
    sets: last ? last.sets.length : 3,
    reps: ex.load === "time" ? null : top?.reps ?? 10,
    sec: ex.load === "time" ? top?.duration_sec ?? 30 : null,
    each: false,
  };
}
