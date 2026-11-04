"use client";

// The rest timer: starts when a set is ticked, counts down at the bottom of every page, ticks for the last
// five seconds and chimes at the end (mixed with music, never instead of it: see lib/audio.ts).
// It lives in localStorage per person, so it carries on across pages and reloads. With "Notify me when
// rest is over" on, the server also sends a push at the end time, for when the app is in the background
// (iOS stops a home-screen app's timers there). The push is cancelled if the app is open to chime itself.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { chime, prime, release, tick } from "@/lib/audio";

interface Rest {
  /** Epoch ms */
  endsAt: number;
  total: number;
  label: string;
}

interface RestApi {
  /** `sec` is the exercise's own rest; the person's chosen length in Settings wins over it */
  start: (sec: number, label: string) => void;
  stop: () => void;
  enabled: boolean;
}

interface RestState {
  timer: Rest | null;
  adjust: (sec: number) => void;
  stop: () => void;
}

const ApiCtx = createContext<RestApi | null>(null);
const StateCtx = createContext<RestState | null>(null);

export const useRest = () => {
  const c = useContext(ApiCtx);
  if (!c) throw new Error("useRest outside RestTimerProvider");
  return c;
};

/** Where this phone remembers that rest pushes are on (subscriptions are per device) */
export const restPushKey = (userId: string) => `sub30-rest-push:${userId}`;

const read = (key: string): Rest | null => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && typeof v.endsAt === "number" && typeof v.total === "number" && typeof v.label === "string" ? v : null;
  } catch {
    return null;
  }
};

// Kept outside React so moving between pages doesn't drop it
type Lock = { release: () => Promise<void> };
let lock: Lock | null = null;
function keepAwake() {
  // Keep the screen on while resting (iOS 18.4+ home-screen apps, most other browsers)
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } }).wakeLock;
  if (wl && !lock) wl.request("screen").then((l) => (lock = l)).catch(() => {});
}
function letSleep() {
  void lock?.release().catch(() => {});
  lock = null;
}

/** How long a finished timer stays up as "Go" */
const SHOW_DONE_MS = 8000;
/** A rest that ran out while the app was in the background (or closed by iOS) stays up this long once you're back */
const SHOW_MISSED_MS = 60_000;
/** The app cancels the push this close to the end if it's open, and chimes instead */
const HANDOVER_MS = 2000;

