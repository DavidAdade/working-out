"use client";

import Link from "next/link";
import { formatOwnRuns } from "@/lib/plan/ownruns.ts";
import { useActionState, useEffect, useState } from "react";
import { saveSettings, setPassword, signOut, type ActionResult } from "@/app/actions";
import { addDays, mondayOf, todayIn } from "@/lib/plan/dates.ts";
import { DEFAULT_DAYS, MAX_TRAIN_DAYS, MIN_TRAIN_DAYS, MODE_NAMES, PROGRAM_MIN_DAYS, RUN_MODES, runMode, type RunMode } from "@/lib/plan/shape.ts";

const MODE_HELP: Record<RunMode, string> = {
  program: "Runs with paces and tests, building to a 5K time trial on a date you set, with the lifting around them.",
  easy: "The lifting plan with two or three easy runs a week. No paces, no tests, no end date.",
  none: "The lifting plan on its own. No end date.",
};
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
import { distUnit, duration } from "@/lib/plan/format.ts";
import { REST_CHOICES, type ProfileRow } from "@/lib/types";
import RestPush from "./RestPush";
import { GoalsToggle, useGoalsHidden } from "./GoalsHidden";
import { clearSnapshot } from "@/lib/offline";

const t = (s: number | null) => (s ? duration(s) : "");

