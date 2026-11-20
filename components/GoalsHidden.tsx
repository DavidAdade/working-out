"use client";

// Personal goals (goal times, the race) can be hidden for screenshots. One choice for the whole app, remembered
// on this phone: hiding them in one place hides them everywhere they show (header, Today, Stats, Settings).

import { useCallback, useEffect, useState } from "react";

const KEY = "wf-goal-hidden";
const EVENT = "wf-goal-hidden";

export function useGoalsHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setHidden(localStorage.getItem(KEY) === "1");
      } catch {}
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const set = useCallback((on: boolean) => {
    setHidden(on);
    try {
      if (on) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [hidden, set];
}

/** "Hide" / "Show goals": the same button wherever goals show */
export function GoalsToggle({ hidden, onChange, className = "" }: { hidden: boolean; onChange: (hidden: boolean) => void; className?: string }) {
  return (
    <button type="button" aria-expanded={!hidden} onClick={() => onChange(!hidden)} className={`flex min-h-11 flex-none items-center rounded-lg px-2 text-sm text-muted active:bg-sunk ${className}`}>
      {hidden ? "Show goals" : "Hide"}
    </button>
  );
}
