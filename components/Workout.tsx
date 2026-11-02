"use client";

// Workout sessions on a plan day: Start / End, the elapsed time, the 4-hour auto-end and the 12-hour edit lock
// (rules in lib/plan/workout.ts), and the celebration when a day's workout is finished.
// Writes go through the Dock outbox, so Start and End work with no signal and replay in order before later sets.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useDock } from "./Dock";
import { elapsed, sessionState, type Completion, type WorkoutSession } from "@/lib/plan/workout.ts";
import Confetti from "./Confetti";

interface WorkoutCtx {
  /** The session stored under this plan date (the plan's own date: `sessionDate(day)`) */
  get: (planDate: string) => WorkoutSession | undefined;
  start: (planDate: string) => void;
  /** Starts it unless it's already started (logging a set does this) */
  ensureStarted: (planDate: string) => void;
  end: (planDate: string) => void;
  /** Confetti for a finished day; "beyond" is the bigger one. Once per day and level. */
  celebrate: (planDate: string, c: Completion) => void;
}

const Ctx = createContext<WorkoutCtx | null>(null);
export const useWorkout = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorkout outside WorkoutProvider");
  return c;
};

export function WorkoutProvider({ initial, children }: { initial: WorkoutSession[]; children: React.ReactNode }) {
  const { send, notify, onRejected, queue } = useDock();
  // Starts and ends made here, kept on top of the server's rows until it shows them back
  const [local, setLocal] = useState<Map<string, WorkoutSession>>(() => new Map());

  const sessions = useMemo(() => {
    const m = new Map(initial.map((s) => [s.plan_date, s]));
    // Taps still waiting in the outbox from an earlier visit
    for (const op of queue) {
      if (op.t === "workout-start" && !m.has(op.planDate)) m.set(op.planDate, { plan_date: op.planDate, started_at: op.at, ended_at: null, auto_ended: false });
      if (op.t === "workout-end") {
        const s = m.get(op.planDate);
        if (s && !s.ended_at) m.set(op.planDate, { ...s, ended_at: op.at, auto_ended: op.auto });
      }
    }
    for (const [k, s] of local) {
      const server = m.get(k);
      // The first start and the first end win, like on the server
      if (!server) m.set(k, s);
      else if (!server.ended_at && s.ended_at) m.set(k, { ...server, ended_at: s.ended_at, auto_ended: s.auto_ended });
    }
    return m;
  }, [initial, queue, local]);
  const ref = useRef(sessions);
  ref.current = sessions;

  // Once the server agrees, its row takes over
  useEffect(() => {
    setLocal((cur) => {
      if (!cur.size) return cur;
      const server = new Map(initial.map((s) => [s.plan_date, s]));
      const next = new Map([...cur].filter(([k, s]) => !server.has(k) || (s.ended_at != null && server.get(k)!.ended_at == null)));
      return next.size === cur.size ? cur : next;
    });
  }, [initial]);
  useEffect(
    () =>
      onRejected((op) => {
        if (op.t === "workout-start" || op.t === "workout-end") setLocal((cur) => new Map([...cur].filter(([k]) => k !== op.planDate)));
      }),
    [onRejected],
  );

  const write = useCallback(
    (op: Parameters<typeof send>[0], undo: () => void) =>
      void send(op).then((r) => {
        if (r !== "sent" && r !== "queued") {
          undo();
          notify({ text: r.error, tone: "error" });
        }
      }),
    [notify, send],
  );

  const start = useCallback(
    (planDate: string) => {
      if (ref.current.has(planDate)) return;
      const at = new Date().toISOString();
      setLocal((cur) => new Map(cur).set(planDate, { plan_date: planDate, started_at: at, ended_at: null, auto_ended: false }));
      // TODO(push): schedule "Workout auto-ended" for { planDate, startedAt: at } due at Date.parse(at) + AUTO_END_MS
      // (lib/plan/workout.ts); cancelled by end() below. Tag it by planDate so a second start can't double it.
      write({ id: crypto.randomUUID(), t: "workout-start", planDate, at }, () => setLocal((cur) => new Map([...cur].filter(([k]) => k !== planDate))));
    },
    [write],
  );

  const endAt = useCallback(
    (planDate: string, at: string, auto: boolean) => {
      const s = ref.current.get(planDate);
      if (!s || s.ended_at) return;
      setLocal((cur) => new Map(cur).set(planDate, { ...s, ended_at: at, auto_ended: auto }));
      write({ id: crypto.randomUUID(), t: "workout-end", planDate, at, auto }, () => setLocal((cur) => new Map([...cur].filter(([k]) => k !== planDate))));
    },
    [write],
  );
  const end = useCallback(
    (planDate: string) => {
      // TODO(push): cancel the "Workout auto-ended" notification scheduled for planDate in start()
      endAt(planDate, new Date().toISOString(), false);
    },
    [endAt],
  );

  // A workout left open past 4 hours ended then: save it that way whenever it's seen, now or while the app stays open
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const s of ref.current.values()) {
        const st = sessionState(s, now);
        if (st.needsAutoEnd) endAt(s.plan_date, new Date(st.endedAt!).toISOString(), true);
      }
    };
    check();
    const t = setInterval(check, 60e3);
    return () => clearInterval(t);
  }, [sessions, endAt]);

  const [burst, setBurst] = useState<{ id: number; big: boolean } | null>(null);
  const celebrated = useRef(new Map<string, "complete" | "beyond">());
  const celebrate = useCallback(
    (planDate: string, c: Completion) => {
      if (c.status !== "complete" && c.status !== "beyond") return;
      const before = celebrated.current.get(planDate);
      if (before === "beyond" || before === c.status) return;
      celebrated.current.set(planDate, c.status);
      const big = c.status === "beyond";
      setBurst({ id: Date.now(), big });
      // TODO(audio): celebrate()
      notify({
        text: big
          ? `You went the extra mile: ${c.extraSets} more set${c.extraSets === 1 ? "" : "s"} than planned${c.extraExercises ? `, ${c.extraExercises} extra exercise${c.extraExercises === 1 ? "" : "s"}` : ""}. You pushed harder today.`
          : "Every set done. Workout complete!",
        tone: "good",
      });
    },
    [notify],
  );

  const value = useMemo<WorkoutCtx>(
    () => ({ get: (d) => sessions.get(d), start, ensureStarted: start, end, celebrate }),
    [sessions, start, end, celebrate],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {burst && <Confetti key={burst.id} big={burst.big} onDone={() => setBurst(null)} />}
    </Ctx.Provider>
  );
}

