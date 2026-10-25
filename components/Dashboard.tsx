"use client";

import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generatePlan, weekForDate, PHASE_NAMES, type PlanSettings, type Week } from "@/lib/plan/generate.ts";
import { daysBetween, fmtShort, safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import { duration, pace, parseDuration, predict } from "@/lib/plan/format.ts";
import { fitness5k, goalPace } from "@/lib/plan/paces.ts";
import { painWarnings } from "@/lib/plan/warnings.ts";
import { adaptPlan } from "@/lib/plan/adapt.ts";
import { toggleSkip, type LogInput } from "@/app/actions";
import { GATES, type LogRow, type ProfileRow, type SetRow } from "@/lib/types";
import { DockProvider, useDock } from "./Dock";
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
  sets: SetRow[];
  exercises: ExerciseInfo[];
  today: string;
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

function DashboardInner({ profile, settings, logs: serverLogs, skips, sets, exercises, today }: DashboardProps) {
  const [tab, setTab] = useState<Tab>("today");
  const [logDate, setLogDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { queue, notify } = useDock();
  const [optimisticSkips, applySkip] = useOptimistic(skips, (cur: string[], { date, skip }: { date: string; skip: boolean }) =>
    skip ? [...cur, date] : cur.filter((d) => d !== date),
  );

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

  const fitness = useMemo(() => fitness5k(settings.current5kSec, logs, today), [settings.current5kSec, logs, today]);
  const warnings = useMemo(() => painWarnings(logs, today), [logs, today]);
  const gatesPending = settings.returningFromInjury && GATES.some((g) => !profile.gates?.[g.key]);
  const weeks = useMemo(
    () => adaptPlan(generatePlan(settings, { skips: optimisticSkips, fitness5kSec: fitness.sec }), { today, gatesPending, warnings }),
    [settings, optimisticSkips, fitness.sec, today, gatesPending, warnings],
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
            <TodayPanel profile={profile} settings={settings} weeks={weeks} logs={logs} today={today} fitness={fitness} warnings={warnings} onLog={openLog} onSkip={onSkip} />
          )}
          {tab === "plan" && <PlanPanel weeks={weeks} logs={logs} today={today} onSkip={onSkip} />}
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
    <header className="relative grid grid-cols-[1fr_auto] items-end gap-x-4 gap-y-1 rounded-md border border-line bg-surface px-[22px] pb-[18px] pt-5" aria-label="Goal">
      <span className="bib-pin left-[9px] top-[9px]" />
      <span className="bib-pin right-[9px] top-[9px]" />
      <span className="bib-pin bottom-[9px] left-[9px]" />
      <span className="bib-pin bottom-[9px] right-[9px]" />
      <div className="col-span-2 flex flex-wrap justify-between gap-2">
        <span className="label">5K time trial · {dates.long(settings.timeTrialDate)}</span>
        <span className="label">{thisWeek ? `${PHASE_NAMES[thisWeek.phase]}${thisWeek.index ? ` · week ${thisWeek.index}` : ""}` : ""}</span>
      </div>
      <div className="font-display text-[clamp(3.6rem,15vw,5.6rem)] font-bold leading-[0.9] text-accent">SUB-{Math.ceil(goal / 60)}</div>
      <div className="flex flex-col items-end pb-1.5">
        <span className="font-display text-[2rem] font-bold leading-none">{daysToTT > 0 ? (dates.hide ? Math.ceil(daysToTT / 7) : daysToTT) : daysToTT === 0 ? "Today" : "Done"}</span>
        <span className="label">{dates.hide ? "weeks to go" : "days to go"}</span>
      </div>
      <div className="col-span-2 mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t-2 border-dashed border-line pt-2.5 text-sm">
        <span>
          Now <b className="font-mono font-medium">{duration(fitness)}</b>
        </span>
        <span>
          Goal pace <b className="font-mono font-medium">{pace(goalPace(goal))}/km</b>
        </span>
        <span>
          10K target <b className="font-mono font-medium">~{duration(Math.round(tenK / 30) * 30)}</b>
        </span>
        {settings.raceDate && (
          <span>
            {settings.raceName || "Half"} <b className={dates.hide ? "font-semibold" : "font-mono font-medium"}>{dates.hide ? dates.long(settings.raceDate) : fmtShort(settings.raceDate)}</b>
          </span>
        )}
        <Link href="/settings" className="-my-3 ml-auto inline-flex min-h-11 items-center px-1 text-muted underline underline-offset-2">
          Settings
        </Link>
      </div>
    </header>
  );
}
