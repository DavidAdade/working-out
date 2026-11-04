"use client";

// Workout sessions on a plan day: Start / End, the elapsed time, the 4-hour auto-end and the 12-hour edit lock
// (rules in lib/plan/workout.ts), and the celebration when a day's workout is finished.
// Writes go through the Dock outbox, so Start and End work with no signal and replay in order before later sets.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fanfare, prime } from "@/lib/audio";
import { useDock } from "./Dock";
import { elapsed, sessionState, type Completion, type WorkoutSession } from "@/lib/plan/workout.ts";
import Confetti from "./Confetti";

interface WorkoutCtx {
  /** The session stored under this plan date (the plan's own date: `sessionDate(day)`) */
  get: (planDate: string) => WorkoutSession | undefined;
  start: (planDate: string) => void;
  /** Starts it unless it's already started (logging a set does this) */
  ensureStarted: (planDate: string) => void;
  /** Ends it; with the day's completion, also cheers (a finished day) or sums up what was done */
  end: (planDate: string, c?: Completion) => void;
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
  /** Confetti and the fanfare, once per day and level; the message shows either way */
  const cheer = useCallback(
    (planDate: string, c: Completion, text: string) => {
      if (c.status !== "complete" && c.status !== "beyond") return;
      const before = celebrated.current.get(planDate);
      if (before !== "beyond" && before !== c.status) {
        celebrated.current.set(planDate, c.status);
        setBurst({ id: Date.now(), big: c.status === "beyond" });
        fanfare();
      }
      notify({ text, tone: "good" });
    },
    [notify],
  );
  const celebrate = useCallback(
    (planDate: string, c: Completion) => {
      const before = celebrated.current.get(planDate);
      if (before === "beyond" || before === c.status) return;
      cheer(planDate, c, c.status === "beyond" ? extraMile(c) : "Every set done. Workout complete!");
    },
    [cheer],
  );

  const end = useCallback(
    (planDate: string, c?: Completion) => {
      // On the tap, so the celebration sound can play over music
      prime();
      const s = ref.current.get(planDate);
      endAt(planDate, new Date().toISOString(), false);
      if (!c || !s || s.ended_at) return;
      const mins = Math.max(1, Math.round((Date.now() - Date.parse(s.started_at)) / 60e3));
      if (c.status === "complete" || c.status === "beyond") cheer(planDate, c, c.status === "beyond" ? extraMile(c) : finished(c, mins));
      else if (c.done) notify({ text: `Workout saved: ${c.done} of ${c.planned} sets in ${mins} min. Every session counts.`, tone: "good" });
    },
    [cheer, endAt, notify],
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

const extraMile = (c: Completion) =>
  `You went the extra mile: ${c.extraSets} more set${c.extraSets === 1 ? "" : "s"} than planned${c.extraExercises ? `, ${c.extraExercises} extra exercise${c.extraExercises === 1 ? "" : "s"}` : ""}. You pushed harder today.`;

/** Said on End when every planned set is in */
const finished = (c: Completion, mins: number) => {
  const lines = [
    `All ${c.planned} sets in ${mins} min. That's how it's done.`,
    `Every set, start to finish. Showing up like this is what makes the difference.`,
    `${c.planned} for ${c.planned}. Rest up, you earned it.`,
    `Workout complete in ${mins} min. Future you says thanks.`,
    `Nothing skipped, nothing left. Great session.`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
};

/** Sets done as a ring that fills, with the count inside; turns green with a tick when every set is in */
function ProgressRing({ done, planned }: { done: number; planned: number }) {
  const r = 19;
  const c = 2 * Math.PI * r;
  const p = planned ? Math.min(1, done / planned) : 0;
  const full = planned > 0 && done >= planned;
  return (
    <div className="relative h-11 w-11 flex-none" role="img" aria-label={`${done} of ${planned} sets done`}>
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-line" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className={`transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none ${full ? "stroke-good" : "stroke-accent"}`}
        />
      </svg>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center font-mono text-[0.68rem] font-semibold leading-none tabular-nums">
        {full ? <span className="text-base text-good">✓</span> : `${done}/${planned}`}
      </span>
    </div>
  );
}

/** Start / End and the elapsed time for one day's workout; read-only notice once its sets are locked. */
export function WorkoutBar({ planDate, canStart, completion }: { planDate: string; canStart: boolean; completion: Completion }) {
  const { get, start, end } = useWorkout();
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
      <div className="flex items-center gap-2.5 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5" role="timer" aria-live="off">
        <ProgressRing done={completion.done} planned={completion.planned} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-bold leading-none tabular-nums">{elapsed(now - st.startedAt)}</div>
          <div className="text-xs text-muted">Workout in progress</div>
        </div>
        <button
          type="button"
          className="btn"
          // Finished or beyond: a cheer (confetti once); anything missing: a short summary
          onClick={() => end(planDate, completion)}
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
