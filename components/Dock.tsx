"use client";

// Everything pinned to the bottom of the screen: the offline outbox, short notices, and the rest timer (RestTimer.tsx).
// The outbox keeps writes made without signal on this phone (per person) and sends them in order once
// the connection is back, so a basement gym never loses a set or a run.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addLog, deleteSet, setSwap, upsertSet, type ActionResult, type LogInput, type SetInput } from "@/app/actions";
import { RestTimerView } from "./RestTimer";

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

const read = (key: string): Op[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export function DockProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const router = useRouter();
  const storageKey = `sub30-outbox:${userId}`;
  const [queue, setQueue] = useState<Op[]>([]);
  const queueRef = useRef<Op[]>([]);
  const flushing = useRef(false);
  const rejected = useRef(new Set<(op: Op, error: string) => void>());
  const [notice, setNotice] = useState<Notice | null>(null);

  const save = useCallback(
    (q: Op[]) => {
      queueRef.current = q;
      setQueue(q);
      try {
        if (q.length) localStorage.setItem(storageKey, JSON.stringify(q));
        else localStorage.removeItem(storageKey);
      } catch {
        // Private mode or full storage: the queue still works until the app closes
      }
    },
    [storageKey],
  );

  const notify = useCallback((n: Notice | string) => setNotice(typeof n === "string" ? { text: n } : n), []);
  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const t = setTimeout(() => setNotice((cur) => (cur === notice ? null : cur)), notice.action ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const flush = useCallback(async () => {
    if (flushing.current || !queueRef.current.length) return;
    flushing.current = true;
    let sent = 0;
    try {
      while (queueRef.current.length) {
        const op = queueRef.current[0];
        let r: ActionResult;
        try {
          r = await run(op);
        } catch {
          break; // still offline: try again later
        }
        save(queueRef.current.slice(1));
        if (r.ok) sent++;
        else {
          for (const fn of rejected.current) fn(op, r.error);
          notify({ text: r.error, tone: "error" });
        }
      }
    } finally {
      flushing.current = false;
    }
    if (sent) {
      if (!queueRef.current.length) notify({ text: `Back online: ${sent} saved.`, tone: "good" });
      router.refresh();
    }
  }, [notify, router, save]);

  // Pick up anything left from an earlier visit, then retry whenever the connection might be back
  useEffect(() => {
    save(read(storageKey));
    void flush();
    const retry = () => document.visibilityState === "visible" && void flush();
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    const t = setInterval(retry, 20000);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
      clearInterval(t);
    };
  }, [storageKey, save, flush]);

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

  const value = useMemo(() => ({ queue, send, onRejected, notify }), [queue, send, onRejected, notify]);

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
        {queue.length > 0 && (
          <button
            type="button"
            onClick={() => void flush()}
            className="pointer-events-auto flex min-h-11 items-center justify-center gap-2 self-center rounded-full border border-warn bg-surface px-4 text-sm font-semibold shadow-lg"
          >
            <span aria-hidden>⟳</span> {queue.length} waiting to sync · Retry
          </button>
        )}
        <RestTimerView />
      </div>
    </Ctx.Provider>
  );
}
