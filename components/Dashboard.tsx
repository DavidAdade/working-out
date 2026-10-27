"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { weekForDate, PHASE_NAMES, type Move, type PlanSettings, type Week } from "@/lib/plan/generate.ts";
import { addDays, daysBetween, fmtShort, safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import { duration, pace, parseDuration, predict } from "@/lib/plan/format.ts";
import { goalPace } from "@/lib/plan/paces.ts";
import { planFor } from "@/lib/plan/adapt.ts";
import { setWeekMoves, toggleSkip, type LogInput } from "@/app/actions";
import { GATES, type LogRow, type ProfileRow, type SetRow } from "@/lib/types";
import { DockProvider, useDock } from "./Dock";
import CoachCard, { type SavedReview } from "./CoachCard";
import type { ExerciseInfo } from "@/lib/plan/catalog.ts";
import TodayPanel from "./TodayPanel";
import PlanPanel from "./PlanPanel";
import LogPanel from "./LogPanel";
import ProgressPanel from "./ProgressPanel";
import LibraryPanel from "./LibraryPanel";
import { VideoProvider } from "./VideoModal";
import { DateLabelsProvider, useDates } from "./DateLabels";
import { SetsProvider } from "./Sets";

type Tab = "today" | "plan" | "log" | "progress" | "library";
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "plan", label: "Plan" },
  { id: "log", label: "Log" },
  { id: "progress", label: "Progress" },
  { id: "library", label: "Library" },
];

export interface DashboardProps {
  profile: ProfileRow;
  settings: PlanSettings;
  logs: LogRow[];
  skips: string[];
  /** Workouts moved to another day of their week */
  moves: Move[];
  sets: SetRow[];
  exercises: ExerciseInfo[];
  today: string;
  /** Whether the AI check-in is available (an AI Gateway key is set) */
  ai: boolean;
  /** This week's AI check-in, if one was made */
  review: SavedReview | null;
}

export default function Dashboard(props: DashboardProps) {
  return (
    <DockProvider userId={props.profile.id} restTimer={props.profile.rest_timer}>
      <DashboardInner {...props} />
    </DockProvider>
  );
}

/** A session saved on this phone, shaped like a server row until it syncs */
function queuedLog(i: LogInput): LogRow {
  const km = i.km.trim() ? Number(i.km.replace(",", ".")) : null;
  return {
    id: i.id,
    user_id: "",
    date: i.date,
    kind: i.kind,
    title: i.title.trim() || null,
    km: km != null && Number.isFinite(km) ? km : null,
    duration_sec: i.time.trim() ? parseDuration(i.time) : null,
    rpe: i.rpe.trim() ? Number(i.rpe) : null,
    pain: i.pain,
    notes: i.notes.trim() || null,
    created_at: "",
    auto: false,
    source: "manual",
    external_id: null,
    avg_hr: null,
    queued: true,
  };
}

