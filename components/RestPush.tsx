"use client";

// "Notify me when rest is over": subscribes this phone to Web Push, so the end of a rest reaches you while the
// app is in the background. Per device, like the subscription itself. Turning it off stops arming rest pushes
// here; the subscription stays for any other notification the app sends.

import { useEffect, useState } from "react";
import { restPushKey } from "./RestTimer";

type State = "checking" | "unsupported" | "home-screen" | "denied" | "off" | "on";

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** VAPID keys are URL-safe base64; subscribe() wants bytes */
function bytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const sameKey = (sub: PushSubscription, key: Uint8Array) => {
  const k = sub.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((v, i) => v === key[i]);
};

/** The app's service worker (public/sw.js) loads the push handlers from /sw-push.js */
async function worker(): Promise<ServiceWorkerRegistration | null> {
  // Dev-only stand-in until sw.js is registered: register the push handlers on their own
  if (process.env.NODE_ENV === "development" && !(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register("/sw-push.js").catch(() => null);
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
}

export default function RestPush({ userId, vapidKey }: { userId: string; vapidKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flag = restPushKey(userId);

  useEffect(() => {
    if (!supported()) {
      // iPhone Safari only offers push to apps added to the Home Screen
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      setState(ios && !(navigator as Navigator & { standalone?: boolean }).standalone ? "home-screen" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("denied");
    let on = false;
    try {
      on = localStorage.getItem(flag) === "1";
    } catch {}
    if (!on || Notification.permission !== "granted") return setState("off");
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, [flag]);

  async function turnOn() {
    setError(null);
    setBusy(true);
    try {
      // First, while still inside the tap: iOS only shows the permission prompt from a tap
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await worker();
      if (!reg) return setError("Notifications aren't ready yet. Reload the app and try again.");
      const key = bytes(vapidKey);
      let sub = await reg.pushManager.getSubscription();
      // A subscription made with an older key can't receive our pushes
      if (sub && !sameKey(sub, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) return setError("Couldn't turn on notifications. Try again.");
      try {
        localStorage.setItem(flag, "1");
      } catch {}
      setState("on");
    } catch {
      setError("Couldn't turn on notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function turnOff() {
    setError(null);
    try {
      localStorage.removeItem(flag);
    } catch {}
    setState("off");
    // A rest already counting down shouldn't notify either
    void fetch("/api/push/rest", { method: "DELETE" }).catch(() => {});
  }

  const hint =
    state === "home-screen"
      ? "Add WorkoutFlex to your Home Screen (Share → Add to Home Screen) and open it from there to turn this on."
      : state === "unsupported"
        ? "This browser can't show notifications."
        : state === "denied"
          ? "Notifications are blocked. Allow them for WorkoutFlex in your phone's Settings → Notifications."
          : "Sends a notification when the timer ends while the app is in the background or the phone is locked.";

  return (
    <label className="flex items-start gap-2.5 sm:col-span-2">
      <input
        type="checkbox"
        checked={state === "on"}
        disabled={busy || state === "checking" || state === "unsupported" || state === "home-screen" || state === "denied"}
        onChange={(e) => (e.target.checked ? void turnOn() : turnOff())}
        className="mt-1 h-5 w-5 accent-[rgb(var(--accent))]"
      />
      <span>
        <b>Notify me when rest is over</b>
        <br />
        <span className="text-sm text-muted">{busy ? "Turning on…" : hint}</span>
        {error && (
          <span role="alert" className="block text-sm text-bad">
            {error}
          </span>
        )}
      </span>
    </label>
  );
}
