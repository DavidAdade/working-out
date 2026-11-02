"use client";

// The app from the copy saved on this phone, for when the server can't be reached: the error screen on "/"
// and the /offline page the service worker opens with no signal. Without a saved copy, `fallback` shows.

import { useEffect, useState } from "react";
import { loadSnapshot } from "@/lib/offline";
import { safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import Dashboard, { type DashboardProps } from "./Dashboard";

export default function OfflineApp({ fallback }: { fallback: React.ReactNode }) {
  const [state, setState] = useState<{ data: DashboardProps; savedAt: number } | null | "loading">("loading");

  useEffect(() => {
    let live = true;
    void loadSnapshot<DashboardProps>().then((snap) => {
      if (!live) return;
      // "Today" moves on even when the data can't
      setState(snap ? { data: { ...snap.data, today: todayIn(safeTimeZone(snap.data.profile.timezone)) }, savedAt: snap.savedAt } : null);
    });
    return () => {
      live = false;
    };
  }, []);

  if (state === "loading") return null;
  if (!state) return <>{fallback}</>;
  return <Dashboard {...state.data} offline={{ savedAt: state.savedAt }} />;
}
