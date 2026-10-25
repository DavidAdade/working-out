"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SetInput } from "@/app/actions";
import { useDock, type SendResult } from "./Dock";
import { weekForDate, type Week } from "@/lib/plan/generate.ts";
import { parseLine, videoForLine, type Exercise, type Target } from "@/lib/plan/exercises.ts";
import { asExercise, type ExerciseInfo } from "@/lib/plan/catalog.ts";
import type { ExerciseVideo } from "@/lib/plan/videos.ts";
import { deleteExercise } from "@/app/actions";
import MuscleMap, { MuscleChips } from "./MuscleMap";
import { compareSession, sessions, suggestWeight, toUnit, type Change, type Session } from "@/lib/plan/progress.ts";
import type { SetRow, Unit } from "@/lib/types";
import { useDates } from "./DateLabels";
import { LineChart } from "./charts";
import { useOpenVideo } from "./VideoModal";

/* ---------- shared state: every logged set, saved optimistically ---------- */
export interface SaveOpts {
  /** The plan day these sets are for, when done early */
  planDate?: string | null;
}

interface SetsCtx {
  sets: SetRow[];
  unit: Unit;
  today: string;
  /** Cutback weeks don't count toward weight comparisons */
  isLightDate: (date: string) => boolean;
  save: (row: Omit<SetRow, "id" | "weight_kg" | "plan_date">, dayTitle: string, opts?: SaveOpts) => void;
  remove: (date: string, key: string, setNo: number) => void;
  openHistory: (key: string, focusDate?: string) => void;
  /** Built-in and custom exercises, from the exercises table */
  exercises: ExerciseInfo[];
  info: (key: string) => ExerciseInfo | undefined;
  /** An exercise's name, even after a custom one was deleted */
  nameOf: (key: string) => string;
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
/** The plan day a set counts toward: the day it was done for, or the day it was done */
export const planDayOf = (s: Pick<SetRow, "date" | "plan_date">) => s.plan_date ?? s.date;

/** "goblet-squat-8cd36a" → "Goblet squat", for history rows whose custom exercise was deleted */
export const keyLabel = (key: string) => {
  const words = key.replace(/-[0-9a-f]{6}$/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Rest after a set: longer for heavy compound lifts */
const restFor = (e: Exercise) => (e.load !== "weight" ? 60 : /deadlift|squat|press|row|pulldown|step-up/i.test(e.name) ? 120 : 90);

const rowFromInput = (i: SetInput, unit: Unit): SetRow => ({
  id: `tmp-${i.date}-${i.exerciseKey}-${i.setNo}`,
  date: i.date,
  exercise_key: i.exerciseKey,
  set_no: i.setNo,
  weight: i.weight,
  unit: i.unit ?? unit,
  weight_kg: toKg(i.weight, i.unit ?? unit),
  reps: i.reps,
  duration_sec: i.durationSec,
  light_week: i.light,
  plan_date: i.planDate && i.planDate !== i.date ? i.planDate : null,
});

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
  const { send, notify, onRejected, queue, rest } = useDock();
  const [sets, setSets] = useState(initial);
  const setsRef = useRef(sets);
  setsRef.current = sets;
  const [history, setHistory] = useState<{ key: string; focus?: string } | null>(null);
  // Local saves and deletes, kept on top of server data until a refresh shows them (or, offline, until they sync).
  // A refresh triggered by an earlier set can arrive after later sets were saved, so "action finished" isn't enough.
  const pending = useRef(new Map<string, SetRow | null>());
  const initialRef = useRef(initial);
  const [version, setVersion] = useState(0);

  // Writes still waiting from an earlier visit show as done straight away
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    for (const op of queue) {
      if (op.t === "set") pending.current.set(id(op.input.date, op.input.exerciseKey, op.input.setNo), rowFromInput(op.input, unit));
      if (op.t === "unset") pending.current.set(id(op.date, op.key, op.setNo), null);
    }
  }

  useEffect(() => {
    initialRef.current = initial;
    const byId = new Map(initial.map((s) => [id(s.date, s.exercise_key, s.set_no), s]));
    for (const [k, row] of pending.current) {
      const server = byId.get(k);
      const agrees = row ? !!server && Number(server.weight ?? -1) === (row.weight ?? -1) && server.reps === row.reps && server.duration_sec === row.duration_sec : !server;
      if (agrees) pending.current.delete(k);
    }
    const out = initial.filter((s) => !pending.current.has(id(s.date, s.exercise_key, s.set_no)));
    for (const row of pending.current.values()) if (row) out.unshift(row);
    setSets(out);
  }, [initial, version]);

  // A queued write the server refused once back online: drop its local copy and show the server's
  useEffect(
    () =>
      onRejected((op) => {
        if (op.t === "set") pending.current.delete(id(op.input.date, op.input.exerciseKey, op.input.setNo));
        if (op.t === "unset") pending.current.delete(id(op.date, op.key, op.setNo));
        setVersion((v) => v + 1);
      }),
    [onRejected],
  );

  /** Undo one optimistic change: put back what was there, touching no other row */
  const revert = useCallback((k: string, prev: SetRow | undefined, date: string, key: string, setNo: number) => {
    pending.current.delete(k);
    setSets((cur) => {
      const rest = cur.filter((s) => !same(s, date, key, setNo));
      return prev ? [prev, ...rest] : rest;
    });
  }, []);

  const isLightDate = useCallback(
    (date: string) => {
      const w = weekForDate(weeks, date);
      return !!w?.cutback;
    },
    [weeks],
  );

  const byKey = useMemo(() => new Map(exercises.map((e) => [e.key, e])), [exercises]);
  const info = useCallback((key: string) => byKey.get(key), [byKey]);
  const nameOf = useCallback((key: string) => byKey.get(key)?.name ?? keyLabel(key), [byKey]);

  const queuedOnce = useRef(false);
  const afterSend = useCallback(
    (r: SendResult, undo: () => void) => {
      if (r === "queued") {
        if (!queuedOnce.current || !queue.length) notify("No signal. Saved on this phone; it syncs when you're back online.");
        queuedOnce.current = true;
      } else if (r !== "sent") {
        undo();
        notify({ text: r.error, tone: "error" });
      }
    },
    [notify, queue.length],
  );

  const save = useCallback<SetsCtx["save"]>(
    (row, dayTitle, opts = {}) => {
      const cur = setsRef.current;
      const input: SetInput = {
        date: row.date,
        exerciseKey: row.exercise_key,
        setNo: row.set_no,
        weight: row.weight,
        unit: row.unit,
        reps: row.reps,
        durationSec: row.duration_sec,
        light: row.light_week,
        dayTitle,
        planDate: opts.planDate ?? null,
        firstOfDay: !cur.some((s) => s.date === row.date),
      };
      const optimistic = rowFromInput(input, unit);
      const k = id(row.date, row.exercise_key, row.set_no);
      const prev = cur.find((s) => same(s, row.date, row.exercise_key, row.set_no));
      pending.current.set(k, optimistic);
      setSets((c) => [optimistic, ...c.filter((s) => !same(s, row.date, row.exercise_key, row.set_no))]);
      const ex = byKey.get(row.exercise_key);
      // A new heaviest set gets a cheer, once per exercise per day
      if (row.weight != null && optimistic.weight_kg != null && !prev) {
        const before = cur.filter((s) => s.exercise_key === row.exercise_key && s.date < row.date && s.weight_kg != null).map((s) => Number(s.weight_kg));
        const sameDay = cur.some((s) => s.exercise_key === row.exercise_key && s.date === row.date && Number(s.weight_kg) >= optimistic.weight_kg!);
        if (before.length && !sameDay && optimistic.weight_kg > Math.max(...before) + 0.25) notify({ text: `New best: ${ex?.name ?? keyLabel(row.exercise_key)} ${row.weight} ${row.unit}`, tone: "good" });
      }
      if (ex && !prev) rest.start(restFor(asExercise(ex)), `${ex.name} set ${row.set_no}`);
      void send({ id: crypto.randomUUID(), t: "set", input }).then((r) => afterSend(r, () => revert(k, prev, row.date, row.exercise_key, row.set_no)));
    },
    [afterSend, byKey, notify, rest, revert, send, unit],
  );

  const remove = useCallback<SetsCtx["remove"]>(
    (date, key, setNo) => {
      const k = id(date, key, setNo);
      const prev = setsRef.current.find((s) => same(s, date, key, setNo));
      pending.current.set(k, null);
      setSets((cur) => cur.filter((s) => !same(s, date, key, setNo)));
      rest.stop();
      void send({ id: crypto.randomUUID(), t: "unset", date, key, setNo }).then((r) => {
        afterSend(r, () => revert(k, prev, date, key, setNo));
        // One stray tap shouldn't cost a set
        if (r !== "sent" && r !== "queued") return;
        if (prev)
          notify({
            text: `Set ${setNo} removed.`,
            action: {
              label: "Undo",
              run: () =>
                save(
                  { date, exercise_key: key, set_no: setNo, weight: prev.weight, unit: prev.unit, reps: prev.reps, duration_sec: prev.duration_sec, light_week: prev.light_week },
                  "",
                  { planDate: prev.plan_date },
                ),
            },
          });
      });
    },
    [afterSend, notify, rest, revert, save, send],
  );

  const openHistory = useCallback((key: string, focus?: string) => setHistory({ key, focus }), []);

  const value = useMemo(
    () => ({ sets, unit, today, isLightDate, save, remove, openHistory, exercises, info, nameOf, weeks }),
    [sets, unit, today, isLightDate, save, remove, openHistory, exercises, info, nameOf, weeks],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
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
  /** The plan day this row belongs to; sets done early for it count here, not on the day they were done */
  planDate: string;
  light: boolean;
  dayTitle: string;
  open: boolean;
  onToggle: () => void;
  /** Called once when the last planned set is ticked */
  onComplete: () => void;
}

export function ExerciseRow({ anchorId, line, logDate: planLogDate, planDate, light, dayTitle, open, onToggle, onComplete }: RowProps) {
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
  const done = logDate ? sets.filter((s) => planDayOf(s) === planDate && s.exercise_key === exercise.key).sort((a, b) => a.set_no - b.set_no) : [];
  const complete = done.length >= sized.sets;
  // The weight warning stays visible after the row closes
  const change = logDate && complete && !open && exercise.load === "weight" ? compareSession(sessions(sets, exercise.key), done[0].date) : null;
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
        <SetTable exercise={exercise} target={sized} date={logDate} planDate={planDate} light={light} dayTitle={dayTitle} done={done} onCollapse={onToggle} onComplete={onComplete} />
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
  planDate = date,
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
  planDate?: string;
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
  const lightSession = light || isLightDate(planDate);
  // Every set hit the top of the range last time: the grey numbers move up a step
  const suggested = lightSession || exercise.load !== "weight" ? null : suggestWeight(all.find((s) => s.date < date && !s.light), target, unit);
  const [extra, setExtra] = useState(0);
  const rowCount = Math.max(target.sets, done.length ? done[done.length - 1].set_no : 0) + extra;
  const change = done.length >= Math.min(target.sets, prev?.sets.length ?? target.sets) ? compareSession(all, done[0]?.date ?? date) : null;

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
        <button type="button" onClick={() => openHistory(exercise.key, prev.date)} className="flex min-h-11 items-center text-left text-xs text-muted">
          <span>
            Last ({dates.day(prev.date)}): <span className="font-mono">{prev.sets.map((x) => fmtSet(x, unit)).join(", ")}</span>
          </span>
        </button>
      )}
      {suggested != null && !done.length && (
        <p className="text-xs font-semibold text-good">
          Every rep last time. Try {Number(suggested.toFixed(2))} {unit}.
        </p>
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
          suggested={suggested}
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
              { planDate },
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
        {target.each && <span className="text-xs text-muted">Log one side&apos;s reps</span>}
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
  suggested,
  target,
  onSave,
  onRemove,
}: {
  cols: string;
  exercise: Exercise;
  setNo: number;
  logged: SetRow | undefined;
  last: SetRow | undefined;
  suggested: number | null;
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
  const weightRef = useRef<HTMLInputElement>(null);
  const { notify } = useDock();
  // Follow the saved numbers when they change (a sync, an undo), but never wipe what's being typed after a failed save
  const seen = useRef({ loggedWeight, loggedCount });
  useEffect(() => {
    if (seen.current.loggedWeight === loggedWeight && seen.current.loggedCount === loggedCount) return;
    const wasLogged = seen.current.loggedCount !== "";
    seen.current = { loggedWeight, loggedCount };
    if (loggedCount === "" && wasLogged) return; // unticked or reverted: keep the typed numbers
    setW(loggedWeight);
    setR(loggedCount);
  }, [loggedWeight, loggedCount]);

  // Grey placeholders: the suggested step up, else last session's numbers, else the plan's target
  const phW = suggested != null ? String(Number(suggested.toFixed(2))) : last?.weight_kg ? fmtWeight(Number(last.weight_kg), unit) : "";
  const phR = String((timed ? last?.duration_sec ?? target.sec : last?.reps ?? target.reps) ?? "");
  const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const commit = () => {
    const weight = parse(w || phW);
    const count = parse(r || phR);
    if (weight != null && (Number.isNaN(weight) || weight < 0 || weight > 2000)) {
      notify({ text: "Weight should be a number, like 42.5.", tone: "error" });
      weightRef.current?.focus();
      return;
    }
    if (count == null || Number.isNaN(count)) {
      countRef.current?.focus();
      return;
    }
    onSave(weight, Math.round(count));
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
          ref={weightRef}
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
      <button type="button" className="min-h-11 self-start font-semibold text-accent-ink underline underline-offset-2" onClick={() => openHistory(exerciseKey, change.previous.date)}>
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
            done={sets.filter((s) => planDayOf(s) === today && s.exercise_key === ex.key).sort((a, b) => a.set_no - b.set_no)}
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
    repsMax: null,
    sec: ex.load === "time" ? top?.duration_sec ?? 30 : null,
    each: false,
  };
}
