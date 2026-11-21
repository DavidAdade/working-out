// Read-only check of one account's Score against live data: what was logged beyond the plan, day by day, and
// whether it added points. Only GETs; prints dates and counts, never names.
//   npm run score-audit -- <email>
// SCORE_COMPARE=<path to another copy of accountability.ts> also scores the same data with that copy (a change's
// before and after); TODAY=<date> scores as of another day.
import { accountability } from "../lib/plan/accountability.ts";
import { planFor } from "../lib/plan/adapt.ts";
import { builtinRows } from "../lib/plan/catalog.ts";
import { todayIn, safeTimeZone, dowName } from "../lib/plan/dates.ts";
import { profileToSettings, GATES } from "../lib/types.ts";
const oldAcct: typeof accountability | null = process.env.SCORE_COMPARE ? (await import(process.env.SCORE_COMPARE)).accountability : null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (p: string) => { const r = await fetch(url + p, { headers }); if (!r.ok) throw new Error(p.split("?")[0] + " " + r.status); return r.json(); };
const users = (await get("/auth/v1/admin/users?per_page=1000")).users as { id: string; email?: string }[];
const want = (process.argv[2] ?? "").toLowerCase();
const uid = users.find((u) => u.email?.toLowerCase() === want)?.id;
if (!uid) throw new Error("No account with that email");
const q = (t: string, sel: string, extra = "") => get(`/rest/v1/${t}?user_id=eq.${uid}&select=${sel}${extra}`);
const [profile] = await get(`/rest/v1/profiles?id=eq.${uid}&select=*`);
const logs = (await q("logs", "*", "&order=date.desc,created_at.desc&limit=1000")).map((l: any) => ({ ...l, km: l.km == null ? null : Number(l.km) }));
const skips = await get(`/rest/v1/day_overrides?user_id=eq.${uid}&status=eq.skipped&select=date,created_at`);
const moves = await q("day_moves", "from:from_date,to:to_date");
const sel = "id,date,exercise_key,set_no,weight,unit,weight_kg,reps,duration_sec,light_week,plan_date";
const num = (s: any) => ({ ...s, weight: s.weight == null ? null : Number(s.weight), weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) });
const onePage = (await q("set_logs", sel, "&order=date.desc&limit=5000")).map(num);
const sets: any[] = [];
for (let off = 0; off < 5000; off += 1000) { const page = await q("set_logs", sel, `&order=date.desc,id.asc&limit=1000&offset=${off}`); sets.push(...page.map(num)); if (page.length < 1000) break; }
console.log("set rows: one request asking for 5000 returned", onePage.length, "| paged read returned", sets.length, "| oldest in one request", onePage.at(-1)?.date, "| oldest paged", sets.at(-1)?.date);
const exercises = await get(`/rest/v1/exercises?select=key,name,load,lines,owner&or=(owner.is.null,owner.eq.${uid})`);
const swaps = await q("exercise_swaps", "planDate:plan_date,from:from_key,to:to_key");
const copies = await q("day_copies", "planDate:plan_date,source:source_date");
const byKey = new Map<string, any>(builtinRows().map((e: any) => [e.key, e])); for (const e of exercises) byKey.set(e.key, e);
const settings = profileToSettings(profile)!;
const tz = safeTimeZone(profile.timezone);
const today = process.env.TODAY ?? todayIn(tz);
const gatesPending = settings.returningFromInjury && GATES.some((g) => !profile.gates?.[g.key]);
const { weeks } = planFor({ settings, logs, skips: skips.map((s: any) => s.date), moves, gatesPending, today, swaps, exercise: (k: string) => byKey.get(k), copies });
const sk = skips.map((s: any) => ({ date: s.date, createdAt: s.created_at }));
const was: any = oldAcct?.({ weeks, logs, sets: onePage, skips: sk, gatesPending, today, horizon: null });
const now: any = accountability({ weeks, logs, sets, skips: sk, gatesPending, today, timeZone: tz, horizon: null });
console.log({ today, ownRunsFrom: profile.own_runs_from ?? null, gatesPending, logs: logs.length, copies: copies.length, moves: moves.length, skips: skips.length });
if (was) console.log("BEFORE", JSON.stringify({ score: was.score, parts: was.parts, extra: was.extra ?? `+${was.extras} extra`, sessions: was.sessions, sets: was.sets, streak: was.streak }));
console.log("AFTER ", JSON.stringify({ score: now.score, parts: now.parts, extra: now.extra, sessions: now.sessions, sets: now.sets, streak: now.streak }));
console.log("weeks:", now.weeks.map((w: any) => `${w.start} ${w.label} ${w.phase}${w.cutback ? " cutback" : ""} ${w.pct ?? "-"}%`).join(" | "));
console.log("\nextra work per day in the window (from the feed):");
const days = new Map<string, { sets: number; logs: number; why: Set<string> }>();
for (const f of now.feed) {
  if (f.date < now.from || !["set_extra", "exercise_extra", "extra_workout"].includes(f.kind)) continue;
  const d = days.get(f.date) ?? { sets: 0, logs: 0, why: new Set<string>() };
  if (f.kind === "extra_workout") d.logs++; else d.sets += Number(/(\d+) extra set/.exec(f.title)?.[1] ?? 0);
  d.why.add(f.delta === "not counted" ? `not counted: ${f.detail}` : "counted");
  days.set(f.date, d);
}
const cell = new Map<string, string>(now.weeks.flatMap((w: any) => w.days.map((c: any) => [c.date, c.glyph])));
for (const [date, d] of [...days].sort()) console.log(" ", date, dowName(date), String(cell.get(date)).padEnd(8), `${d.sets} sets`.padEnd(9), `${d.logs} logs`.padEnd(7), [...d.why].join("; "));
const skipLate = (r: any) => r.feed.filter((f: any) => f.kind === "skipped_late").length;
console.log("\nskips shown as 'after the day':", was ? `before ${skipLate(was)}, after ${skipLate(now)}` : skipLate(now));
