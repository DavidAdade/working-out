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

/* ---------- distance units ---------- */
// The plan is built, stored and scored in kilometres, and its text is read back by the engine (runCredit,
// intensity.ts, isHard), so nothing upstream changes for miles. A person who chose miles sees every distance and
// pace converted where it's shown, and what they type is converted back before it's saved.

export type DistUnit = "km" | "mi";
export const KM_PER_MI = 1.609344;
export const distUnit = (v: unknown): DistUnit => (v === "mi" ? "mi" : "km");
const trim = (n: number, digits = 1) => String(Number(n.toFixed(digits)));

/** A distance held in km, as a number in the person's unit */
export const fromKm = (km: number, unit: DistUnit) => (unit === "mi" ? km / KM_PER_MI : km);
/** A distance typed in the person's unit, in km */
export const toKm = (n: number, unit: DistUnit) => (unit === "mi" ? n * KM_PER_MI : n);
/** "5 km" or "3.1 mi" */
export const fmtDist = (km: number, unit: DistUnit) => `${trim(fromKm(km, unit))} ${unit}`;
/** Seconds per km → "6:05/km" or "9:47/mi" */
export const paceFor = (secPerKm: number, unit: DistUnit) => `${pace(unit === "mi" ? secPerKm * KM_PER_MI : secPerKm)}/${unit}`;

/**
 * Plan text as the person reads it: every "N km" and "m:ss/km" (alone or as a range) in miles when that's their
 * unit. Track reps in metres ("8 × 400 m") and race names ("5K", "10K") stay as they are.
 */
export function showIn(text: string, unit: DistUnit): string {
  if (unit === "km" || !text) return text;
  const perMi = (t: string) => {
    const [m, s] = t.split(":").map(Number);
    return pace((m * 60 + s) * KM_PER_MI);
  };
  return text
    .replace(/(\d+:\d\d)([–-])(\d+:\d\d)\/km/g, (_, a: string, dash: string, b: string) => `${perMi(a)}${dash}${perMi(b)}/mi`)
    .replace(/(\d+:\d\d)\/km/g, (_, a: string) => `${perMi(a)}/mi`)
    .replace(/(\d+(?:\.\d+)?)(\s?)km\b/g, (_, n: string, sp: string) => `${trim(Number(n) / KM_PER_MI)}${sp || " "}mi`);
}
