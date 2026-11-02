"use client";

// Countdown for timed exercises (plank, side plank, wall sit, dead hang…). Set the length, tap Start; at zero it
// fills the next set's seconds and ticks it, like a manual entry. Stopping early fills what was held without ticking.
// "Each side" holds run both sides with a short switch between, and log one side's time.

import { useCallback, useEffect, useRef, useState } from "react";
import { heldSeconds, holdPhases, SWITCH_SEC, type HoldPhase } from "@/lib/plan/workout.ts";

const storeKey = (key: string) => `wf-hold:${key}`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type WakeLock = { release: () => Promise<void> };

export default function HoldTimer({
  exerciseKey,
  defaultSec,
  each,
  setNo,
  onDone,
}: {
  exerciseKey: string;
  defaultSec: number;
  each: boolean;
  /** The set it fills */
  setNo: number;
  /** `finished`: ran to zero (log the set); otherwise stopped early (just fill the field) */
  onDone: (sec: number, finished: boolean) => void;
}) {
  const [len, setLen] = useState(defaultSec);
  // The last length chosen for this exercise, on this phone
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(storeKey(exerciseKey)));
      if (v >= 5 && v <= 3600) setLen(v);
    } catch {}
  }, [exerciseKey]);
  const remember = (v: number) => {
    try {
      localStorage.setItem(storeKey(exerciseKey), String(v));
    } catch {}
  };
  const change = (d: number) =>
    setLen((cur) => {
      const v = Math.min(600, Math.max(5, cur + d));
      remember(v);
      return v;
    });

  const [run, setRun] = useState<{ phases: HoldPhase[]; index: number; phaseEnd: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef<WakeLock | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const release = () => {
    void lock.current?.release().catch(() => {});
    lock.current = null;
  };
  useEffect(() => release, []);

  const start = () => {
    remember(len);
    const phases = holdPhases(len, each);
    setNow(Date.now());
    setRun({ phases, index: 0, phaseEnd: Date.now() + phases[0].sec * 1000 });
    // Keep the screen on while holding, like the rest timer
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
    if (wl && !lock.current) wl.request("screen").then((l) => (lock.current = l)).catch(() => {});
  };

  const finish = useCallback((sec: number, finished: boolean) => {
    setRun(null);
    release();
    if (sec > 0) doneRef.current(sec, finished);
  }, []);

  const stop = () => {
    if (!run) return;
    const p = run.phases[run.index];
    finish(heldSeconds(run.phases, run.index, p.sec - Math.max(0, (run.phaseEnd - Date.now()) / 1000)), false);
  };

  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [run]);

  // Next phase, or done, when a phase runs out
  useEffect(() => {
    if (!run || now < run.phaseEnd) return;
    const next = run.index + 1;
    if (next < run.phases.length) {
      // TODO(audio): chime() — switch sides
      setRun({ ...run, index: next, phaseEnd: run.phaseEnd + run.phases[next].sec * 1000 });
    } else {
      // TODO(audio): chime() — hold finished
      finish(heldSeconds(run.phases, run.index, run.phases[run.index].sec), true);
    }
  }, [now, run, finish]);

  if (run) {
    const p = run.phases[run.index];
    const left = Math.max(0, Math.ceil((run.phaseEnd - now) / 1000));
    return (
      <div role="timer" aria-live="off" className={`flex items-center gap-2 rounded-lg border px-3 py-1 ${p.hold ? "border-ink" : "border-warn bg-warn/10"}`}>
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-bold leading-none tabular-nums">{fmt(left)}</div>
          <div className="truncate text-xs text-muted">
            Set {setNo} · {p.label}
          </div>
        </div>
        <button type="button" className="btn-ghost px-3" onClick={stop}>
          Stop
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className="btn-ghost min-w-11 px-2.5" onClick={() => change(-5)} aria-label="5 seconds less">
        −5
      </button>
      <span className="min-w-[3.25rem] text-center font-mono text-base tabular-nums" aria-label={`Timer ${len} seconds${each ? " each side" : ""}`}>
        {fmt(len)}
      </span>
      <button type="button" className="btn-ghost min-w-11 px-2.5" onClick={() => change(5)} aria-label="5 seconds more">
        +5
      </button>
      <button type="button" className="btn-ghost px-3" onClick={start}>
        ▶ Start set {setNo}
      </button>
      {each && <span className="text-xs text-muted">Both sides, {SWITCH_SEC}s to switch</span>}
    </div>
  );
}
