"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveSettings, signOut, type ActionResult } from "@/app/actions";
import { duration } from "@/lib/plan/format.ts";
import type { ProfileRow } from "@/lib/types";

const t = (s: number | null) => (s ? duration(s) : "");

export default function SettingsForm({ profile, firstRun, zones, children }: { profile: ProfileRow; firstRun: boolean; zones: string[]; children?: React.ReactNode }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveSettings, null);
  const [injury, setInjury] = useState(profile.returning_from_injury);
  // After a failed save React resets the form, so default every field to what was just typed
  const typed = state && !state.ok ? state.values : undefined;
  const val = (name: string, saved: string) => typed?.[name] ?? saved;
  const on = (name: string, saved: boolean) => (typed ? typed[name] === "on" : saved);

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
      {firstRun && <p className="text-muted">Your plan is built from these dates and times. You can change them any time.</p>}

      <form action={action} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Your name" name="display_name" defaultValue={val("display_name", profile.display_name ?? "")} />
        <div className="flex min-w-0 flex-col gap-1">
          <label className="label" htmlFor="timezone">
            Time zone
          </label>
          <select id="timezone" name="timezone" defaultValue={val("timezone", profile.timezone)} className="input">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <Field label="Current 5K" name="current_5k" defaultValue={val("current_5k", t(profile.current_5k_sec))} placeholder="35:00" required />
        <Field label="Goal 5K" name="goal_5k" defaultValue={val("goal_5k", t(profile.goal_5k_sec))} placeholder="29:59" required />
        <Field label="Running starts (a Monday)" name="start_date" type="date" defaultValue={val("start_date", profile.start_date ?? "")} required />
        <Field label="5K time trial date" name="time_trial_date" type="date" defaultValue={val("time_trial_date", profile.time_trial_date ?? "")} required />

        <label className="flex items-start gap-2.5 sm:col-span-2">
          <input type="checkbox" name="returning_from_injury" checked={injury} onChange={(e) => setInjury(e.target.checked)} className="mt-1 h-5 w-5 accent-[rgb(var(--accent))]" />
          <span>
            <b>Coming back from an injury</b>
            <br />
            <span className="text-sm text-muted">Adds a strength-only phase with return-to-run gates, and run-walk weeks to start.</span>
          </span>
        </label>
        {injury && <Field label="Strength-only phase starts" name="recovery_start" type="date" defaultValue={val("recovery_start", profile.recovery_start ?? "")} />}

        <div className="flex min-w-0 flex-col gap-1">
          <label className="label" htmlFor="weight_unit">
            Weights in
          </label>
          <select id="weight_unit" name="weight_unit" defaultValue={val("weight_unit", profile.weight_unit)} className="input">
            <option value="kg">kg</option>
            <option value="lb">lb</option>
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
            <span className="text-sm text-muted">Counts down after each ticked set (2 min for big lifts, 90 s otherwise) and beeps when it&apos;s time.</span>
          </span>
        </label>

        <div className="label mt-2 sm:col-span-2">Optional half marathon, at least 3 weeks after the time trial</div>
        <Field label="Race name" name="race_name" defaultValue={val("race_name", profile.race_name ?? "")} placeholder="Toronto Marathon: half" />
        <Field label="Race date" name="race_date" type="date" defaultValue={val("race_date", profile.race_date ?? "")} />
        <Field label="Half goal, fastest" name="half_goal_min" defaultValue={val("half_goal_min", t(profile.half_goal_min_sec))} placeholder="2:30:00" />
        <Field label="Half goal, slowest" name="half_goal_max" defaultValue={val("half_goal_max", t(profile.half_goal_max_sec))} placeholder="2:45:00" />

        <Field label="Areas to track pain (up to 3, comma-separated)" name="pain_areas" defaultValue={val("pain_areas", profile.pain_areas.join(", "))} placeholder="knee, foot, heel" wide />

        {state && !state.ok && (
          <p role="alert" className="text-sm text-bad sm:col-span-2">
            Not saved: {state.error}
          </p>
        )}
        <div className="sm:col-span-2">
          <button className="btn" disabled={pending}>
            {pending ? "Saving…" : firstRun ? "Build my plan" : "Save and re-date plan"}
          </button>
        </div>
      </form>

      {children}

      <form action={signOut}>
        <button className="btn-ghost">Sign out</button>
      </form>
    </main>
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
