"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { deleteSet, upsertSet } from "@/app/actions";
import { weekForDate, type Week } from "@/lib/plan/generate.ts";
import { exerciseByKey, parseLine, type Exercise, type Target } from "@/lib/plan/exercises.ts";
import { compareSession, sessions, toUnit, type Change, type Session } from "@/lib/plan/progress.ts";
import type { SetRow, Unit } from "@/lib/types";
import { useDates } from "./DateLabels";
import { LineChart } from "./charts";

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

export function SetsProvider({ initial, unit, today, weeks, children }: { initial: SetRow[]; unit: Unit; today: string; weeks: Week[]; children: React.ReactNode }) {
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

  const value = useMemo(() => ({ sets, unit, today, isLightDate, save, remove, openHistory, error }), [sets, unit, today, isLightDate, save, remove, openHistory, error]);
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
      {history && <HistorySheet exerciseKey={history.key} focus={history.focus} onClose={() => setHistory(null)} />}
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

/* ---------- one exercise's set table ---------- */
export function ExerciseSets({ line, date: planDate, light, dayTitle, startOpen }: { line: string; date: string; light: boolean; dayTitle: string; startOpen: boolean }) {
  const parsed = parseLine(line);
  const { sets, today } = useSets();
  const [open, setOpen] = useState(startOpen);
  if (!parsed) return null;
  // A future day's workout done early is logged under today, so history stays in the order you lifted
  const early = planDate > today;
  const date = early ? today : planDate;
  const { exercise, target } = parsed;
  const done = sets.filter((s) => s.date === date && s.exercise_key === exercise.key).sort((a, b) => a.set_no - b.set_no);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-dashed border-line px-3 text-left text-sm">
        <SetSummary rows={done} />
        <span className="font-semibold text-accent-ink">{done.length ? "Edit" : early ? "Log today" : "Log sets"}</span>
      </button>
    );
  return (
    <>
      {early && <p className="mt-1 text-xs text-muted">Doing this early: sets save under today.</p>}
      <SetTable exercise={exercise} target={light ? { ...target, sets: Math.min(target.sets, 2) } : target} date={date} light={light} dayTitle={dayTitle} done={done} />
    </>
  );
}

function SetSummary({ rows }: { rows: SetRow[] }) {
  const { unit } = useSets();
  if (!rows.length) return <span className="text-muted">Not logged</span>;
  return (
    <span className="font-mono text-[0.85rem]">
      <span className="text-good">✓ </span>
      {rows.map((r) => fmtSet(r, unit)).join(", ")}
    </span>
  );
}

function SetTable({ exercise, target, date, light, dayTitle, done }: { exercise: Exercise; target: Target; date: string; light: boolean; dayTitle: string; done: SetRow[] }) {
  const { sets, unit, isLightDate, save, remove, openHistory } = useSets();
  const all = useMemo(() => sessions(sets, exercise.key), [sets, exercise.key]);
  const prev = all.find((s) => s.date < date);
  const lightSession = light || isLightDate(date);
  const [extra, setExtra] = useState(0);
  const rowCount = Math.max(target.sets, done.length ? done[done.length - 1].set_no : 0) + extra;
  const change = done.length >= Math.min(target.sets, prev?.sets.length ?? target.sets) ? compareSession(all, date) : null;

  const cols =
    exercise.load === "weight" ? "grid-cols-[1.25rem_minmax(0,1fr)_4.25rem_3.5rem_2.75rem]" : "grid-cols-[1.25rem_minmax(0,1fr)_4.25rem_2.75rem]";

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className={`grid ${cols} items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted`}>
        <span>#</span>
        <span>Last</span>
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
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => setExtra((x) => x + 1)}>
          + Set
        </button>
        <button type="button" className="btn-ghost" onClick={() => openHistory(exercise.key)}>
          History
        </button>
        {target.each && <span className="text-xs text-muted">Log one side</span>}
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
      <span className="truncate font-mono text-[0.8rem] text-muted">{last ? fmtSet(last, unit) : "—"}</span>
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

/* ---------- per-exercise history sheet ---------- */
function HistorySheet({ exerciseKey, focus, onClose }: { exerciseKey: string; focus?: string; onClose: () => void }) {
  const { sets, unit } = useSets();
  const dates = useDates();
  const ex = exerciseByKey(exerciseKey);
  const all = useMemo(() => sessions(sets, exerciseKey), [sets, exerciseKey]);
  const focusRef = useRef<HTMLLIElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
        aria-label={`${ex.name} history`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[720px] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="label">History</div>
            <h3 className="font-display text-2xl font-bold">{ex.name}</h3>
          </div>
          <button ref={closeRef} className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
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
