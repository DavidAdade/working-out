// Date helpers that work on plain "YYYY-MM-DD" strings, so plans never shift across time zones.

export type ISODate = string;

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(s: ISODate): number {
  return parseISO(s).getUTCDay();
}

export function mondayOf(s: ISODate): ISODate {
  const off = (weekday(s) + 6) % 7;
  return addDays(s, -off);
}

export function isMonday(s: ISODate): boolean {
  return weekday(s) === 1;
}

/** Today's date in a given IANA time zone, e.g. "America/Toronto". */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True for a valid IANA zone such as "America/Toronto". */
export function isTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A saved zone that no longer parses falls back instead of breaking every page. */
export const safeTimeZone = (tz: string | null | undefined) => (isTimeZone(tz) ? tz : "America/Toronto");

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const dowName = (s: ISODate) => DOW[weekday(s)];
export const fmtShort = (s: ISODate) => {
  const d = parseISO(s);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
export const fmtDay = (s: ISODate) => `${dowName(s)} ${fmtShort(s)}`;
export const fmtLong = (s: ISODate) => `${fmtDay(s)}, ${parseISO(s).getUTCFullYear()}`;
