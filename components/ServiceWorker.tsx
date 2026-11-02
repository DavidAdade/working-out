"use client";

import { useEffect } from "react";

/** Installs public/sw.js, so the home-screen app opens with no signal. One per build: see the ?v=. */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // In development it would serve stale pages over hot reload: remove any left from a production run
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
      return;
    }
    const register = () =>
      void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev")}`, { scope: "/", updateViaCache: "none" }).catch(() => {});
    // After the page has loaded, so it never competes with the first paint on bad signal
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
