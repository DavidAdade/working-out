"use client";

// Shown while the Dashboard runs from the copy saved on this phone (no signal, or the server is down).
// It checks for the server in the background and switches back to live data as soon as it answers.

import { useEffect, useState } from "react";

const typing = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
};

/** Reload the live app. Waits until a half-typed field is left, so a weight being entered isn't lost. */
export function goLive() {
  if (!typing()) return window.location.replace("/");
  document.addEventListener("focusout", () => setTimeout(goLive, 300), { once: true });
}

/** Whether the server (and Supabase behind it) answers: anything but a network error or a 5xx */
async function reachable() {
  try {
    const r = await fetch("/api/ping", { cache: "no-store" });
    return r.status < 500;
  } catch {
    return false;
  }
}

export default function OfflineBanner({ savedAt }: { savedAt: number }) {
  const [back, setBack] = useState(false);

  useEffect(() => {
    let failed = false;
    let stopped = false;
    const probe = async () => {
      if (document.visibilityState !== "visible") return;
      const ok = await reachable();
      if (stopped) return;
      setBack(ok);
      if (!ok) failed = true;
      // Only on the way back: if the server answered all along (just slow), let the person choose
      else if (failed) goLive();
    };
    void probe();
    window.addEventListener("online", probe);
    document.addEventListener("visibilitychange", probe);
    const t = setInterval(probe, 30000);
    return () => {
      stopped = true;
      window.removeEventListener("online", probe);
      document.removeEventListener("visibilitychange", probe);
      clearInterval(t);
    };
  }, []);

  const saved = new Date(savedAt);
  const sameDay = saved.toDateString() === new Date().toDateString();
  const when = sameDay ? saved.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : saved.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div role="status" className={`flex items-center justify-between gap-3 rounded-lg border bg-surface px-3.5 py-1 text-sm ${back ? "border-good" : "border-warn"}`}>
      <span className="min-w-0">{back ? "Back online." : <>Offline — showing saved data from {when}.</>}</span>
      <button type="button" className="btn-ghost flex-none" onClick={() => window.location.replace("/")}>
        {back ? "Refresh" : "Retry"}
      </button>
    </div>
  );
}
