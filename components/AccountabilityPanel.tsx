"use client";

import { useMemo, useState } from "react";
import { accountability, BANDS, GLYPHS, type Accountability, type AcctSkip, type FeedItem, type FeedKind } from "@/lib/plan/accountability.ts";
import { addDays } from "@/lib/plan/dates.ts";
import type { Phase, Week } from "@/lib/plan/generate.ts";
import { toUnit } from "@/lib/plan/progress.ts";
import type { ActivityEventRow, LogRow } from "@/lib/types";
import { useSets } from "./Sets";
import { useDates } from "./DateLabels";
import Pager, { usePage } from "./Pager";

/** Everything the score needs besides the sets, which come live from the set logger */
export interface ScoreInputs {
  weeks: Week[];
  logs: LogRow[];
  skips: AcctSkip[];
  events: ActivityEventRow[];
  gatesPending: boolean;
  today: string;
  horizon: string | null;
}

/** The score, worked out from the optimistic sets so it moves as soon as a set is ticked */
export function useAccountability(i: ScoreInputs): Accountability {
  const { sets, nameOf } = useSets();
  return useMemo(() => accountability({ ...i, sets, name: nameOf }), [i, sets, nameOf]);
}

/** Today's one-line link to the Score tab, in place of the old sessions count */
export function ScoreLink({ inputs, onOpen }: { inputs: ScoreInputs; onOpen: () => void }) {
  const r = useAccountability(inputs);
  if (r.status === "not_started" || r.status === "empty") return null;
  return (
    <button type="button" onClick={onOpen} className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 text-left text-sm text-muted active:bg-sunk">
      <span>{r.score != null ? `Kept ${r.score}% this month` : `Building your score: ${Math.min(r.counted, r.needed)}/${r.needed} sessions`}</span>
      <span aria-hidden>›</span>
    </button>
  );
}

const KIND_GLYPH: Record<FeedKind, string> = {
  done: GLYPHS.done,
  partial: GLYPHS.partial,
  missed: GLYPHS.missed,
  grace: GLYPHS.grace,
  skipped: GLYPHS.skipped,
  skipped_late: GLYPHS.skipped,
  done_other_day: GLYPHS.moved,
  moved: GLYPHS.moved,
  run_short: GLYPHS.partial,
  sets_short: GLYPHS.partial,
  set_extra: GLYPHS.extra,
  exercise_extra: GLYPHS.extra,
  extra_workout: GLYPHS.extra,
  set_deleted: "–",
  log_deleted: "–",
  ended_early: "■",
  swapped: "⇄",
  copied: "⇄",
  weight_up: "▲",
  weight_same: "=",
  weight_down: "▼",
};

const PAGE = 15;
const PHASE_SHORT: Record<Phase, string> = { recovery: "Recovery", return: "Return", base: "Base", build: "Build", sharpen: "Sharpen", tt: "Trial", half: "Half", taper: "Taper", race: "Race" };

