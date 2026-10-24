/** Seconds per km → "6:05" */
export function pace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds → "29:45" or "2:18:30" */
export function duration(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
}

/** "34:10", "1:02:30" or "35" (minutes) → seconds. "34.10" also works, since phone number pads have no colon. Returns null for anything unparseable. */
export function parseDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const parts = input.trim().split(/[:.,]/);
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
  if (n.length === 2) return n[0] * 60 + n[1];
  if (n.length === 1) return n[0] * 60;
  return null;
}

/** Riegel race-equivalence estimate. */
export function predict(timeSec: number, fromKm: number, toKm: number, exponent = 1.06): number {
  return timeSec * Math.pow(toKm / fromKm, exponent);
}

export const HALF_KM = 21.0975;