export default function SettingsForm({
  profile,
  firstRun,
  zones,
  vapidKey,
  children,
}: {
  profile: ProfileRow;
  firstRun: boolean;
  zones: string[];
  /** Set when the server can send pushes; shows the rest notification toggle */
  vapidKey?: string | null;
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveSettings, null);
  const [injury, setInjury] = useState(profile.returning_from_injury);
  // Whether the person runs, and the days they train. The 5K program's own fields only show (and are only
  // required) for it; they stay in the form either way, so switching back finds them as they were
  const [mode, setMode] = useState<RunMode>(runMode(profile.run_mode));
  const program = mode === "program";
  const [days, setDays] = useState<number[] | null>(profile.train_days ?? null);
  const picked = days ?? DEFAULT_DAYS[mode];
  const minDays = program ? PROGRAM_MIN_DAYS : MIN_TRAIN_DAYS;
  const daysOk = picked.length >= minDays && picked.length <= MAX_TRAIN_DAYS;
  // Goal times and the race can be hidden for screenshots (GoalsHidden.tsx); never while setting up
  const [goalsHidden, setGoalsHidden] = useGoalsHidden();
  const hideGoals = goalsHidden && !firstRun;
  // After a failed save React resets the form, so default every field to what was just typed
  const typed = state && !state.ok ? state.values : undefined;
  const val = (name: string, saved: string) => typed?.[name] ?? saved;
  const on = (name: string, saved: boolean) => (typed ? typed[name] === "on" : saved);
  // Setting up: start from this phone's time zone and the coming Monday, not from anyone else's defaults.
  // Read after the page loads, since the server can't know either
  const [here, setHere] = useState<{ zone: string; monday: string } | null>(null);
  useEffect(() => {
    if (!firstRun) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const zone = zones.includes(tz) ? tz : profile.timezone;
      const today = todayIn(zone);
      setHere({ zone, monday: mondayOf(today) === today ? today : addDays(mondayOf(today), 7) });
    } catch {}
  }, [firstRun, zones, profile.timezone]);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">{firstRun ? "Set up your plan" : "Plan settings"}</h1>
        {!firstRun && (
          <Link href="/" className="btn-ghost">
            Back
          </Link>
        )}
      </div>
      {firstRun && <p className="text-muted">Your plan is built from these answers. You can change them any time.</p>}

      <form action={action} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Your name" name="display_name" defaultValue={val("display_name", profile.display_name ?? "")} />
        <div className="flex min-w-0 flex-col gap-1">
          <label className="label" htmlFor="timezone">
            Time zone
          </label>
          <select key={here?.zone ?? "saved"} id="timezone" name="timezone" defaultValue={val("timezone", here?.zone ?? profile.timezone)} className="input">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <legend className="label mb-1">Do you run?</legend>
          {RUN_MODES.map((m) => (
            <label key={m} className={`flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2 ${mode === m ? "border-accent bg-sunk" : "border-line"}`}>
              <input type="radio" name="run_mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1 h-5 w-5 flex-none accent-[rgb(var(--accent))]" />
              <span>
                <b>{MODE_NAMES[m]}</b>
                <br />
                <span className="text-sm text-muted">{MODE_HELP[m]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <legend className="label mb-1">Training days</legend>
          <div className="grid grid-cols-7 gap-1">
            {DAY_LETTERS.map((d, i) => {
              const on = picked.includes(i);
              return (
                <label key={i} className={`flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-muted"}`}>
                  <input type="checkbox" name="train_days" value={i} checked={on} onChange={() => setDays(on ? picked.filter((x) => x !== i) : [...picked, i].sort((a, b) => a - b))} className="sr-only" aria-label={DAY_NAMES[i]} />
                  <span aria-hidden>{d}</span>
                </label>
              );
            })}
          </div>
          <span className={`text-xs ${daysOk ? "text-muted" : "text-bad"}`}>
            {daysOk
              ? `${picked.length} days a week. ${picked.length <= 3 ? "Sessions are combined, so each one is longer." : picked.length === 6 ? "One rest day a week." : "The week's sessions are spread over them."}`
              : `Pick ${minDays} to ${MAX_TRAIN_DAYS} days${program ? ": the 5K program has three runs and two leg days" : ""}.`}
          </span>
        </fieldset>

        <div className={program ? "contents" : "hidden"}>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <span className="label">{hideGoals ? "Your 5K times: hidden" : "Your 5K times"}</span>
          {!firstRun && <GoalsToggle hidden={hideGoals} onChange={setGoalsHidden} />}
        </div>
        {/* Hidden fields stay in the form, so saving keeps them */}
        <div className={hideGoals ? "hidden" : "contents"}>
          <Field label="Current 5K" name="current_5k" defaultValue={val("current_5k", t(profile.current_5k_sec))} placeholder="35:00" required={program} />
          <Field label="Goal 5K" name="goal_5k" defaultValue={val("goal_5k", t(profile.goal_5k_sec))} placeholder="29:59" required={program} />
        </div>
        </div>
        <Field key={here?.monday ?? "saved"} label={program ? "Running starts (a Monday)" : "Plan starts (a Monday)"} name="start_date" type="date" defaultValue={val("start_date", profile.start_date ?? here?.monday ?? "")} required />
        <div className={program ? "contents" : "hidden"}>
        <Field label="5K time trial date" name="time_trial_date" type="date" defaultValue={val("time_trial_date", profile.time_trial_date ?? "")} required={program} hint="A Friday, Saturday or Sunday." />

        <label className="flex items-start gap-2.5 sm:col-span-2">
          <input type="checkbox" name="returning_from_injury" checked={injury} onChange={(e) => setInjury(e.target.checked)} className="mt-1 h-5 w-5 accent-[rgb(var(--accent))]" />
          <span>
            <b>Coming back from an injury</b>
            <br />
            <span className="text-sm text-muted">Adds a strength-only phase with return-to-run gates, and run-walk weeks to start.</span>
          </span>
        </label>
        {injury && <Field label="Strength-only phase starts" name="recovery_start" type="date" defaultValue={val("recovery_start", profile.recovery_start ?? "")} />}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label className="label" htmlFor="weight_unit">
            Weights in
          </label>
          <select id="weight_unit" name="weight_unit" defaultValue={val("weight_unit", profile.weight_unit)} className="input">
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>
        <div className={`min-w-0 flex-col gap-1 ${mode === "none" ? "hidden" : "flex"}`}>
          <label className="label" htmlFor="distance_unit">
            Distances in
          </label>
          <select id="distance_unit" name="distance_unit" defaultValue={val("distance_unit", distUnit(profile.distance_unit))} className="input">
            <option value="km">kilometres</option>
            <option value="mi">miles</option>
          </select>
        </div>

        <label className="flex items-start gap-2.5 sm:col-span-2">
          <input type="checkbox" name="hide_dates" defaultChecked={on("hide_dates", profile.hide_dates)} className="mt-1 h-5 w-5 accent-[rgb(var(--accent))]" />
          <span>
            <b>Hide calendar dates</b>
            <br />
            <span className="text-sm text-muted">Show the plan as Week 1, Week 2… and weekdays only. The dates above still set the schedule.</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 sm:col-span-2">
          <input type="checkbox" name="rest_timer" defaultChecked={on("rest_timer", profile.rest_timer)} className="mt-1 h-5 w-5 accent-[rgb(var(--accent))]" />
          <span>
            <b>Rest timer</b>
            <br />
            <span className="text-sm text-muted">
              Counts down after each ticked set, ticks for the last 5 seconds and beeps when it&apos;s time. Sounds play over your music, never instead of it (silent when the ringer is off).
            </span>
          </span>
        </label>
        <div className="flex min-w-0 flex-col gap-1">
          <label className="label" htmlFor="rest_seconds">
            Rest between sets
          </label>
          <select id="rest_seconds" name="rest_seconds" defaultValue={val("rest_seconds", profile.rest_seconds ? String(profile.rest_seconds) : "")} className="input">
            <option value="">Auto (by exercise)</option>
            {REST_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s < 120 ? `${s} s` : `${s / 60} min`}
              </option>
            ))}
          </select>
        </div>
        {vapidKey && <RestPush userId={profile.id} vapidKey={vapidKey} />}

        <div className={program ? "contents" : "hidden"}>
        <div className="mt-2 flex items-center justify-between gap-2 sm:col-span-2">
          <span className="label">{hideGoals ? "Half marathon: hidden" : "Optional half marathon, at least 3 weeks after the time trial"}</span>
          {!firstRun && <GoalsToggle hidden={hideGoals} onChange={setGoalsHidden} />}
        </div>
        <div className={hideGoals ? "hidden" : "contents"}>
          <Field label="Race name" name="race_name" defaultValue={val("race_name", profile.race_name ?? "")} placeholder="City half marathon" />
          <Field label="Race date" name="race_date" type="date" defaultValue={val("race_date", profile.race_date ?? "")} />
          <Field label="Half goal, fastest" name="half_goal_min" defaultValue={val("half_goal_min", t(profile.half_goal_min_sec))} placeholder="2:30:00" />
          <Field label="Half goal, slowest" name="half_goal_max" defaultValue={val("half_goal_max", t(profile.half_goal_max_sec))} placeholder="2:45:00" />
        </div>

        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <label className="label mt-2" htmlFor="own_runs">
            Runs from another running plan (optional)
          </label>
          <textarea
            id="own_runs"
            name="own_runs"
            rows={6}
            defaultValue={val("own_runs", formatOwnRuns(profile.own_runs ?? [], distUnit(profile.distance_unit)))}
            placeholder={"2026-11-16, 5, Easy Run\n2026-11-18, 6, Long Run\n2026-11-21, 5, 400m Repeats, hard"}
            className="input h-auto whitespace-pre font-mono"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="text-xs text-muted">
            One run per line: date, distance, name (a bare number is in your unit; &quot;5 km&quot; or &quot;3 mi&quot; also work). Add &quot;hard&quot; for intervals or tempo, &quot;race&quot; for a race. In the weeks these cover, they are your running days and the lifting is placed around them: abs
            after a run of 5.5 km or more, legs never the day before a run, upper body twice a week on days of its own. They take over from the day you first save the list; earlier days stay as they were.
          </span>
        </div>

        </div>

        <Field label="Areas to track pain (up to 3, comma-separated)" name="pain_areas" defaultValue={val("pain_areas", firstRun ? "" : profile.pain_areas.join(", "))} placeholder="knee, shoulder, lower back" hint={firstRun ? "Leave empty if nothing hurts. Each area gets a quick morning check-in." : undefined} wide />

        {state && !state.ok && (
          <p role="alert" className="text-sm text-bad sm:col-span-2">
            Not saved: {state.error}
          </p>
        )}
        <div className="sm:col-span-2">
          <button className="btn" disabled={pending}>
            {pending ? "Saving…" : firstRun ? "Build my plan" : program ? "Save and re-date plan" : "Save"}
          </button>
        </div>
      </form>

      {children}

      {!firstRun && <PasswordForm />}

      {/* Forget the data saved on this phone for offline use (the login page clears it too) */}
      <form action={signOut} onSubmit={forgetPhone}>
        <button className="btn-ghost">Sign out</button>
      </form>
    </main>
  );
}

