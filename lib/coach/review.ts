// Weekly AI check-in: reads the last three weeks and the coming one, returns a short read and at most four
// suggestions. It can only advise: suggestions are checked against the plan and applied by the person.

import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { addDays, dowName, type ISODate } from "../plan/dates.ts";
import { PHASE_NAMES, type Week } from "../plan/generate.ts";
import { duration } from "../plan/format.ts";
import { sessions } from "../plan/progress.ts";
import type { Warning } from "../plan/warnings.ts";
import type { LogRow, SetRow } from "../types.ts";

export const REVIEW_MODEL = "anthropic/claude-sonnet-5.5";

/** The check-in exists only when an AI Gateway key is set; without one the card isn't shown at all. */
export const aiEnabled = () => !!process.env.AI_GATEWAY_API_KEY;

const schema = z.object({
  summary: z.string().describe("2 to 4 short sentences: how the last week went and what matters this week. Plain words."),
  flags: z.array(z.string()).max(3).describe("Concerns worth acting on, e.g. a rising pain trend or missed long runs. Empty if none."),
  suggestions: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD, one of the coming week's plan days listed"),
        action: z.enum(["skip", "easier", "note"]),
        text: z.string().describe("One sentence the person reads on that day"),
      }),
    )
    .max(4),
});
export type Review = z.infer<typeof schema>;

const SYSTEM = `You are a careful running and strength coach reviewing one week of training for a person following a fixed plan toward a 5K time trial (and maybe a half marathon). Many are coming back from injury.

Rules you never break:
- Never add training: no extra runs, longer runs, faster paces or more sets than the plan shows.
- Never move or remove the 5K time trial, the race, or a scheduled test. Suggest "easier" or "note" for those days instead.
- Pain 3/10 means hold volume. 4/10 or more means swap the next hard run for an easy one or a walk. 4+ on two runs in a row, or swelling, locking, giving way or night pain means stop running and see a physio. Say so plainly.
- You do not diagnose. You may suggest seeing a physio.
- "skip" only for a day where resting clearly helps (pain, missed sleep, illness signs in notes). Prefer fewer suggestions; none is fine when things are on track.
- Write like a coach texting an athlete: short, specific, kind. No headings, no emojis.`;

export function context(o: { name: string | null; weeks: Week[]; logs: LogRow[]; sets: SetRow[]; names: Map<string, string>; warnings: Warning[]; fitness: string; goal: string; today: ISODate }): string {
  const from = addDays(o.today, -21);
  const recent = o.logs.filter((l) => l.date >= from && l.date <= o.today && !l.auto);
  const runs = recent.map((l) =>
    [l.date, dowName(l.date), l.kind === "check" ? "morning check-in" : l.title ?? l.kind, l.km != null ? `${l.km} km` : "", l.duration_sec ? duration(l.duration_sec) : "", l.rpe ? `effort ${l.rpe}/10` : "",
      Object.keys(l.pain ?? {}).length ? `pain ${Object.entries(l.pain).map(([k, v]) => `${k} ${v}`).join(", ")}` : "", l.notes ? `notes: "${l.notes.slice(0, 200)}"` : ""].filter(Boolean).join(" · "),
  );
  const keys = [...new Set(o.sets.filter((s) => s.date >= from).map((s) => s.exercise_key))];
  const lifts = keys.map((k) => {
    const ss = sessions(o.sets, k).filter((s) => s.date >= from).slice(0, 3).reverse();
    return `${o.names.get(k) ?? k}: ${ss.map((s) => `${s.date} ${s.sets.map((x) => (x.weight_kg ? `${x.weight_kg}kg×${x.reps}` : x.reps ? `×${x.reps}` : `${x.duration_sec}s`)).join(",")}${s.light ? " (light)" : ""}`).join(" → ")}`;
  });
  const planned = o.weeks.flatMap((w) => w.days.map((d) => ({ w, d })));
  const past = planned.filter(({ d }) => d.date >= addDays(o.today, -7) && d.date < o.today);
  const loggedDates = new Set([...o.logs.filter((l) => l.kind !== "check").map((l) => l.date), ...o.sets.map((s) => s.plan_date ?? s.date)]);
  const coming = planned.filter(({ d }) => d.date >= o.today && d.date < addDays(o.today, 7));
  const line = ({ w, d }: { w: Week; d: Week["days"][number] }) =>
    `${d.date} ${dowName(d.date)} [${PHASE_NAMES[w.phase]}${w.cutback ? ", cutback" : ""}] ${d.skipped ? "SKIPPED" : d.blocks.map((b) => b.title).join(" + ")}${d.skippable && !d.skipped ? "" : " (can't skip)"}`;
  return [
    `Today: ${o.today} (${dowName(o.today)}). Athlete: ${o.name ?? "runner"}. Current 5K fitness ${o.fitness}, goal ${o.goal}.`,
    o.warnings.length ? `App warnings now: ${o.warnings.map((w) => w.message).join(" ")}` : "No pain warnings right now.",
    `Last 7 days planned vs done:\n${past.map((x) => `${line(x)} → ${loggedDates.has(x.d.date) ? "done" : x.d.skipped ? "skipped" : "nothing logged"}`).join("\n") || "none"}`,
    `Sessions and check-ins, last 3 weeks:\n${runs.join("\n") || "none"}`,
    `Lifts, last 3 weeks (oldest → newest):\n${lifts.join("\n") || "none"}`,
    `Coming 7 days (suggestions must use these dates):\n${coming.map(line).join("\n")}`,
  ].join("\n\n");
}

export async function generateReview(o: Parameters<typeof context>[0], model: LanguageModel = REVIEW_MODEL): Promise<Review> {
  const { output } = await generateText({
    model,
    system: SYSTEM,
    prompt: context(o),
    output: Output.object({ schema }),
    maxOutputTokens: 900,
    abortSignal: AbortSignal.timeout(45_000),
  });
  // Keep only what the plan allows: real coming days, skips only where skipping is possible
  const coming = new Map(o.weeks.flatMap((w) => w.days).filter((d) => d.date >= o.today && d.date < addDays(o.today, 7)).map((d) => [d.date, d]));
  const suggestions = output.suggestions.filter((s) => {
    const d = coming.get(s.date);
    return d && !d.skipped && (s.action !== "skip" || (d.skippable && !d.blocks.some((b) => b.kind === "test")));
  });
  return { summary: output.summary.slice(0, 800), flags: output.flags.slice(0, 3).map((f) => f.slice(0, 200)), suggestions: suggestions.map((s) => ({ ...s, text: s.text.slice(0, 240) })) };
}
