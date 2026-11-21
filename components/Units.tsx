"use client";

// The person's distance unit (profiles.distance_unit), for everything shown or typed. The plan itself stays in
// km: see the notes in lib/plan/format.ts.
import { createContext, useContext, useMemo } from "react";
import { dayTitle, type Day } from "@/lib/plan/generate.ts";
import { fmtDist, fromKm, paceFor, showIn, toKm, type DistUnit } from "@/lib/plan/format.ts";

interface Units {
  unit: DistUnit;
  /** Plan text (titles, lines, notes, feed rows) with its distances and paces in the person's unit */
  show: (text: string) => string;
  /** "5 km" / "3.1 mi" from km */
  dist: (km: number) => string;
  /** "6:05/km" / "9:47/mi" from seconds per km */
  pace: (secPerKm: number) => string;
  fromKm: (km: number) => number;
  toKm: (n: number) => number;
}

const make = (unit: DistUnit): Units => ({
  unit,
  show: (text) => showIn(text, unit),
  dist: (km) => fmtDist(km, unit),
  pace: (sec) => paceFor(sec, unit),
  fromKm: (km) => fromKm(km, unit),
  toKm: (n) => toKm(n, unit),
});
const Ctx = createContext<Units>(make("km"));

export function UnitsProvider({ unit, children }: { unit: DistUnit; children: React.ReactNode }) {
  const value = useMemo(() => make(unit), [unit]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useUnits = () => useContext(Ctx);
/** A day's headline ("Long run 7 km") in the person's unit */
export const useDayTitle = () => {
  const { show } = useUnits();
  return (d: Day) => show(dayTitle(d));
};
