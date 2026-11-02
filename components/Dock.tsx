"use client";

// Everything pinned to the bottom of the screen: the offline outbox, short notices, and the rest timer.
// The outbox keeps writes made without signal on this phone (per person) and sends them in order once
// the connection is back, so a basement gym never loses a set or a run.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addLog, deleteSet, setSwap, upsertSet, type ActionResult, type LogInput, type SetInput } from "@/app/actions";
import SyncSheet, { type Refused, type SyncResult } from "./SyncSheet";

export type Op =
  | { id: string; t: "set"; input: SetInput }
  | { id: string; t: "unset"; date: string; key: string; setNo: number }
  | { id: string; t: "log"; input: LogInput }
  /** Swap the template exercise `from` on plan day `planDate` for `to`; null puts it back */
  | { id: string; t: "swap"; planDate: string; from: string; to: string | null };

export type SendResult = "sent" | "queued" | { error: string };

export interface Notice {
  text: string;
  tone?: "info" | "good" | "error";
  action?: { label: string; run: () => void };
}

interface DockCtx {
  /** Writes waiting for a connection, oldest first */
  queue: Op[];
  send: (op: Op) => Promise<SendResult>;
  /** Hear about queued writes the server later refused, so their optimistic rows can go */
  onRejected: (fn: (op: Op, error: string) => void) => () => void;
  notify: (n: Notice | string) => void;
  rest: { start: (sec: number, label: string) => void; stop: () => void; enabled: boolean };
}

const Ctx = createContext<DockCtx | null>(null);
export const useDock = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDock outside DockProvider");
  return c;
};

function run(op: Op): Promise<ActionResult> {
  if (op.t === "set") return upsertSet(op.input);
  if (op.t === "unset") return deleteSet(op.date, op.key, op.setNo);
  if (op.t === "swap") return setSwap(op.planDate, op.from, op.to);
  return addLog(op.input);
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v == null || Array.isArray(fallback) !== Array.isArray(v) ? fallback : v;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    if (v == null || (Array.isArray(v) && !v.length)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    // Private mode or full storage: the queue still works until the app closes
    return false;
  }
};
/** One sender at a time across open tabs, so two windows never replay the same write twice */
const exclusive = <T,>(name: string, fn: () => Promise<T>): Promise<T> => (navigator.locks ? (navigator.locks.request(name, fn) as Promise<T>) : fn());

/** Changes waiting this long, or after this many failed tries, get the "not synced" banner and sheet */
const STALE_MS = 2 * 60 * 1000;
const STALE_TRIES = 5;