/** Start / End and the elapsed time for one day's workout; read-only notice once its sets are locked. */
export function WorkoutBar({ planDate, canStart, completion }: { planDate: string; canStart: boolean; completion: Completion }) {
  const { get, start, end, celebrate } = useWorkout();
  const s = get(planDate);
  const [now, setNow] = useState(() => Date.now());
  const st = s ? sessionState(s, now) : null;
  const active = !!st?.active;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!st) {
    if (!canStart) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={() => start(planDate)}>
          Start workout
        </button>
        <span className="text-xs text-muted">Or just tick a set.</span>
      </div>
    );
  }
  if (st.active)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5" role="timer" aria-live="off">
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-bold leading-none tabular-nums">{elapsed(now - st.startedAt)}</div>
          <div className="text-xs text-muted">
            Workout in progress · {completion.done}/{completion.planned} sets
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            end(planDate);
            // Finished or beyond: celebrate (once); anything missing: just marked done
            celebrate(planDate, completion);
          }}
        >
          End workout
        </button>
      </div>
    );
  const mins = Math.max(1, Math.round((st.endedAt! - st.startedAt) / 60e3));
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span>
        <b className="text-good">✓ Workout done</b> <span className="text-muted">· {mins} min{st.autoEnded ? " · ended automatically after 4 hours" : ""}</span>
      </span>
      {st.locked && <span className="text-xs text-muted">Locked: it ended over 12 hours ago, so these sets can&apos;t be changed.</span>}
    </div>
  );
}
