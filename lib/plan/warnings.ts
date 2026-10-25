import { addDays, type ISODate } from "./dates.ts";

export interface LogLike {
  date: ISODate;
  kind: string;
  pain: Record<string, number>;
  /** Created automatically from set logging; it carries no pain scores */
  auto?: boolean;
}

export interface Warning {
  level: "warn" | "bad";
  /** What the plan does about it: stop running, ease the next hard run, or hold volume */
  code: "stop" | "ease" | "hold";
  message: string;
}

/** Pain older than this no longer drives warnings */
export const PAIN_WINDOW_DAYS = 7;

const worst = (l: LogLike) => Math.max(0, ...Object.values(l.pain ?? {}));
const worstArea = (l: LogLike) => Object.entries(l.pain ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "pain";

/**
 * Back-off rules: 3/10 = hold volume, 4+/10 = ease off, 4+ on two runs in a row = stop and see a physio.
 * Morning check-ins (kind "check") count like any other session's pain. With `today`, only the last week counts.
 */
export function painWarnings(logs: LogLike[], today?: ISODate): Warning[] {
  const from = today ? addDays(today, -PAIN_WINDOW_DAYS) : null;
  const sorted = logs
    .filter((l) => !l.auto && (!from || (l.date > from && l.date <= today!)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const runs = sorted.filter((l) => l.kind === "run" || l.kind === "test");
  if (runs.length >= 2) {
    const [a, b] = runs;
    const area = Object.keys(a.pain ?? {}).find((k) => (a.pain[k] ?? 0) >= 4 && (b.pain?.[k] ?? 0) >= 4);
    if (area) return [{ level: "bad", code: "stop", message: `${cap(area)} scored 4+ on your last two runs. Running is paused: see a physio before the next run.` }];
  }
  const last = sorted.find((l) => Object.keys(l.pain ?? {}).length > 0);
  if (!last) return [];
  const w = worst(last);
  const when = last.kind === "check" ? "this morning" : "last session";
  if (w >= 4) return [{ level: "warn", code: "ease", message: `${cap(worstArea(last))} scored ${w}/10 ${when}. Your next hard run is swapped for an easy one.` }];
  if (w === 3) return [{ level: "warn", code: "hold", message: `${cap(worstArea(last))} at 3/10 ${when}. Hold this week's volume instead of adding more.` }];
  return [];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