export function DockProvider({
  userId,
  restTimer,
  refresh: refreshProp,
  children,
}: {
  userId: string;
  restTimer: boolean;
  /** Reloads server data once writes land (default: a router refresh) */
  refresh?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const refresh = useCallback(() => (refreshProp ? refreshProp() : router.refresh()), [refreshProp, router]);
  const storageKey = `sub30-outbox:${userId}`;
  const [queue, setQueue] = useState<Op[]>([]);
  const queueRef = useRef<Op[]>([]);
  const flushing = useRef<Promise<SyncResult> | null>(null);
  const rejected = useRef(new Set<(op: Op, error: string) => void>());
  const [notice, setNotice] = useState<Notice | null>(null);
  // When the oldest waiting change was made, failed tries in a row, and replayed writes the server refused
  const [since, setSince] = useState<number | null>(null);
  const [fails, setFails] = useState(0);
  const [refused, setRefused] = useState<Refused[]>([]);
  const [sheet, setSheet] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stored = useRef(true);

  const save = useCallback(
    (q: Op[]) => {
      queueRef.current = q;
      setQueue(q);
      stored.current = write(storageKey, q);
      setSince((cur) => {
        const next = q.length ? (cur ?? Date.now()) : null;
        write(`${storageKey}:since`, next);
        return next;
      });
      if (!q.length) setFails(0);
    },
    [storageKey],
  );
  const saveRefused = useCallback(
    (fn: (cur: Refused[]) => Refused[]) =>
      setRefused((cur) => {
        const next = fn(cur);
        write(`${storageKey}:refused`, next);
        return next;
      }),
    [storageKey],
  );

  const notify = useCallback((n: Notice | string) => setNotice(typeof n === "string" ? { text: n } : n), []);
  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const t = setTimeout(() => setNotice((cur) => (cur === notice ? null : cur)), notice.action ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [notice]);

  /** Sends what's waiting, oldest first. A call made while a run is going shares its result. */
  const flush = useCallback((): Promise<SyncResult> => {
    if (flushing.current) return flushing.current;
    if (!queueRef.current.length) return Promise.resolve({ sent: 0, refused: 0, left: 0 });
    const go = async (): Promise<SyncResult> => {
      let sent = 0;
      let refusedNow = 0;
      for (;;) {
        // Another tab may have sent some while this one waited for the lock: go by what's on the phone
        if (stored.current) {
          const q = read<Op[]>(storageKey, []);
          if (q.length !== queueRef.current.length || q[0]?.id !== queueRef.current[0]?.id) {
            queueRef.current = q;
            setQueue(q);
          }
        }
        if (!queueRef.current.length) break;
        const op = queueRef.current[0];
        let r: ActionResult;
        try {
          r = await run(op);
        } catch {
          setFails((f) => f + 1);
          break; // still offline: try again later
        }
        save(queueRef.current.slice(1));
        if (r.ok) sent++;
        else {
          // Kept until read, so a refused change is explained instead of quietly vanishing
          refusedNow++;
          saveRefused((cur) => [...cur, { op, error: r.error, at: Date.now() }]);
          for (const fn of rejected.current) fn(op, r.error);
        }
      }
      return { sent, refused: refusedNow, left: queueRef.current.length };
    };
    const p = exclusive(storageKey, go)
      .then((r) => {
        if (r.refused) setSheet(true);
        if (r.sent) {
          if (!r.left && !r.refused) notify({ text: `Back online: ${r.sent} saved.`, tone: "good" });
          refresh();
        }
        return r;
      })
      .finally(() => (flushing.current = null));
    flushing.current = p;
    return p;
  }, [notify, refresh, save, saveRefused, storageKey]);

  // Pick up anything left from an earlier visit (or changed in another tab), then retry whenever the connection might be back
  useEffect(() => {
    const load = () => {
      const q = read<Op[]>(storageKey, []);
      queueRef.current = q;
      setQueue(q);
      setSince(q.length ? (read<number | null>(`${storageKey}:since`, null) ?? Date.now()) : null);
      setRefused(read<Refused[]>(`${storageKey}:refused`, []));
    };
    load();
    void flush();
    const retry = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void flush();
    };
    const onStorage = (e: StorageEvent) => e.key?.startsWith(storageKey) && load();
    window.addEventListener("online", retry);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", retry);
    const t = setInterval(retry, 20000);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", retry);
      clearInterval(t);
    };
  }, [storageKey, flush]);

  const send = useCallback<DockCtx["send"]>(
    async (op) => {
      // Keep order: if older writes are waiting, this one waits behind them
      if (queueRef.current.length) {
        save([...queueRef.current, op]);
        void flush();
        return "queued";
      }
      try {
        const r = await run(op);
        return r.ok ? "sent" : { error: r.error };
      } catch {
        save([...queueRef.current, op]);
        return "queued";
      }
    },
    [flush, save],
  );

  const onRejected = useCallback<DockCtx["onRejected"]>((fn) => {
    rejected.current.add(fn);
    return () => void rejected.current.delete(fn);
  }, []);

  const rest = useRestTimer(restTimer);

  const value = useMemo(() => ({ queue, send, onRejected, notify, rest: rest.api }), [queue, send, onRejected, notify, rest.api]);

  // Out of sync: changes stuck on this phone for a while, or ones the server refused
  const stuck = refused.length > 0 || (queue.length > 0 && (fails >= STALE_TRIES || (since != null && now - since > STALE_MS)));
  const syncNow = useCallback(async () => {
    const r = await flush();
    // Then fresh data: what just landed, and the server's copy of anything refused
    if (!r.left && !r.sent) refresh();
    return r;
  }, [flush, refresh]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom,0px))] z-40 mx-auto flex max-w-[680px] flex-col gap-2">
        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-lg border bg-surface px-3.5 py-1.5 text-sm shadow-lg ${notice.tone === "error" ? "border-bad" : notice.tone === "good" ? "border-good" : "border-line"}`}
          >
            <span>{notice.text}</span>
            <span className="flex flex-none gap-1.5">
              {notice.action && (
                <button
                  className="btn-ghost"
                  onClick={() => {
                    notice.action!.run();
                    setNotice(null);
                  }}
                >
                  {notice.action.label}
                </button>
              )}
              <button className="btn-ghost" onClick={() => setNotice(null)}>
                OK
              </button>
            </span>
          </div>
        )}
        {stuck ? (
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="pointer-events-auto flex min-h-11 items-center justify-center gap-2 self-center rounded-full border border-bad bg-surface px-4 text-sm font-semibold shadow-lg"
          >
            <span aria-hidden>!</span> {queue.length ? `${queue.length} not synced · Sync now` : `${refused.length} not saved · See why`}
          </button>
        ) : (
          queue.length > 0 && (
            <button
              type="button"
              onClick={() => void flush()}
              className="pointer-events-auto flex min-h-11 items-center justify-center gap-2 self-center rounded-full border border-warn bg-surface px-4 text-sm font-semibold shadow-lg"
            >
              <span aria-hidden>⟳</span> {queue.length} waiting to sync · Retry
            </button>
          )
        )}
        {rest.view}
      </div>
      {sheet && <SyncSheet queue={queue} refused={refused} since={since} sync={syncNow} onDismissRefused={() => saveRefused(() => [])} onClose={() => setSheet(false)} />}
    </Ctx.Provider>
  );
}

/* ---------- rest timer: starts when a set is ticked ---------- */
function useRestTimer(enabled: boolean) {
  const [timer, setTimer] = useState<{ end: number; total: number; label: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const beeped = useRef(false);

  const release = () => {
    void lock.current?.release().catch(() => {});
    lock.current = null;
  };

  const start = useCallback(
    (sec: number, label: string) => {
      if (!enabled) return;
      beeped.current = false;
      setNow(Date.now());
      setTimer({ end: Date.now() + sec * 1000, total: sec, label });
      // Created on the tap, so iOS lets it play when the rest ends
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume();
      } catch {}
      // Keep the screen on while resting (iOS 18.4+ home-screen apps, most other browsers)
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wl && !lock.current) wl.request("screen").then((l) => (lock.current = l)).catch(() => {});
    },
    [enabled],
  );
  const stop = useCallback(() => {
    setTimer(null);
    release();
  }, []);

  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timer]);

  const left = timer ? Math.ceil((timer.end - now) / 1000) : 0;
  useEffect(() => {
    if (!timer || left > 0 || beeped.current) return;
    beeped.current = true;
    beep(audio.current);
    release();
    const t = setTimeout(() => setTimer((cur) => (cur === timer ? null : cur)), 8000);
    return () => clearTimeout(t);
  }, [left, timer]);

  const api = useMemo(() => ({ start, stop, enabled }), [start, stop, enabled]);
  const adjust = (d: number) => setTimer((cur) => (cur ? { ...cur, end: Math.max(Date.now() + 1000, cur.end + d * 1000) } : cur));

  const view = timer ? (
    <div
      role="timer"
      aria-live="off"
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 shadow-lg ${left <= 0 ? "border-good bg-good text-bg" : "border-ink bg-surface"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-display text-2xl font-bold leading-none tabular-nums">{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Go"}</div>
        <div className={`truncate text-xs ${left <= 0 ? "" : "text-muted"}`}>{left > 0 ? `Rest · ${timer.label}` : "Rest over. Next set."}</div>
      </div>
      {left > 0 && (
        <>
          <button type="button" className="btn-ghost px-2.5" onClick={() => adjust(-15)} aria-label="15 seconds less">
            −15
          </button>
          <button type="button" className="btn-ghost px-2.5" onClick={() => adjust(15)} aria-label="15 seconds more">
            +15
          </button>
        </>
      )}
      <button type="button" className={`btn-ghost px-2.5 ${left <= 0 ? "border-bg text-bg" : ""}`} onClick={stop}>
        {left > 0 ? "Skip" : "OK"}
      </button>
    </div>
  ) : null;

  return { api, view };
}

function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    for (const [at, f] of [[0, 880], [0.25, 880], [0.5, 1320]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.2, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.2);
    }
  } catch {}
}
