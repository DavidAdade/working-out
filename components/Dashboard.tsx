"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { generatePlan, weekForDate, PHASE_NAMES, type PlanSettings } from "@/lib/plan/generate.ts";
import { daysBetween, fmtLong } from "@/lib/plan/dates.ts";
import { duration, pace, predict } from "@/lib/plan/format.ts";
import { toggleSkip } from "@/app/actions";
import type { LogRow, ProfileRow } from "@/lib/types";
import TodayPanel from "./TodayPanel";
import PlanPanel from "./PlanPanel";
import LogPanel from "./LogPanel";
import ProgressPanel from "./ProgressPanel";
import { VideoProvider } from "./VideoModal";

type Tab = "today" | "plan" | "log" | "progress";
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "plan", label: "Plan" },
  { id: "log", label: "Log" },
  { id: "progress", label: "Progress" },
];

export interface DashboardProps {
  profile: ProfileRow;
  settings: PlanSettings;
  logs: LogRow[];
  skips: string[];
  today: string;
}

export default function Dashboard({ profile, settings, logs, skips, today }: DashboardProps) {
  const [tab, setTab] = useState<Tab>("today");
  const [logDate, setLogDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticSkips, applySkip] = useOptimistic(skips, (cur: string[], { date, skip }: { date: string; skip: boolean }) =>
    skip ? [...cur, date] : cur.filter((d) => d !== date),
  );

  const weeks = useMemo(() => generatePlan(settings, { skips: optimisticSkips }), [settings, optimisticSkips]);
  const thisWeek = weekForDate(weeks, today);
  const daysToTT = daysBetween(today, settings.timeTrialDate);

  const onSkip = (date: string, skip: boolean) =>
    startTransition(async () => {
      applySkip({ date, skip });
      await toggleSkip(date, skip);
    });

  const openLog = (date: string) => {
    setLogDate(date);
    setTab("log");
    window.scrollTo({ top: 0 });
  };

  const goal = settings.goal5kSec;
  const tenK = predict(goal, 5, 10, 1.06);

  return (
    <VideoProvider>
      <header className="relative grid grid-cols-[1fr_auto] items-end gap-x-4 gap-y-1 rounded-md border border-line bg-surface px-[22px] pb-[18px] pt-5" aria-label="Goal">
        <span className="bib-pin left-[9px] top-[9px]" />
        <span className="bib-pin right-[9px] top-[9px]" />
        <span className="bib-pin bottom-[9px] left-[9px]" />
        <span className="bib-pin bottom-[9px] right-[9px]" />
        <div className="col-span-2 flex flex-wrap justify-between gap-2">
          <span className="label">5K time trial · {fmtLong(settings.timeTrialDate)}</span>
          <span className="label">{thisWeek ? `${PHASE_NAMES[thisWeek.phase]}${thisWeek.index ? ` · week ${thisWeek.index}` : ""}` : ""}</span>
        </div>
        <div className="font-display text-[clamp(3.6rem,15vw,5.6rem)] font-bold leading-[0.9] text-accent">SUB-{Math.ceil(goal / 60)}</div>
        <div className="flex flex-col items-end pb-1.5">
          <span className="font-display text-[2rem] font-bold leading-none">{daysToTT > 0 ? daysToTT : daysToTT === 0 ? "Today" : "Done"}</span>
          <span className="label">days to go</span>
        </div>
        <div className="col-span-2 mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t-2 border-dashed border-line pt-2.5 text-sm">
          <span>
            Now <b className="font-mono font-medium">{duration(settings.current5kSec)}</b>
          </span>
          <span>
            Goal pace <b className="font-mono font-medium">{pace(goal / 5)}/km</b>
          </span>
          <span>
            10K target <b className="font-mono font-medium">~{duration(Math.round(tenK / 30) * 30)}</b>
          </span>
          {settings.raceDate && (
            <span>
              {settings.raceName || "Half"} <b className="font-mono font-medium">{fmtLong(settings.raceDate).slice(4)}</b>
            </span>
          )}
          <Link href="/settings" className="ml-auto text-muted underline underline-offset-2">
            Settings
          </Link>
        </div>
      </header>

      <nav className="sticky top-[env(safe-area-inset-top,0px)] z-10 grid grid-cols-4 gap-1 bg-bg py-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              window.scrollTo({ top: 0 });
            }}
            className={`min-h-11 rounded-full border px-1 py-2 text-sm font-semibold ${tab === t.id ? "border-ink bg-ink text-bg" : "border-line bg-surface"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "today" && <TodayPanel profile={profile} settings={settings} weeks={weeks} logs={logs} today={today} onLog={openLog} onSkip={onSkip} />}
      {tab === "plan" && <PlanPanel weeks={weeks} logs={logs} today={today} onSkip={onSkip} />}
      {tab === "log" && <LogPanel weeks={weeks} logs={logs} today={today} painAreas={profile.pain_areas} initialDate={logDate ?? today} />}
      {tab === "progress" && <ProgressPanel logs={logs} settings={settings} painAreas={profile.pain_areas} />}
    </VideoProvider>
  );
}
