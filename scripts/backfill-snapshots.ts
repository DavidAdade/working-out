// One-off for migration 0021: saves the workout shown on every day already logged, for every account, so days
// logged before snapshots existed are protected from later template edits too (lib/plan/snapshots.ts).
// Only adds rows to day_snapshots, and never replaces one that's there.
//   npm run backfill-snapshots            what it would save
//   npm run backfill-snapshots -- --write  save it
import { planFor } from "../lib/plan/adapt.ts";
import { builtinRows } from "../lib/plan/catalog.ts";
import { todayIn, safeTimeZone } from "../lib/plan/dates.ts";
import { snapshotOf } from "../lib/plan/snapshots.ts";
import { profileToSettings, GATES } from "../lib/types.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set");
const write = process.argv.includes("--write");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const get = async (p: string) => {
  const rows: any[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${url}/rest/v1/${p}${p.includes("?") ? "&" : "?"}limit=1000&offset=${off}`, { headers });
    if (!r.ok) throw new Error(`${p.split("?")[0]} ${r.status}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
};

const profiles = await get("profiles?select=*&order=id");
let total = 0;
for (const [n, profile] of profiles.entries()) {
  const settings = profileToSettings(profile);
  if (!settings) continue;
  const mine = (t: string, sel: string, order: string) => get(`${t}?user_id=eq.${profile.id}&select=${sel}&order=${order}`);
  const [logs, sets, skips, moves, swaps, copies, exercises, have] = await Promise.all([
    mine("logs", "*", "date.desc,id"),
    mine("set_logs", "date,plan_date,exercise_key", "date.desc,id"),
    get(`day_overrides?user_id=eq.${profile.id}&status=eq.skipped&select=date&order=date`),
    mine("day_moves", "from:from_date,to:to_date", "to_date"),
    mine("exercise_swaps", "planDate:plan_date,from:from_key,to:to_key", "plan_date,from_key"),
    mine("day_copies", "planDate:plan_date,source:source_date", "plan_date"),
    get(`exercises?select=key,name,load&owner=eq.${profile.id}&order=key`),
    mine("day_snapshots", "plan_date", "plan_date"),
  ]);
  const byKey = new Map<string, any>(builtinRows().map((e: any) => [e.key, e]));
  for (const e of exercises) byKey.set(e.key, e);
  const today = todayIn(safeTimeZone(profile.timezone));
  const gatesPending = settings.returningFromInjury && GATES.some((g) => !profile.gates?.[g.key]);
  const { weeks } = planFor({ settings, logs: logs.map((l: any) => ({ ...l, km: l.km == null ? null : Number(l.km) })), skips: skips.map((s: any) => s.date), moves, gatesPending, today, swaps, exercise: (k: string) => byKey.get(k), copies });
  const active = new Set<string>([...sets.map((s: any) => s.plan_date ?? s.date), ...logs.filter((l: any) => ["run", "test", "walk"].includes(l.kind) && !l.auto).map((l: any) => l.date)]);
  const kept = new Set(have.map((h: any) => h.plan_date));
  const rows = weeks
    .flatMap((w) => w.days)
    .filter((d) => d.date < today && !d.skipped && d.blocks.length && active.has(d.date) && !kept.has(d.date))
    .map((d) => ({ user_id: profile.id, plan_date: d.date, blocks: snapshotOf(d) }));
  total += rows.length;
  console.log(`account ${n + 1}: ${rows.length} day${rows.length === 1 ? "" : "s"} to save, ${kept.size} already kept`);
  if (write && rows.length) {
    const r = await fetch(`${url}/rest/v1/day_snapshots?on_conflict=user_id,plan_date`, { method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify(rows) });
    if (!r.ok) throw new Error(`save failed for account ${n + 1}: ${r.status} ${await r.text()}`);
  }
}
console.log(write ? `Saved ${total} days.` : `Would save ${total} days. Add -- --write to save them.`);
