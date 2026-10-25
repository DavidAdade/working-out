"use client";

import { createContext, useContext, useMemo } from "react";
import { weekForDate, type Week } from "@/lib/plan/generate.ts";
import { addDays, dowName, fmtDay, fmtLong, fmtShort, type ISODate } from "@/lib/plan/dates.ts";

/**
 * How dates read on screen. With "hide dates" on, the plan reads by week and weekday ("W3 Wed")
 * instead of the calendar. Dates still drive everything underneath.
 */
export interface DateLabels {
  hide: boolean;
  /** "Wed Nov 18" or "W3 Wed" */
  day: (d: ISODate) => string;
  /** "Nov 18" or "W3 Wed" (chart labels, compact lists) */
  short: (d: ISODate) => string;
  /** "Wed Nov 18, 2026" or "Week 3, Wed" */
  long: (d: ISODate) => string;
  /** "Nov 16 – Nov 22", or empty when dates are hidden */
  range: (start: ISODate) => string;
}

const calendar: DateLabels = {
  hide: false,
  day: fmtDay,
  short: fmtShort,
  long: fmtLong,
  range: (s) => `${fmtShort(s)} – ${fmtShort(addDays(s, 6))}`,
};

const Ctx = createContext<DateLabels>(calendar);
export const useDates = () => useContext(Ctx);

export function DateLabelsProvider({ hide, weeks, children }: { hide: boolean; weeks: Week[]; children: React.ReactNode }) {
  const value = useMemo<DateLabels>(() => {
    if (!hide) return calendar;
    // Outside the plan (old logs, far-future races) there is no week to name, so fall back to the weekday alone.
    const weekLabel = (d: ISODate) => weekForDate(weeks, d)?.label;
    const day = (d: ISODate) => {
      const w = weekLabel(d);
      return w ? `${w} ${dowName(d)}` : dowName(d);
    };
    return {
      hide: true,
      day,
      short: day,
      long: (d) => {
        const w = weekForDate(weeks, d);
        return w ? `${w.index ? `Week ${w.index}` : w.label}, ${dowName(d)}` : dowName(d);
      },
      range: () => "",
    };
  }, [hide, weeks]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