/** Signing out of this phone: drop what it saved for offline use, and stop its notifications for this account */
function forgetPhone() {
  void clearSnapshot();
  try {
    void navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => reg?.pushManager?.getSubscription())
      .then((sub) => {
        if (!sub) return;
        void fetch("/api/push/subscribe", { method: "DELETE", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        // Even if that request loses the race with signing out, the phone stops listening and the server forgets the address on its next try
        void sub.unsubscribe().catch(() => {});
      })
      .catch(() => {});
  } catch {}
}

/** A password of the person's own: an invite or emailed link opens in Safari, but the home-screen app needs one */
function PasswordForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(setPassword, null);
  return (
    <details className="card gap-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Set or change your password</summary>
      <p className="text-sm text-muted">Sign in with your email and this password, including in the app on your Home Screen.</p>
      <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label className="label" htmlFor="new_password">
            New password
          </label>
          <input id="new_password" name="new_password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label className="label" htmlFor="new_password_again">
            Again
          </label>
          <input id="new_password_again" name="new_password_again" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </div>
        {state && !state.ok && (
          <p role="alert" className="text-sm text-bad sm:col-span-2">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p role="status" className="text-sm text-good sm:col-span-2">
            Password saved.
          </p>
        )}
        <div className="sm:col-span-2">
          <button className="btn" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </button>
        </div>
      </form>
    </details>
  );
}

function Field(props: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string; hint?: string; required?: boolean; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${props.wide ? "sm:col-span-2" : ""}`}>
      <label className="label" htmlFor={props.name}>
        {props.label}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        required={props.required}
        className="input"
      />
      {props.hint && <span className="text-xs text-muted">{props.hint}</span>}
    </div>
  );
}