export default function AccountabilityPanel({ inputs, onLog, onToday }: { inputs: ScoreInputs; onLog: (date: string) => void; onToday: () => void }) {
  const r = useAccountability(inputs);
  const { openHistory, unit } = useSets();
  const dates = useDates();
  const [week, setWeek] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const feed = useMemo(() => (week ? r.feed.filter((f) => f.date >= week && f.date < addDays(week, 7)) : r.feed), [r.feed, week]);
  const shown = usePage(feed, PAGE, page);
  const groups = useMemo(() => {
    const out: { date: string; items: FeedItem[] }[] = [];
    for (const f of shown.shown) {
      if (out.at(-1)?.date === f.date) out.at(-1)!.items.push(f);
      else out.push({ date: f.date, items: [f] });
    }
    return out;
  }, [shown.shown]);

  const pickWeek = (start: string) => {
    setWeek((w) => (w === start ? null : start));
    setPage(0);
  };
  const delta = (f: FeedItem) => (f.kg != null && unit === "lb" ? `${f.kg > 0 ? "+" : "−"}${toUnit(Math.abs(f.kg), "lb")} lb` : f.delta.replace(/^-/, "−"));
  const open = (f: FeedItem) => (f.key ? openHistory(f.key, f.date) : onLog(f.date));

  if (r.status === "not_started" || r.status === "empty" || (r.status === "building" && !r.feed.length)) {
    return (
      <section className="flex flex-col gap-3.5">
        <article className="card">
          <div className="label">Accountability</div>
          <div className="font-display text-6xl font-bold leading-none text-muted">—</div>
          <div className="h-2.5 rounded-full bg-sunk" />
          <p className="text-sm text-muted">
            Your score starts after your first planned session. Every workout you do counts. Rest days, cutback weeks, moved days and pain adjustments all count as sticking to the plan.
          </p>
          <button type="button" className="btn self-start" onClick={onToday}>
            See today&apos;s session
          </button>
        </article>
        <HowScored />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3.5">
      <Hero r={r} />

      {r.weeks.length > 0 && (
        <article className="card gap-1.5">
          <div className="flex items-center gap-2">
            <h3 className="label flex-1">Weeks</h3>
            <WeekRow cells={["M", "T", "W", "T", "F", "S", "S"]} />
            <span className="w-16" />
          </div>
          <ul className="flex flex-col">
            {r.weeks.map((w) => (
              <li key={w.start}>
                <button
                  type="button"
                  onClick={() => pickWeek(w.start)}
                  aria-pressed={week === w.start}
                  className={`-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 text-left active:bg-sunk ${week === w.start ? "bg-sunk" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {w.label ? `${w.label.replace(/^W/, "Wk ")}` : "Before plan"}
                    {w.phase && <span className="font-normal text-muted"> {w.cutback ? "Cutback" : PHASE_SHORT[w.phase]}</span>}
                  </span>
                  <WeekRow cells={w.days.map((d) => GLYPHS[d.glyph])} labels={w.days.map((d) => `${dates.day(d.date)}: ${d.title}, ${d.glyph}`)} />
                  <span className={`w-16 text-right ${w.inProgress ? "text-xs" : "font-mono text-sm"} ${w.kept && !w.inProgress ? "text-good" : "text-muted"}`}>{w.inProgress ? "in progress" : w.pct != null ? `${w.pct}%` : "—"}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">● done ◐ partial ○ missed ⨯ skipped ⇢ moved ✚ extra ⏸ eased by plan ◌ not logged yet. Tap a week to see why.</p>
        </article>
      )}

      <article className="card gap-1.5" id="score-feed">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <h3 className="label">What changed it</h3>
          {week && (
            <button type="button" className="btn-ghost" onClick={() => pickWeek(week)}>
              {r.weeks.find((w) => w.start === week)?.label.replace(/^W/, "Wk ") || "This week"} ×
            </button>
          )}
        </div>
        {groups.length === 0 && <p className="text-sm text-muted">Nothing logged or due yet{week ? " that week" : ""}.</p>}
        {groups.map((g) => (
          <div key={g.date} className="flex flex-col">
            <div className="label pt-2">{dates.day(g.date)}</div>
            <ul className="flex flex-col divide-y divide-line">
              {g.items.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => open(f)} className="flex min-h-11 w-full items-center gap-2.5 py-1.5 text-left active:bg-sunk">
                    <span aria-hidden className={`w-5 flex-none text-center ${f.tone === "good" ? "text-good" : "text-muted"}`}>
                      {KIND_GLYPH[f.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm">{f.title}</span>
                      {f.detail && <span className="block text-xs text-muted">{f.detail}</span>}
                    </span>
                    <span className={`flex-none whitespace-nowrap font-mono text-xs ${f.tone === "good" ? "text-good" : "text-muted"}`}>{delta(f)}</span>
                    <span aria-hidden className="flex-none text-muted">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Pager current={shown.current} pages={shown.pages} label={`${shown.from}–${shown.to} of ${feed.length}`} onPage={setPage} listId="score-feed" />
      </article>

      <HowScored />
    </section>
  );
}

function Hero({ r }: { r: Accountability }) {
  const band = r.band ? BANDS[r.band] : null;
  // The bar runs to 110 so work beyond the plan shows past the 100 tick
  const total = r.parts.a + r.parts.e + r.parts.p - r.parts.d;
  const fill = r.score == null ? 0 : Math.min(100, r.score);
  const over = r.score == null ? 0 : Math.max(0, Math.min(10, total - 100));
  const warn = r.score != null && r.score < 60;
  return (
    <article className="card gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="label">{r.finished ? "Plan finished · final 4 weeks" : "Accountability · last 4 weeks"}</div>
        {band && <span className="whitespace-nowrap rounded-full bg-good/15 px-2.5 py-0.5 text-xs font-semibold text-good">{band.label}</span>}
      </div>
      <div className={`font-display text-[clamp(3.6rem,15vw,5rem)] font-bold leading-[0.9] ${r.score == null ? "text-muted" : ""}`}>{r.score == null ? "—" : `${r.score}%`}</div>
      <div
        role="meter"
        aria-label="Accountability score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={r.score ?? undefined}
        aria-valuetext={r.score == null ? "Not enough sessions yet" : `${r.score}%${band ? `, ${band.label}` : ""}`}
        className="relative h-2.5 overflow-hidden rounded-full bg-sunk"
      >
        <div className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${warn ? "bg-warn" : "bg-good"}`} style={{ width: `${(fill / 110) * 100}%` }} />
        {over > 0 && (
          <div
            className="absolute inset-y-0 bg-accent"
            style={{ left: `${(100 / 110) * 100}%`, width: `${(over / 110) * 100}%`, backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / 0.35) 3px 6px)" }}
          />
        )}
        <div className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `${(100 / 110) * 100}%` }} />
      </div>
      <p className="text-sm">
        {r.sessions.done} of {r.sessions.planned} sessions
        {r.sets.planned > 0 && ` · ${r.sets.done} of ${r.sets.planned} sets`}
        {r.extras > 0 && ` · +${r.extras} extra`}
      </p>
      {r.score == null ? (
        <p className="text-sm text-muted">
          Building your score: {Math.min(r.counted, r.needed)}/{r.needed} sessions. The number shows once {r.needed} planned days have passed.
        </p>
      ) : (
        band && <p className="text-sm text-muted">{band.copy}</p>
      )}
      {r.streak > 0 && (
        <p className="text-sm font-semibold text-good">
          {r.streak} week{r.streak === 1 ? "" : "s"} kept in a row
        </p>
      )}
    </article>
  );
}

function WeekRow({ cells, labels }: { cells: string[]; labels?: string[] }) {
  return (
    <span className="grid flex-none grid-cols-7 font-mono text-sm" aria-label={labels?.join("; ")} role={labels ? "img" : undefined}>
      {cells.map((c, i) => (
        <span key={i} aria-hidden className={`w-5 text-center ${labels ? "" : "text-xs text-muted"}`}>
          {c || " "}
        </span>
      ))}
    </span>
  );
}

function HowScored() {
  return (
    <details className="card gap-1.5">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">How it&apos;s scored</summary>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>Doing the plan as shown is 100%. Every planned set, run and walk counts, and recent days count more than older ones.</li>
        <li>Rest days, cutback weeks, moved days, swapped exercises and pain or gate changes all count as sticking to the plan.</li>
        <li>Doing another day&apos;s workout instead counts in full when its intensity matches. When it doesn&apos;t, that day counts 50 to 80%.</li>
        <li>A skipped day counts half: better than a silent miss. Yesterday doesn&apos;t count against you until today is over.</li>
        <li>Extra work adds up to 8 points, but only in weeks you&apos;re already keeping and never when the plan says ease off.</li>
        <li>New bests add a little; a lift 5% lighter than last time takes a little off. The same weight again is full marks.</li>
      </ul>
    </details>
  );
}
