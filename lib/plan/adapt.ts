// Turns warnings into plan changes for the coming week. The generated plan stays the same; this only
// swaps blocks on days from today onward, so clearing the cause (ticking gates, a pain-free session) undoes it.

import { addDays, type ISODate } from "./dates.ts";
import type { Block } from "./templates.ts";
import type { Day, Week } from "./generate.ts";
import type { Warning } from "./warnings.ts";

export interface AdaptInput {
  today: ISODate;
  /** Injury profiles only: running waits for every gate */
  gatesPending: boolean;
  warnings: Warning[];
}

const isRun = (b: Block) => b.kind === "run" || b.kind === "test";
/** Hard sessions: tests, intervals and tempos. Easy, long, run-walk and shakeouts are not. */
const isHard = (b: Block) => b.kind === "test" || (b.kind === "run" && !/^(easy|long run|run-walk|shakeout)/i.test(b.title));

const walk = (title: string, note: string): Block => ({ kind: "walk", title, items: ["30 min easy walk or bike, no impact"], note });
const easy = (from: Block): Block => ({ kind: "run", title: "Easy 20 min", items: ["Very easy, flat", "Stop if pain goes above 2/10"], note: `Swapped for "${from.title}" because of pain.` });

export function adaptPlan(weeks: Week[], { today, gatesPending, warnings }: AdaptInput): Week[] {
  const end = addDays(today, 7);
  const code = warnings[0]?.code;
  let eased = false;

  const change = (d: Day, w: Week): Day => {
    if (d.date < today || d.date >= end || d.skipped || !d.blocks.some(isRun)) return d;
    if (gatesPending && w.phase === "return") {
      return {
        ...d,
        blocks: d.blocks.map((b) => (isRun(b) ? walk("Walk 30 min (running on hold)", "Running starts once all three gates pass. Tick them on the Today tab.") : b)),
        alerts: [...d.alerts, "Gates not passed yet, so this run is a walk."],
      };
    }
    if (code === "stop") {
      return { ...d, blocks: d.blocks.map((b) => (isRun(b) ? walk("Walk 30 min (running paused)", "Pain scored 4+ twice in a row. See a physio before running again.") : b)), alerts: [...d.alerts, "Running is paused."] };
    }
    if (code === "ease" && !eased && d.blocks.some(isHard)) {
      eased = true;
      return { ...d, blocks: d.blocks.map((b) => (isHard(b) ? easy(b) : b)), alerts: [...d.alerts, "Hard run swapped for easy because of pain."] };
    }
    if (code === "hold" && d.blocks.some((b) => b.km)) return { ...d, alerts: [...d.alerts, "Pain at 3/10: keep this run to last week's distance."] };
    return d;
  };

  if (!gatesPending && !code) return weeks;
  return weeks.map((w) => (w.days.some((d) => d.date >= today && d.date < end) ? { ...w, days: w.days.map((d) => change(d, w)) } : w));
}
