// Copies the built-in exercise catalog into the Supabase `exercises` table.
// Runs before every `npm run build` (so each Vercel deploy syncs it) and on its own with `npm run sync-exercises`.
// Needs SUPABASE_SERVICE_ROLE_KEY (server-only, never NEXT_PUBLIC_); without it the sync is skipped and the app
// falls back to the catalog in code. Custom exercises people add in the app are never touched.

import { builtinRows } from "../lib/plan/catalog.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const strict = process.argv.includes("--strict");

async function main() {
  // Preview deploys share the production database, so only production (or a local run) may rewrite the catalog
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    console.log(`sync-exercises: ${process.env.VERCEL_ENV} build, skipping (only production syncs)`);
    return;
  }
  if (!url || !key) {
    console.log("sync-exercises: SUPABASE_SERVICE_ROLE_KEY not set, skipping");
    return;
  }
  const rows = builtinRows();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const up = await fetch(`${url}/rest/v1/exercises?on_conflict=key`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!up.ok) throw new Error(`upsert failed: ${up.status} ${await up.text()}`);

  // Built-ins removed from the catalog. Logged sets keep their key, so history survives.
  const keep = rows.map((r) => `"${r.key}"`).join(",");
  const del = await fetch(`${url}/rest/v1/exercises?owner=is.null&key=not.in.(${keep})`, { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
  if (!del.ok) throw new Error(`cleanup failed: ${del.status} ${await del.text()}`);
  const removed = (await del.json()) as { key: string }[];

  console.log(`sync-exercises: ${rows.length} built-in exercises synced${removed.length ? `, removed ${removed.map((r) => r.key).join(", ")}` : ""}`);
}

main().catch((e) => {
  console.error(`sync-exercises: ${e.message}`);
  // A failed sync shouldn't block a deploy: the app still works from the code catalog
  if (strict) process.exit(1);
});
