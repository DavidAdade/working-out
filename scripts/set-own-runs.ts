// Saves a person's own running plan on their profile, the same list Settings takes
// ("Runs from another running plan"): one run per line, "2026-11-16, 5, Easy Run", plus "hard" or "race".
//
//   npm run own-runs -- person@example.com runs.txt          # save the list
//   npm run own-runs -- person@example.com runs.txt --dry    # only show the weeks it gives
//   npm run own-runs -- person@example.com runs.txt --from=2026-11-19   # days before that keep the plan's own
//   npm run own-runs -- person@example.com runs.txt --from=all          # the whole list (the default is today)
//   npm run own-runs -- person@example.com --clear           # back to the plan's own runs
//
// Needs SUPABASE_SERVICE_ROLE_KEY. Only touches that account's profiles.own_runs.

import { readFileSync } from "node:fs";
import { generatePlan } from "../lib/plan/generate.ts";
import { dowName, mondayOf, todayIn } from "../lib/plan/dates.ts";
import { parseOwnRuns } from "../lib/plan/ownruns.ts";
import { profileToSettings, type ProfileRow } from "../lib/types.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const clear = args.includes("--clear");
const [email, file] = args.filter((a) => !a.startsWith("--"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || (!file && !clear)) throw new Error("Usage: npm run own-runs -- <email> <runs.txt> [--dry] | <email> --clear");
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)");

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const { runs, bad } = clear ? { runs: [], bad: [] } : parseOwnRuns(readFileSync(file, "utf8"));
if (bad.length) throw new Error(`Couldn't read: ${bad.join(" | ")}`);

const users = (await api("/auth/v1/admin/users?per_page=1000")).users as { id: string; email?: string }[];
const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) throw new Error(`No account for ${email}`);
const [profile] = (await api(`/rest/v1/profiles?id=eq.${user.id}&select=*`)) as ProfileRow[];
if (!profile) throw new Error("That account has no profile yet");

const fromArg = args.find((a) => a.startsWith("--from="))?.slice(7);
if (fromArg && fromArg !== "all" && !/^\d{4}-\d{2}-\d{2}$/.test(fromArg)) throw new Error("--from takes a date like 2026-11-19, or all");
const since = !runs.length || fromArg === "all" ? null : fromArg ?? todayIn(profile.timezone || "America/Toronto");
const settings = profileToSettings({ ...profile, own_runs: runs, own_runs_from: since });
if (settings && runs.length) {
  const from = mondayOf(runs[0].date);
  const to = mondayOf(runs.at(-1)!.date);
  for (const w of generatePlan(settings).filter((x) => x.start >= from && x.start <= to)) {
    console.log(`\n${w.label} ${w.start}: ${w.days.length} training days`);
    for (const d of w.days) console.log(`  ${dowName(d.date)} ${d.date.slice(5)}  ${d.blocks.map((b) => b.title + (b.light ? " (light)" : "")).join(" + ")}`);
  }
  // Saved changes to those weeks were made against the old layout
  for (const [table, col] of [["day_moves", "from_date"], ["day_copies", "plan_date"], ["day_overrides", "date"]] as const) {
    const rows = (await api(`/rest/v1/${table}?user_id=eq.${user.id}&${col}=gte.${from}&select=${col}`)) as unknown[];
    if (rows.length) console.log(`\nNote: ${rows.length} saved row(s) in ${table} from ${from} on were made for the old layout.`);
  }
} else if (!settings) console.log("Profile setup isn't finished, so there is no plan to show yet.");

if (dry) console.log("\nDry run: nothing saved.");
else {
  await api(`/rest/v1/profiles?id=eq.${user.id}`, { method: "PATCH", body: JSON.stringify({ own_runs: runs, own_runs_from: since }) });
  console.log(`\nSaved ${runs.length} runs for ${email}.`);
}
