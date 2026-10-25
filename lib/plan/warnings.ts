import type { ISODate } from "./dates.ts";

export interface LogLike {
  date: ISODate;
  kind: string;
  pain: Record<string, number>;
  /** Created automatically from set logging; it carries no pain scores */
  auto?: boolean;
}

export interface Warning {
  level: "warn" | "bad";
  message: string;
}

const worst = (l: LogLike) => Math.max(0, ...Object.values(l.pain ?? {}));
const worstArea = (l: LogLike) => Object.entries(l.pain ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "pain";

/** Back-off rules: 3/10 = hold volume, 4+/10 = ease off, 4+ on two runs in a row = stop and see a physio. */
export function painWarnings(logs: LogLike[]): Warning[] {
  const sorted = logs.filter((l) => !l.auto).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const runs = sorted.filter((l) => l.kind === "run" || l.kind === "test");
  if (runs.length >= 2) {
    const [a, b] = runs;
    const area = Object.keys(a.pain ?? {}).find((k) => (a.pain[k] ?? 0) >= 4 && (b.pain?.[k] ?? 0) >= 4);
    if (area) return [{ level: "bad", message: `${cap(area)} scored 4+ on your last two runs. Pause running and see a physio before the next run.` }];
  }
  const last = sorted[0];
  if (!last) return [];
  const w = worst(last);
  if (w >= 4) return [{ level: "warn", message: `${cap(worstArea(last))} scored ${w}/10 last session. Make the next run easy and short, or swap it for a walk.` }];
  if (w === 3) return [{ level: "warn", message: `${cap(worstArea(last))} at 3/10 last session. Hold this week's volume instead of adding more.` }];
  return [];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