function DashboardInner({ profile, settings, logs: serverLogs, skips, moves, sets, exercises, today, ai, review }: DashboardProps) {
  const [tab, setTab] = useState<Tab>("today");
  const [logDate, setLogDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { queue, notify } = useDock();
  const [optimisticSkips, applySkip] = useOptimistic(skips, (cur: string[], { date, skip }: { date: string; skip: boolean }) =>
    skip ? [...cur, date] : cur.filter((d) => d !== date),
  );
  // Each change replaces one week's moves
  const [optimisticMoves, applyMoves] = useOptimistic(moves, (cur: Move[], { week, list }: { week: string; list: Move[] }) => [
    ...cur.filter((m) => m.from < week || m.from >= addDays(week, 7)),
    ...list,
  ]);

  // Sessions still waiting to sync show in the list straight away
  const logs = useMemo(() => {
    const have = new Set(serverLogs.map((l) => l.id));
    const waiting = queue.flatMap((op) => (op.t === "log" && !have.has(op.input.id) ? [queuedLog(op.input)] : []));
    return waiting.length ? [...waiting, ...serverLogs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) : serverLogs;
  }, [serverLogs, queue]);

  // A home-screen app can sit in memory overnight: when it comes back on a new day, reload today
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && todayIn(safeTimeZone(profile.timezone)) !== today) router.refresh();
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [profile.timezone, today, router]);

  const gatesPending = settings.returningFromInjury && GATES.some((g) => !profile.gates?.[g.key]);
  const { weeks, fitness, warnings } = useMemo(
    () => planFor({ settings, logs, skips: optimisticSkips, moves: optimisticMoves, gatesPending, today }),
    [settings, logs, optimisticSkips, optimisticMoves, gatesPending, today],
  );
  const thisWeek = weekForDate(weeks, today);
  const daysToTT = daysBetween(today, settings.timeTrialDate);

  const onSkip = (date: string, skip: boolean) =>
    startTransition(async () => {
      applySkip({ date, skip });
      try {
        const r = await toggleSkip(date, skip);
        if (!r.ok) notify({ text: r.error, tone: "error" });
      } catch {
        notify({ text: "No connection. That day wasn't changed.", tone: "error" });
      }
    });

  const onMoves = (week: string, list: Move[], note?: string) => {
    // What the week looked like before, for the Undo on the confirmation
    const before = optimisticMoves.filter((m) => m.from >= week && m.from < addDays(week, 7));
    startTransition(async () => {
      applyMoves({ week, list });
      try {
        const r = await setWeekMoves(week, list);
        if (!r.ok) notify({ text: r.error, tone: "error" });
        else if (note) notify({ text: note, tone: "good", action: { label: "Undo", run: () => onMoves(week, before, "Move undone.") } });
      } catch {
        notify({ text: "No connection. That day wasn't moved.", tone: "error" });
      }
    });
  };

  const openLog = (date: string) => {
    setLogDate(date);
    setTab("log");
    window.scrollTo({ top: 0 });
  };

  return (
    <DateLabelsProvider hide={profile.hide_dates} weeks={weeks}>
      <VideoProvider>
        <SetsProvider initial={sets} unit={profile.weight_unit} today={today} weeks={weeks} exercises={exercises}>
          <GoalHeader settings={settings} fitness={fitness.sec} thisWeek={thisWeek} daysToTT={daysToTT} />

          <nav className="sticky top-[env(safe-area-inset-top,0px)] z-10 grid grid-cols-5 gap-1 bg-bg py-1.5" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  window.scrollTo({ top: 0 });
                }}
                className={`min-h-11 rounded-full border px-0.5 py-2 text-[0.8rem] font-semibold sm:text-sm ${tab === t.id ? "border-ink bg-ink text-bg" : "border-line bg-surface"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "today" && (
            <TodayPanel
              profile={profile}
              settings={settings}
              weeks={weeks}
              logs={logs}
              today={today}
              fitness={fitness}
              warnings={warnings}
              onLog={openLog}
              onSkip={onSkip}
              onMoves={onMoves}
              coach={ai ? <CoachCard initial={review} onSkip={onSkip} skipped={new Set(optimisticSkips)} /> : null}
            />
          )}
          {tab === "plan" && <PlanPanel weeks={weeks} logs={logs} today={today} onSkip={onSkip} onMoves={onMoves} />}
          {tab === "log" && <LogPanel weeks={weeks} logs={logs} today={today} painAreas={profile.pain_areas} initialDate={logDate ?? today} />}
          {tab === "library" && <LibraryPanel />}
          {tab === "progress" && <ProgressPanel logs={logs} settings={settings} painAreas={profile.pain_areas} today={today} />}
        </SetsProvider>
      </VideoProvider>
    </DateLabelsProvider>
  );
}

function GoalHeader({ settings, fitness, thisWeek, daysToTT }: { settings: PlanSettings; fitness: number; thisWeek: Week | undefined; daysToTT: number }) {
  const dates = useDates();
  const goal = settings.goal5kSec;
  const tenK = predict(goal, 5, 10, 1.06);
  return (
    <header className="relative flex flex-col gap-3 rounded-md border border-line bg-surface px-[22px] pb-[18px] pt-4" aria-label="Goal">
      <span className="bib-pin left-[9px] top-[9px]" />
      <span className="bib-pin bottom-[9px] left-[9px]" />
      <span className="bib-pin bottom-[9px] right-[9px]" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1.5">
          <div className="label">5K time trial</div>
          <div className="text-sm font-semibold">{dates.long(settings.timeTrialDate)}</div>
        </div>
        <Link href="/settings" aria-label="Settings" className="-mr-3 flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted active:bg-sunk">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-[clamp(3.6rem,15vw,5.6rem)] font-bold leading-[0.9] text-accent">SUB-{Math.ceil(goal / 60)}</div>
          {thisWeek && (
            <div className="label mt-1.5">
              {PHASE_NAMES[thisWeek.phase]}
              {thisWeek.index ? ` · week ${thisWeek.index}` : ""}
            </div>
          )}
        </div>
        <div className="flex flex-none flex-col items-end pb-1">
          <span className="font-display text-[2.2rem] font-bold leading-none">{daysToTT > 0 ? (dates.hide ? Math.ceil(daysToTT / 7) : daysToTT) : daysToTT === 0 ? "Today" : "Done"}</span>
          <span className="label">{dates.hide ? "weeks to go" : "days to go"}</span>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 border-t-2 border-dashed border-line pt-3">
        <Stat label="Now" value={duration(fitness)} />
        <Stat label="Goal pace" value={`${pace(goalPace(goal))}/km`} />
        <Stat label="10K" value={`~${duration(Math.round(tenK / 30) * 30)}`} />
      </dl>
      {settings.raceDate && (
        <p className="-mt-1 text-sm text-muted">
          Then {settings.raceName || "the half"} · {dates.hide ? dates.long(settings.raceDate) : fmtShort(settings.raceDate)}
        </p>
      )}
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="truncate font-mono text-base font-medium">{value}</dd>
    </div>
  );
}
