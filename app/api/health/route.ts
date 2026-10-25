import { anonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

/**
 * Apple Health → Shortcuts → here. Header `Authorization: Bearer <key from Settings>`, body one workout or
 * { workouts: [...] } (up to 20). Each workout: { id, type, start, duration, distance, distance_unit, avg_hr }.
 * Lenient on purpose, since Shortcuts formats numbers and units its own way. Re-sending a workout updates it.
 */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^[\w-]{20,64}$/.test(token)) return Response.json({ ok: false, error: "Missing or malformed key" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 20_000) return Response.json({ ok: false, error: "Too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }
  const list = (Array.isArray((body as { workouts?: unknown }).workouts) ? (body as { workouts: unknown[] }).workouts : [body]).slice(0, 20);
  const supabase = anonClient();
  const results = [];
  for (const w of list) {
    const workout = normalise(w as Record<string, unknown>);
    const { data, error } = await supabase.rpc("ingest_workout", { p_token: token, p_workout: workout });
    const r = (data ?? { ok: false, error: error?.message ?? "failed" }) as { ok: boolean; error?: string };
    if (r.error === "unknown token") return Response.json({ ok: false, error: "Unknown key. Make a new one in Settings." }, { status: 401 });
    results.push(r);
  }
  return Response.json({ ok: results.every((r) => r.ok), results });
}

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** "1:02:30", "1830", 1830 → seconds */
function seconds(v: unknown): number | null {
  if (typeof v === "string" && v.includes(":")) {
    const p = v.split(":").map(Number);
    return p.some(Number.isNaN) ? null : p.reduce((a, b) => a * 60 + b, 0);
  }
  return num(v);
}

function normalise(w: Record<string, unknown>) {
  const unit = String(w.distance_unit ?? "km").toLowerCase();
  const d = num(w.distance_km ?? w.distance);
  const km = d == null ? null : unit.startsWith("mi") ? d * 1.609344 : unit === "m" ? d / 1000 : d;
  return {
    id: String(w.id ?? `${w.start}-${w.type}`),
    type: String(w.type ?? ""),
    start: String(w.start ?? ""),
    duration_s: seconds(w.duration_s ?? w.duration),
    distance_km: km == null ? null : Math.round(km * 100) / 100,
    avg_hr: num(w.avg_hr),
  };
}