export function RestTimerProvider({
  userId,
  enabled,
  seconds,
  push,
  children,
}: {
  userId: string;
  enabled: boolean;
  /** Chosen rest length; null = by exercise */
  seconds: number | null;
  /** Whether the server can send pushes (VAPID keys set) */
  push: boolean;
  children: React.ReactNode;
}) {
  const key = `sub30-rest:${userId}`;
  const [timer, setTimer] = useState<Rest | null>(null);
  const timerRef = useRef(timer);
  timerRef.current = timer;

  const save = useCallback(
    (t: Rest | null) => {
      timerRef.current = t;
      setTimer(t);
      try {
        if (t) localStorage.setItem(key, JSON.stringify(t));
        else localStorage.removeItem(key);
      } catch {}
    },
    [key],
  );

  const pushOn = useCallback(() => {
    try {
      return push && localStorage.getItem(restPushKey(userId)) === "1";
    } catch {
      return false;
    }
  }, [push, userId]);
  // Never throws: no signal just means no push
  const arm = useCallback(
    (t: Rest) => {
      if (pushOn())
        void fetch("/api/push/rest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endsAt: t.endsAt, label: t.label }), keepalive: true }).catch(() => {});
    },
    [pushOn],
  );
  const disarm = useCallback(() => {
    if (pushOn()) void fetch("/api/push/rest", { method: "DELETE", keepalive: true }).catch(() => {});
  }, [pushOn]);

  // A timer started on another page or before a reload carries on. It makes no sound here: that waits for a tap.
  // One that ran out while the app was away still shows, as "Rest over", so it doesn't just vanish.
  useEffect(() => {
    const t = read(key);
    if (t && t.endsAt > Date.now() - SHOW_MISSED_MS) setTimer(t);
    else if (t) save(null);
  }, [key, save]);

  const start = useCallback(
    (sec: number, label: string) => {
      if (!enabled) return;
      const total = seconds ?? sec;
      const t = { endsAt: Date.now() + total * 1000, total, label };
      save(t);
      // In the tap, so the end chime is allowed to play later
      prime(true);
      keepAwake();
      arm(t);
    },
    [enabled, seconds, save, arm],
  );

  const stop = useCallback(() => {
    // Unticking a set stops the timer too, often with none running
    if (!timerRef.current) return;
    save(null);
    release();
    letSleep();
    disarm();
  }, [save, disarm]);

  const adjust = useCallback(
    (d: number) => {
      if (!timer) return;
      const t = { ...timer, endsAt: Math.max(Date.now() + 1000, timer.endsAt + d * 1000) };
      save(t);
      prime(true);
      arm(t);
    },
    [timer, save, arm],
  );

  // Sounds and the push handover. Only while the app is on screen and this loop has been running: coming
  // back from the background (when timers were frozen) never plays anything, it only catches up.
  useEffect(() => {
    if (!timer) return;
    let last = Math.ceil((timer.endsAt - Date.now()) / 1000);
    let lastRun = Date.now();
    let handedOver = false;
    let done: ReturnType<typeof setTimeout> | null = null;
    const finish = (delay: number) => {
      release();
      letSleep();
      done ??= setTimeout(() => save(null), delay);
    };
    const check = () => {
      const now = Date.now();
      const ms = timer.endsAt - now;
      const left = Math.ceil(ms / 1000);
      const live = document.visibilityState === "visible" && now - lastRun < 1500;
      lastRun = now;
      if (live && ms > 0 && ms <= HANDOVER_MS && !handedOver) {
        handedOver = true;
        disarm();
      }
      if (live && left < last) {
        if (left <= 0) chime();
        else if (left <= 5) tick();
      }
      last = left;
      // Ended just now on screen: "Go" for a few seconds. Ended while away: up for longer once you're looking.
      if (ms <= 0 && document.visibilityState === "visible") finish(live && ms > -1500 ? Math.max(0, SHOW_DONE_MS + ms) : SHOW_MISSED_MS);
    };
    const iv = setInterval(check, 200);
    // Back after a reload or from the background: a tap re-opens audio for the chime (it's never opened by itself)
    const reprime = () => timer.endsAt > Date.now() && prime(true);
    document.addEventListener("touchend", reprime, true);
    document.addEventListener("click", reprime, true);
    return () => {
      clearInterval(iv);
      if (done) clearTimeout(done);
      document.removeEventListener("touchend", reprime, true);
      document.removeEventListener("click", reprime, true);
    };
  }, [timer, save, disarm]);

  const api = useMemo(() => ({ start, stop, enabled }), [start, stop, enabled]);
  const state = useMemo(() => ({ timer, adjust, stop }), [timer, adjust, stop]);

  return (
    <ApiCtx.Provider value={api}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </ApiCtx.Provider>
  );
}

const ago = (sec: number) => (sec < 60 ? `${sec}s` : `${Math.round(sec / 60)} min`);

/** The countdown card. Goes inside a bottom stack like the Dock's; use RestTimerDock on pages without one. */
export function RestTimerView() {
  const s = useContext(StateCtx);
  const timer = s?.timer ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [timer]);
  if (!s || !timer) return null;
  const left = Math.ceil((timer.endsAt - now) / 1000);

  return (
    <div
      role="timer"
      aria-live="off"
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-1.5 shadow-lg ${left <= 0 ? "border-good bg-good text-bg" : "border-ink bg-surface"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-display text-2xl font-bold leading-none tabular-nums">{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Go"}</div>
        <div className={`truncate text-xs ${left <= 0 ? "" : "text-muted"}`}>
          {left > 0 ? `Rest · ${timer.label}` : left > -10 ? "Rest over. Next set." : `Rest ended ${ago(-left)} ago. Next set.`}
        </div>
      </div>
      {left > 0 && (
        <>
          <button type="button" className="btn-ghost px-2.5" onClick={() => s.adjust(-15)} aria-label="15 seconds less">
            −15
          </button>
          <button type="button" className="btn-ghost px-2.5" onClick={() => s.adjust(15)} aria-label="15 seconds more">
            +15
          </button>
        </>
      )}
      <button type="button" className={`btn-ghost px-2.5 ${left <= 0 ? "border-bg text-bg" : ""}`} onClick={s.stop}>
        {left > 0 ? "Skip" : "OK"}
      </button>
    </div>
  );
}

/** The timer pinned to the bottom, for pages that have no Dock (Settings) */
export function RestTimerDock() {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom,0px))] z-40 mx-auto flex max-w-[680px] flex-col gap-2">
      <RestTimerView />
    </div>
  );
}
