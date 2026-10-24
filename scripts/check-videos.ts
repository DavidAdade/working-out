// Checks every exercise video with YouTube's oEmbed endpoint.
// 200 = fine, 401/403 = embedding disabled, 404 = removed or private.
// Usage: npm run check-videos   (paste the output to Claude to get replacements)

import { VIDEOS, youtubeWatchUrl } from "../lib/plan/videos.ts";

type Result = { key: string; id: string; status: number; title?: string };

async function check(id: string): Promise<{ status: number; title?: string }> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatchUrl(id))}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { status: res.status };
    const json = (await res.json()) as { title?: string };
    return { status: 200, title: json.title };
  } catch {
    return { status: 0 };
  }
}

const results: Result[] = [];
for (const v of VIDEOS) {
  for (const id of v.ids) results.push({ key: v.key, id, ...(await check(id)) });
}

const bad = results.filter((r) => r.status !== 200);
for (const r of results) {
  const tag = r.status === 200 ? "ok  " : r.status === 404 ? "DEAD" : r.status === 401 || r.status === 403 ? "NOEMBED" : `ERR ${r.status}`;
  console.log(`${tag.padEnd(8)} ${r.key.padEnd(16)} ${r.id}  ${r.title ?? ""}`);
}
const noWorking = VIDEOS.filter((v) => results.filter((r) => r.key === v.key).every((r) => r.status !== 200)).map((v) => v.key);
console.log(`\n${results.length - bad.length}/${results.length} videos OK.`);
if (noWorking.length) console.log(`No working video at all for: ${noWorking.join(", ")}`);
process.exitCode = bad.length ? 1 : 0;
