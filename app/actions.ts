"use server";

import { revalidatePath } from "next/cache";
import { parseOwnRuns } from "@/lib/plan/ownruns.ts";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { paged } from "@/lib/supabase/paged";
import { cleanBlocks } from "@/lib/plan/snapshots.ts";
import { cleanDays, goalOf, runMode, DEFAULT_DAYS, MAX_TRAIN_DAYS, MIN_TRAIN_DAYS, PROGRAM_MIN_DAYS } from "@/lib/plan/shape.ts";
import { checkUser } from "@/lib/supabase/user";
import { duration, parseDuration } from "@/lib/plan/format.ts";
import { addDays, daysBetween, isMonday, isTimeZone, mondayOf, safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import { planFor, planUntil } from "@/lib/plan/adapt.ts";
import { builtinRows } from "@/lib/plan/catalog.ts";
import { isEquipment } from "@/lib/plan/equipment.ts";
import { aiEnabled, generateReview, type Review } from "@/lib/coach/review";
import { canCopy, generatePlan, MIN_RACE_GAP_WEEKS, type DayCopy, type Move } from "@/lib/plan/generate.ts";
import { GATES, REST_CHOICES, countsForDay, profileToSettings, type LogKind, type LogRow, type ProfileRow, type SetRow, type Unit } from "@/lib/types";
import { exerciseByKey, type Load } from "@/lib/plan/exercises.ts";
import type { Swap } from "@/lib/plan/swaps.ts";
import { SUPERSET_MAX, type Superset } from "@/lib/plan/supersets.ts";
import { customKey, youtubeId } from "@/lib/plan/catalog.ts";
import { MUSCLES } from "@/lib/plan/muscles.ts";
import { AUTO_END_MS, clampEnd, isLocked, sessionDateFor, type WorkoutSession } from "@/lib/plan/workout.ts";
import { cancelPush, pushEnabled, schedulePush } from "@/lib/push";

/** `values` echoes a failed form back, so the form can keep what was typed (React resets it after every action) */
export type ActionResult = { ok: true } | { ok: false, error: string, values?: Record<string, string> };

async function requireUser() {
  const supabase = await createClient();
  const { user, transient } = await checkUser(supabase);
  // A hiccup throws like a dropped connection, so the outbox keeps the write and retries; only a real sign-out goes to /login
  if (transient) throw new Error("Couldn't reach the server");
  if (!user) redirect("/login");
  return { supabase, user };
}

/* ---------- auth ---------- */
export async function sendMagicLink(_: unknown, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  // The test and demo accounts live on public inboxes: a link sent there is a link for anyone. Password only
  if (/@mailinator\.com$/.test(email)) return { ok: false, error: "This account signs in with its password." };
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Only people you have invited in Supabase can sign in.
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { ok: false, error: "That email can't sign in yet. Ask the owner to invite you." };
  return { ok: true };
}

/** Password sign-in. Works inside a home-screen app, where an emailed link would open in Safari instead. */
export async function signInWithPassword(_: unknown, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Wrong email or password." };
  redirect("/");
}

/** Set or change the password, so the person can sign in inside the home-screen app with one only they know. */
export async function setPassword(_: unknown, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const password = String(form.get("new_password") ?? "");
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  if (password !== String(form.get("new_password_again") ?? "")) return { ok: false, error: "The two passwords don't match." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: /different|same/i.test(error.message) ? "That's already your password." : "Couldn't save the password. Sign in again and retry." };
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/* ---------- settings ---------- */
export async function saveSettings(_: unknown, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const str = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const dur = (k: string) => parseDuration(str(k));
  const fail = (error: string): ActionResult => ({ ok: false, error, values: Object.fromEntries([...form].filter((e): e is [string, string] => typeof e[1] === "string")) });
  const injury = form.get("returning_from_injury") === "on";
  const ownRuns = parseOwnRuns(String(form.get("own_runs") ?? ""), form.get("distance_unit") === "mi" ? "mi" : "km");
  const mode = runMode(form.get("run_mode"));
  const program = mode === "program";
  const picked = form.getAll("train_days").map(Number);
  const trainDays = cleanDays(picked, mode);
  const update = {
    run_mode: mode,
    // The plan's own days are saved as none chosen, so a later change to them reaches the person
    train_days: trainDays && trainDays.join() !== DEFAULT_DAYS[mode].join() ? trainDays : null,
    display_name: str("display_name"),
    timezone: str("timezone") ?? "America/Toronto",
    rest_timer: form.get("rest_timer") === "on",
    rest_seconds: REST_CHOICES.includes(Number(form.get("rest_seconds"))) ? Number(form.get("rest_seconds")) : null,
    start_date: str("start_date"),
    recovery_start: injury ? str("recovery_start") : null,
    returning_from_injury: injury,
    hide_dates: form.get("hide_dates") === "on",
    weight_unit: form.get("weight_unit") === "lb" ? "lb" : "kg",
    distance_unit: form.get("distance_unit") === "mi" ? "mi" : "km",
    time_trial_date: str("time_trial_date"),
    race_date: str("race_date"),
    race_name: str("race_name"),
    current_5k_sec: dur("current_5k"),
    goal_5k_sec: dur("goal_5k"),
    half_goal_min_sec: dur("half_goal_min"),
    half_goal_max_sec: dur("half_goal_max"),
    pain_areas: (str("pain_areas") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 3),
    own_runs: ownRuns.runs,
  };
  // A run list saved for the first time takes over from today: the days already behind keep what they showed
  const { data: before } = await supabase.from("profiles").select("own_runs, own_runs_from").eq("id", user.id).maybeSingle<{ own_runs: unknown[] | null; own_runs_from: string | null }>();
  const hadRuns = Array.isArray(before?.own_runs) && before.own_runs.length > 0;
  const own_runs_from = !ownRuns.runs.length ? null : hadRuns ? before?.own_runs_from ?? null : todayIn(safeTimeZone(update.timezone));
  if (!trainDays) return fail(program ? `The 5K program needs ${PROGRAM_MIN_DAYS} to ${MAX_TRAIN_DAYS} training days: three runs and two leg days don't fit in fewer.` : `Pick ${MIN_TRAIN_DAYS} to ${MAX_TRAIN_DAYS} training days.`);
  if (!update.start_date) return fail("Add a start date.");
  // The plan's weeks run Monday to Sunday: any other day would quietly start on the Monday before it
  if (/^\d{4}-\d{2}-\d{2}$/.test(update.start_date) && !isMonday(update.start_date)) return fail(`The plan starts on a Monday. The nearest are ${mondayOf(update.start_date)} and ${addDays(mondayOf(update.start_date), 7)}.`);
  if (!isTimeZone(update.timezone)) return fail("Pick a time zone from the list.");
  if (!program) {
    // No running goal: the 5K program's own settings stay as they were, for whenever it's switched back on
    const { run_mode, train_days, display_name, timezone, rest_timer, rest_seconds, start_date, hide_dates, weight_unit, distance_unit, pain_areas } = update;
    const { error } = await supabase.from("profiles").update({ run_mode, train_days, display_name, timezone, rest_timer, rest_seconds, start_date, hide_dates, weight_unit, distance_unit, pain_areas }).eq("id", user.id);
    if (error) return fail("Couldn't save settings. Try again.");
    revalidatePath("/");
    redirect("/");
  }
  if (ownRuns.bad.length) return fail(`Couldn't read this run: "${ownRuns.bad[0].slice(0, 60)}". Write each as: 2026-11-16, 5, Easy Run (or "3 mi")`);
  if (ownRuns.runs.length > 400) return fail("That's more than 400 runs. Keep the list to the coming months.");
  if (!update.start_date || !update.time_trial_date) return fail("Add a start date and a time trial date.");
  // The plan's weeks run Monday to Sunday: any other day would quietly start on the Monday before it
  if (/^\d{4}-\d{2}-\d{2}$/.test(update.start_date) && !isMonday(update.start_date)) return fail(`Running starts on a Monday. The nearest are ${mondayOf(update.start_date)} and ${addDays(mondayOf(update.start_date), 7)}.`);
  if (!update.current_5k_sec || !update.goal_5k_sec) return fail("5K times should look like 35:00.");
  if (update.goal_5k_sec >= update.current_5k_sec) return fail("The goal 5K should be faster than your current time.");
  if (update.time_trial_date <= update.start_date) return fail("The time trial has to come after the start date.");
  // Monday to Thursday would land on that week's Friday anyway: say so instead of moving it quietly
  if (/^\d{4}-\d{2}-\d{2}$/.test(update.time_trial_date) && daysBetween(mondayOf(update.time_trial_date), update.time_trial_date) < 4) return fail(`Put the time trial on a Friday, Saturday or Sunday: the week's easy runs come before it. That week's Friday is ${addDays(mondayOf(update.time_trial_date), 4)}.`);
  if (!isTimeZone(update.timezone)) return fail("Pick a time zone from the list.");
  if (update.recovery_start && update.recovery_start >= update.start_date) return fail("The strength-only phase has to start before running does.");
  if (update.race_date && daysBetween(update.time_trial_date, update.race_date) < MIN_RACE_GAP_WEEKS * 7)
    return fail(`Put the race at least ${MIN_RACE_GAP_WEEKS} weeks after the time trial, so it gets its own taper.`);
  const { error } = await supabase.from("profiles").update({ ...update, own_runs_from }).eq("id", user.id);
  if (error) return fail("Couldn't save settings. Try again.");
  revalidatePath("/");
  redirect("/");
}

export async function setGate(key: string, value: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!/^[a-z]{1,20}$/.test(key)) return { ok: false, error: "Unknown gate." };
  // One key at a time in the database, so two devices never overwrite each other's ticks
  const { error } = await supabase.rpc("set_gate", { p_key: key, p_value: value });
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/");
  return { ok: true };
}

export async function setStartDate(date: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isMonday(date)) return { ok: false, error: "Pick a Monday." };
  const { data } = await supabase.from("profiles").select("time_trial_date").eq("id", user.id).single<{ time_trial_date: string | null }>();
  if (data?.time_trial_date && date > addDays(data.time_trial_date, -7 * 8)) return { ok: false, error: "That leaves less than 8 weeks before the time trial. Move the time trial in Settings first." };
  const { error } = await supabase.from("profiles").update({ start_date: date }).eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't change the start date." };
  revalidatePath("/");
  return { ok: true };
}

/* ---------- skip days ---------- */
export async function toggleSkip(date: string, skip: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = skip
    ? await supabase.from("day_overrides").upsert({ user_id: user.id, date, status: "skipped" })
    : await supabase.from("day_overrides").delete().eq("user_id", user.id).eq("date", date);
  if (error) return { ok: false, error: "Couldn't update that day." };
  revalidatePath("/");
  return { ok: true };
}

/* ---------- move days within a week ---------- */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Replaces one week's moves; the list comes from moveDay/catchUp, which already checked it against the plan. */
export async function setWeekMoves(week: string, moves: Move[]): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const end = ISO.test(week) && isMonday(week) ? addDays(week, 7) : null;
  const inWeek = (d: unknown): d is string => typeof d === "string" && ISO.test(d) && !!end && d >= week && d < end;
  const ok = Array.isArray(moves) && moves.length <= 7 && moves.every((m) => inWeek(m?.from) && inWeek(m?.to) && m.from !== m.to);
  if (!ok || new Set(moves.map((m) => m.from)).size !== moves.length || new Set(moves.map((m) => m.to)).size !== moves.length) return { ok: false, error: "That move doesn't fit this week." };
  const { error } = await supabase.rpc("set_week_moves", { p_week: week, p_moves: moves.map(({ from, to }) => ({ from, to })) });
  if (error) return { ok: false, error: "Couldn't move that day." };
  revalidatePath("/");
  return { ok: true };
}

/* ---------- swap an exercise on one plan day ---------- */
const KEY = /^[a-z0-9-]{1,40}$/;

/**
 * `from` is the template exercise on the plan day `planDate` (the plan's own date, before moves);
 * `to` null, or the same as `from`, puts the original back. Logged sets are never touched.
 */
export async function setSwap(planDate: string, from: string, to: string | null): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!ISO.test(planDate) || !KEY.test(from) || !exerciseByKey(from) || (to != null && !KEY.test(to))) return { ok: false, error: "Couldn't swap that exercise." };
  // A swap on a day that's behind, with sets logged under it, stays: taking it back would leave those sets
  // outside the plan and the day short in the Score. (Today it can still be put back mid-workout.)
  const { data: had } = await supabase.from("exercise_swaps").select("to_key").eq("user_id", user.id).eq("plan_date", planDate).eq("from_key", from).maybeSingle<{ to_key: string }>();
  if (had && had.to_key !== to) {
    const [{ data: me }, { data: moved }] = await Promise.all([
      supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle<{ timezone: string }>(),
      supabase.from("day_moves").select("to_date").eq("user_id", user.id).eq("from_date", planDate).returns<{ to_date: string }[]>(),
    ]);
    const today = todayIn(safeTimeZone(me?.timezone));
    const shown = (moved?.length ? moved.map((m) => m.to_date) : [planDate]).filter((d) => d < today);
    if (shown.length) {
      const { data: done } = await supabase.from("set_logs").select("date, plan_date").eq("user_id", user.id).eq("exercise_key", had.to_key).gte("date", addDays(shown[0], -7)).lte("date", addDays(shown[0], 7)).returns<{ date: string; plan_date: string | null }[]>();
      if (done?.some((s) => shown.includes(s.plan_date ?? s.date))) return { ok: false, error: "That day is done with sets logged for this exercise, so the swap stays." };
    }
  }
  if (to == null || to === from) {
    const { error } = await supabase.from("exercise_swaps").delete().eq("user_id", user.id).eq("plan_date", planDate).eq("from_key", from);
    if (error) return { ok: false, error: "Couldn't put it back. Try again." };
  } else {
    if (!exerciseByKey(to)) {
      // Not a built-in: it has to be one of this person's own exercises (RLS hides everyone else's)
      const { data } = await supabase.from("exercises").select("key").eq("key", to).is("deleted_at", null).maybeSingle();
      if (!data) return { ok: false, error: "That exercise is gone. Pick another." };
    }
    const { error } = await supabase
      .from("exercise_swaps")
      .upsert({ user_id: user.id, plan_date: planDate, from_key: from, to_key: to, created_at: new Date().toISOString() }, { onConflict: "user_id,plan_date,from_key" });
    if (error) return { ok: false, error: "Couldn't swap that exercise. Try again." };
  }
  revalidatePath("/");
  return { ok: true };
}

/* ---------- supersets ---------- */
/**
 * Changes the saved supersets (see lib/plan/supersets.ts): deletes the groups in `remove`, saves the ones in
 * `add`. Ids come from the phone, so replaying the same change is harmless.
 */
export async function editSupersets(remove: string[], add: Superset[]): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const bad = { ok: false as const, error: "Couldn't change that superset." };
  if (!Array.isArray(remove) || !Array.isArray(add) || remove.length > 20 || add.length > 20) return bad;
  if (!remove.every((id) => typeof id === "string" && UUID.test(id))) return bad;
  for (const s of add) {
    if (!s || typeof s.id !== "string" || !UUID.test(s.id) || !Array.isArray(s.keys)) return bad;
    if (s.keys.length < 2 || s.keys.length > SUPERSET_MAX || new Set(s.keys).size !== s.keys.length || !s.keys.every((k) => typeof k === "string" && KEY.test(k))) return bad;
  }
  const failed = { ok: false as const, error: "Couldn't change that superset. Try again." };
  if (remove.length) {
    const { error } = await supabase.from("supersets").delete().eq("user_id", user.id).in("id", remove);
    if (error) return failed;
  }
  if (add.length) {
    const { error } = await supabase.from("supersets").upsert(add.map((s) => ({ id: s.id, user_id: user.id, keys: s.keys, off: s.off === true })), { onConflict: "id" });
    if (error) return failed;
  }
  revalidatePath("/");
  return { ok: true };
}

/* ---------- do another day's workout instead ---------- */
/** Before migration 0012 is applied the table is missing: no copies, rather than an error */
const MISSING_TABLE = ["42P01", "PGRST205"];

/**
 * The plan day `planDate` does the workout the plan put on `source` instead (both the plan's own dates, before moves);
 * `source` null puts the day's own workout back. That day's exercise swaps go too: they were made on the old workout.
 */
export async function setDayCopy(planDate: string, source: string | null): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!ISO.test(planDate) || (source != null && (!ISO.test(source) || source === planDate))) return { ok: false, error: "Couldn't swap that day." };
  if (source != null) {
    // A moved day stays in its week, and sets done early log up to 6 days before: two weeks of history covers it
    const from = addDays(mondayOf(planDate), -7);
    const to = addDays(mondayOf(planDate), 7);
    const [{ data: profile }, moves, copies, sets, logs, session] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>(),
      supabase.from("day_moves").select("from:from_date, to:to_date").returns<Move[]>(),
      supabase.from("day_copies").select("planDate:plan_date, source:source_date").returns<DayCopy[]>(),
      supabase.from("set_logs").select("date, plan_date").gte("date", from).lt("date", to).returns<{ date: string; plan_date: string | null }[]>(),
      supabase.from("logs").select("date, kind, auto").gte("date", from).lt("date", to).returns<{ date: string; kind: string; auto: boolean }[]>(),
      supabase.from("workout_sessions").select("plan_date").eq("plan_date", planDate).maybeSingle(),
    ]);
    const settings = profile ? profileToSettings(profile) : null;
    if (!profile || !settings) return { ok: false, error: "Set up your plan first." };
    if (moves.error || sets.error || logs.error || (copies.error && !MISSING_TABLE.includes(copies.error.code))) return { ok: false, error: "Couldn't swap that day. Try again." };
    if (session.data) return { ok: false, error: "That workout has started, so it stays as it is." };
    // The sheet's rules, on the plan as shown: moves place the day, other copies are what a source day holds
    const weeks = generatePlan(settings, { moves: moves.data ?? [], copies: (copies.data ?? []).filter((c) => c.planDate !== planDate), until: planUntil(todayIn(safeTimeZone(profile.timezone))) });
    const logged = new Set([...(sets.data ?? []).map((s) => s.plan_date ?? s.date), ...(logs.data ?? []).filter(countsForDay).map((l) => l.date)]);
    const why = canCopy(weeks, planDate, source, todayIn(safeTimeZone(profile.timezone)), logged);
    if (why) return { ok: false, error: why };
  }
  const { error } = await supabase.rpc("set_day_copy", { p_plan_date: planDate, p_source: source });
  if (error) return { ok: false, error: source ? "Couldn't swap that day. Try again." : "Couldn't put that day back. Try again." };
  revalidatePath("/");
  return { ok: true };
}

/* ---------- logs ---------- */
const KINDS: LogKind[] = ["run", "test", "strength", "walk", "check", "class"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A session as typed in the Log form. `id` comes from the phone, so a retry after a dropped connection can't save it twice. */
export interface LogInput {
  id: string;
  date: string;
  kind: LogKind;
  title: string;
  km: string;
  time: string;
  rpe: string;
  pain: Record<string, number>;
  notes: string;
  /** The day's blocks as shown, for a run, test or walk on a planned day (snapshots.ts) */
  snapshot?: unknown;
}

function cleanLog(input: LogInput) {
  if (!KINDS.includes(input.kind)) return { error: "Pick a session type." } as const;
  if (!ISO.test(input.date)) return { error: "Pick a date." } as const;
  const timeRaw = input.time.trim();
  const duration_sec = timeRaw ? parseDuration(timeRaw) : null;
  if (timeRaw && duration_sec == null) return { error: "Time should look like 34:10 or 1:02:30." } as const;
  const kmRaw = input.km.trim();
  const km = kmRaw ? Number(kmRaw.replace(",", ".")) : null;
  if (kmRaw && (km == null || !Number.isFinite(km) || km < 0 || km > 1000)) return { error: "Distance should be a number, like 5 or 7.5." } as const;
  if (input.kind === "class" && !input.title.trim()) return { error: "Pick a class." } as const;
  if (input.kind === "class" && !duration_sec) return { error: "How long was the class?" } as const;
  const rpeRaw = input.rpe.trim();
  const rpe = rpeRaw ? Math.round(Number(rpeRaw)) : null;
  if (rpeRaw && (rpe == null || !Number.isFinite(rpe) || rpe < 1 || rpe > 10)) return { error: "Effort is 1 to 10." } as const;
  const pain: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.pain ?? {}).slice(0, 5)) if (/^[\p{L} -]{1,30}$/u.test(k)) pain[k] = Math.max(0, Math.min(10, Math.round(Number(v) || 0)));
  return {
    row: { date: input.date, kind: input.kind, title: input.title.trim().slice(0, 120) || null, km: input.kind === "class" ? null : km, duration_sec, rpe, pain, notes: input.notes.trim().slice(0, 1000) || null },
  } as const;
}

export async function addLog(input: LogInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!UUID.test(input.id)) return { ok: false, error: "Couldn't save the session. Try again." };
  const c = cleanLog(input);
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await supabase.from("logs").upsert({ id: input.id, user_id: user.id, ...c.row }, { onConflict: "id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn't save the session. Try again." };
  // The day's workout as shown, unless it's already kept (a log can be for an earlier date, whose copy stands)
  const blocks = input.snapshot == null ? null : cleanBlocks(input.snapshot);
  if (blocks) await supabase.from("day_snapshots").upsert({ user_id: user.id, plan_date: c.row.date, blocks }, { onConflict: "user_id,plan_date", ignoreDuplicates: true });
  revalidatePath("/");
  return { ok: true };
}

/** Add effort, pain and notes to a session, e.g. one imported from Apple Health, or mark it as a test. */
export async function updateLog(id: string, patch: { kind?: LogKind; rpe?: string; pain?: Record<string, number>; notes?: string }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: cur } = await supabase.from("logs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle<LogRow>();
  if (!cur) return { ok: false, error: "That session is gone." };
  const c = cleanLog({
    id,
    date: cur.date,
    kind: patch.kind ?? cur.kind,
    title: cur.title ?? "",
    // distance and time aren't edited here (time is passed through so a class still has one)
    km: "",
    time: cur.duration_sec ? duration(cur.duration_sec) : "",
    rpe: patch.rpe ?? (cur.rpe == null ? "" : String(cur.rpe)),
    pain: patch.pain ?? cur.pain,
    notes: patch.notes ?? cur.notes ?? "",
  });
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await supabase.from("logs").update({ kind: c.row.kind, rpe: c.row.rpe, pain: c.row.pain, notes: c.row.notes }).eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteLog(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: log } = await supabase
    .from("logs")
    .select("date, kind, auto, title, km, duration_sec, source")
    .eq("id", id)
    .single<{ date: string; kind: string; auto: boolean; title: string | null; km: number | null; duration_sec: number | null; source: string }>();
  if (log?.auto && (await lockedDay(supabase, user.id, log.date))) return { ok: false, error: LOCKED };
  // An auto entry stands for that day's sets, so deleting it removes them too
  const gone = log?.auto ? (await supabase.from("set_logs").delete().eq("user_id", user.id).eq("date", log.date).select("id")).data : null;
  const { error } = await supabase.from("logs").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete. Try again." };
  // The Score tab lists deletes, which otherwise leave no trace. A failed note never fails the delete
  if (log) {
    const { date, auto: _auto, ...payload } = log;
    await supabase.from("activity_events").insert({ kind: "log_deleted", date, payload: { ...payload, sets: gone?.length ?? 0 } });
  }
  revalidatePath("/");
  return { ok: true };
}

/* ---------- sets ---------- */
export interface SetInput {
  date: string;
  exerciseKey: string;
  setNo: number;
  weight: number | null;
  unit: Unit;
  reps: number | null;
  durationSec: number | null;
  light: boolean;
  /** Title for the day's Log entry, created with the first set */
  dayTitle: string;
  /** The plan day these sets belong to, when done early (they still save under today) */
  planDate?: string | null;
  /** No sets on this date yet, so the day's Log entry needs creating */
  firstOfDay?: boolean;
  /** The day's blocks as shown, sent when not saved yet or changed: past days keep showing them (snapshots.ts) */
  snapshot?: unknown;
}

const num = (v: number | null, max: number) => (v == null || !Number.isFinite(v) || v < 0 || v > max ? null : v);

export async function upsertSet(input: SetInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!exerciseByKey(input.exerciseKey)) {
    // Not a built-in: it has to be one of this person's own exercises (RLS hides everyone else's)
    const { data } = await supabase.from("exercises").select("key").eq("key", input.exerciseKey).maybeSingle();
    if (!data) return { ok: false, error: "Unknown exercise." };
  }
  if (!ISO.test(input.date) || input.setNo < 1 || input.setNo > 20) return { ok: false, error: "Couldn't save that set." };
  const reps = num(input.reps, 200);
  const duration_sec = num(input.durationSec, 3600);
  // A set with nothing done isn't a set: the workout would read as complete while the Score counts none of it
  if (!((reps ?? 0) >= 1) && !((duration_sec ?? 0) >= 1)) return { ok: false, error: "Add reps or seconds." };
  if (await lockedDay(supabase, user.id, input.planDate && ISO.test(input.planDate) ? input.planDate : input.date)) return { ok: false, error: LOCKED };
  const planDate = input.planDate && ISO.test(input.planDate) && input.planDate !== input.date ? input.planDate : null;
  // Set numbers are unique per date and exercise. A set saved under a number another workout holds on this date
  // (a later day done early) would overwrite it: refuse, so nothing logged is ever replaced by another day's set
  const { data: held } = await supabase
    .from("set_logs")
    .select("plan_date")
    .eq("user_id", user.id)
    .eq("date", input.date)
    .eq("exercise_key", input.exerciseKey)
    .eq("set_no", input.setNo)
    .maybeSingle<{ plan_date: string | null }>();
  if (held && (held.plan_date ?? input.date) !== (planDate ?? input.date)) return { ok: false, error: "That set is already logged for another workout today. Reload and log it again." };
  const { error } = await supabase.from("set_logs").upsert(
    {
      user_id: user.id,
      date: input.date,
      exercise_key: input.exerciseKey,
      set_no: input.setNo,
      weight: num(input.weight, 9999),
      unit: input.unit === "lb" ? "lb" : "kg",
      reps,
      duration_sec,
      light_week: input.light,
      plan_date: planDate,
    },
    { onConflict: "user_id,date,exercise_key,set_no" },
  );
  if (error) return { ok: false, error: "Couldn't save that set. Try again." };
  // The workout as shown, kept for the day it was for. The set is saved either way: a failed copy only means
  // that day keeps following the live plan
  const blocks = input.snapshot == null ? null : cleanBlocks(input.snapshot);
  if (blocks) await supabase.from("day_snapshots").upsert({ user_id: user.id, plan_date: planDate ?? input.date, blocks, updated_at: new Date().toISOString() }, { onConflict: "user_id,plan_date" });
  // First set of the day: add one "strength" entry to the Log tab. A unique index makes a repeat a harmless no-op.
  if (input.firstOfDay) {
    const { error: logError } = await supabase.from("logs").insert({ user_id: user.id, date: input.date, kind: "strength", auto: true, title: input.dayTitle.slice(0, 120) });
    if (!logError) revalidatePath("/");
  }
  return { ok: true };
}

export async function deleteSet(date: string, exerciseKey: string, setNo: number): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: row } = await supabase
    .from("set_logs")
    .select("date, plan_date")
    .eq("user_id", user.id)
    .eq("date", date)
    .eq("exercise_key", exerciseKey)
    .eq("set_no", setNo)
    .maybeSingle<{ date: string; plan_date: string | null }>();
  if (row && (await lockedDay(supabase, user.id, row.plan_date ?? row.date))) return { ok: false, error: LOCKED };
  const { data: gone, error } = await supabase
    .from("set_logs")
    .delete()
    .eq("user_id", user.id)
    .eq("date", date)
    .eq("exercise_key", exerciseKey)
    .eq("set_no", setNo)
    .select("date, plan_date, exercise_key, set_no, weight, unit, reps, duration_sec");
  if (error) return { ok: false, error: "Couldn't remove that set." };
  // For the Score tab. A replayed delete finds no row, so it never notes the same set twice; a failed note is ignored
  const removed = gone?.[0];
  if (removed) await supabase.from("activity_events").insert({ kind: "set_deleted", date: removed.plan_date ?? removed.date, payload: removed });
  return { ok: true };
}

/* ---------- workout sessions: Start / End ---------- */
type Supabase = Awaited<ReturnType<typeof createClient>>;
const LOCKED = "This workout ended over 12 hours ago, so its sets are locked.";
const SESSION_COLS = "plan_date, started_at, ended_at, auto_ended, unlocked_at";

/** The session for a shown plan day: stored under the plan's own date, so a moved day maps back through day_moves */
async function sessionFor(supabase: Supabase, userId: string, shown: string): Promise<WorkoutSession | null> {
  const { data: move } = await supabase.from("day_moves").select("from:from_date, to:to_date").eq("user_id", userId).eq("to_date", shown).maybeSingle<Move>();
  const { data } = await supabase
    .from("workout_sessions")
    .select(SESSION_COLS)
    .eq("user_id", userId)
    .eq("plan_date", sessionDateFor(shown, move ? [move] : []))
    .maybeSingle<WorkoutSession>();
  return data ?? null;
}

/** Sets on this plan day are read-only: its workout ended (or auto-ended) 12 hours ago or more. A failed read doesn't lock. */
async function lockedDay(supabase: Supabase, userId: string, shown: string): Promise<boolean> {
  if (!ISO.test(shown)) return false;
  try {
    return isLocked(await sessionFor(supabase, userId, shown), Date.now());
  } catch {
    return false;
  }
}

/** A time from the phone: kept when sane (a tap made offline replays later), else now */
const phoneTime = (at: string) => {
  const t = Date.parse(at);
  const now = Date.now();
  return new Date(Number.isFinite(t) && t >= now - 7 * 86400e3 ? Math.min(t, now) : now).toISOString();
};

/** Starts the workout for `planDate` (the plan's own date, see lib/plan/workout.ts). Starting twice keeps the first start. */
export async function startWorkout(planDate: string, at: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!ISO.test(planDate)) return { ok: false, error: "Couldn't start the workout." };
  const { error } = await supabase
    .from("workout_sessions")
    .upsert({ user_id: user.id, plan_date: planDate, started_at: phoneTime(at) }, { onConflict: "user_id,plan_date", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn't start the workout. Try again." };
  // "Workout auto-ended" 4 hours on, unless it's ended first; best effort, the workout is saved either way
  const { data: s } = await supabase.from("workout_sessions").select(SESSION_COLS).eq("user_id", user.id).eq("plan_date", planDate).maybeSingle<WorkoutSession>();
  if (pushEnabled() && s && !s.ended_at && Date.parse(s.started_at) + AUTO_END_MS > Date.now())
    await schedulePush(user.id, { at: Date.parse(s.started_at) + AUTO_END_MS, title: "Workout ended", body: "It ran 4 hours, so it was ended for you. You can still edit it for 12 hours.", tag: `workout-end:${planDate}` }).catch(() => {});
  return { ok: true };
}

/** Ends it at `at`, capped at 4 hours after the start (that counts as auto-ended). Ending an ended workout changes nothing. */
export async function endWorkout(planDate: string, at: string, auto = false): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!ISO.test(planDate)) return { ok: false, error: "Couldn't end the workout." };
  const { data: cur } = await supabase.from("workout_sessions").select(SESSION_COLS).eq("user_id", user.id).eq("plan_date", planDate).maybeSingle<WorkoutSession>();
  if (!cur || cur.ended_at) return { ok: true };
  const { error } = await supabase
    .from("workout_sessions")
    .update(clampEnd(cur.started_at, phoneTime(at), !!auto))
    .eq("user_id", user.id)
    .eq("plan_date", planDate)
    .is("ended_at", null);
  if (error) return { ok: false, error: "Couldn't end the workout. Try again." };
  if (pushEnabled()) await cancelPush(user.id, `workout-end:${planDate}`).catch(() => {});
  revalidatePath("/");
  return { ok: true };
}

/** "Unlock to edit": a locked workout's sets open again for 12 hours from `at`. Only an ended workout can be unlocked. */
export async function unlockWorkout(planDate: string, at: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!ISO.test(planDate)) return { ok: false, error: "Couldn't unlock the workout." };
  const { error } = await supabase
    .from("workout_sessions")
    .update({ unlocked_at: phoneTime(at) })
    .eq("user_id", user.id)
    .eq("plan_date", planDate)
    .not("ended_at", "is", null);
  if (error) return { ok: false, error: "Couldn't unlock the workout. Try again." };
  revalidatePath("/");
  return { ok: true };
}

/* ---------- exercise library ---------- */
const MUSCLE_IDS = new Set<string>(MUSCLES.map((m) => m.id));

export async function addExercise(_: unknown, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Give it a name." };
  const load = String(form.get("load"));
  if (!["weight", "bodyweight", "time"].includes(load)) return { ok: false, error: "Pick how it's measured." };
  const primary = form.getAll("primary").map(String).filter((m) => MUSCLE_IDS.has(m));
  const secondary = form.getAll("secondary").map(String).filter((m) => MUSCLE_IDS.has(m) && !primary.includes(m));
  if (!primary.length) return { ok: false, error: "Pick at least one main muscle." };
  const equipment = [...new Set(form.getAll("equipment").map(String).filter(isEquipment))];
  const videoRaw = String(form.get("video") ?? "").trim();
  const video = videoRaw ? youtubeId(videoRaw) : null;
  if (videoRaw && !video) return { ok: false, error: "That doesn't look like a YouTube link." };
  const row = {
    key: customKey(name, user.id.slice(0, 6)),
    name,
    load,
    primary_muscles: primary,
    secondary_muscles: secondary,
    equipment,
    video_ids: video ? [video] : [],
    video_query: name,
    owner: user.id,
  };
  const { error } = await supabase.from("exercises").insert(row);
  if (error?.code === "23505") {
    // One of the same name that was deleted comes back, with its history, as just entered
    const { data: back } = await supabase.from("exercises").update({ ...row, deleted_at: null }).eq("key", row.key).eq("owner", user.id).not("deleted_at", "is", null).select("key");
    if (!back?.length) return { ok: false, error: "You already have an exercise with that name." };
    revalidatePath("/");
    return { ok: true };
  }
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteExercise(key: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  // Built-ins have no owner, so this only ever touches your own. It's hidden, not removed: workouts already done
  // with it keep its name, its sets and their credit in the Score
  const { error } = await supabase.from("exercises").update({ deleted_at: new Date().toISOString() }).eq("key", key).eq("owner", user.id);
  if (error) return { ok: false, error: "Couldn't delete. Try again." };
  // Days still ahead that it was swapped in on go back to their planned exercise; days behind keep it
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle<{ timezone: string }>();
  await supabase.from("exercise_swaps").delete().eq("user_id", user.id).eq("to_key", key).gt("plan_date", todayIn(safeTimeZone(me?.timezone)));
  revalidatePath("/");
  return { ok: true };
}

/* ---------- calendar feed and Apple Health tokens ---------- */
export type TokenPurpose = "calendar" | "health";

/** Makes a new token (replacing any old one) and returns it once. Only its hash is stored. */
export async function createToken(purpose: TokenPurpose): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { supabase, user } = await requireUser();
  if (purpose !== "calendar" && purpose !== "health") return { ok: false, error: "Unknown token." };
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Buffer.from(bytes).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.from("user_tokens").upsert({ user_id: user.id, purpose, token_hash, created_at: new Date().toISOString(), last_used_at: null }, { onConflict: "user_id,purpose" });
  if (error) return { ok: false, error: "Couldn't create a link. Try again." };
  revalidatePath("/settings");
  return { ok: true, token };
}

export async function revokeToken(purpose: TokenPurpose): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("user_tokens").delete().eq("user_id", user.id).eq("purpose", purpose);
  if (error) return { ok: false, error: "Couldn't turn it off. Try again." };
  revalidatePath("/settings");
  return { ok: true };
}

/* ---------- weekly AI check-in ---------- */
export type ReviewResult = { ok: true; review: Review; createdAt: string } | { ok: false; error: string };

/** This week's check-in: cached per week, refreshable twice a day at most, so it costs about one call a week. */
export async function weeklyReview(refresh = false): Promise<ReviewResult> {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<ProfileRow>();
  const settings = profile ? profileToSettings(profile) : null;
  if (!profile || !settings) return { ok: false, error: "Set up your plan first." };
  const today = todayIn(safeTimeZone(profile.timezone));
  const week = mondayOf(today);
  const { data: cached } = await supabase.from("ai_reviews").select("content, created_at").eq("user_id", user.id).eq("week_start", week).maybeSingle<{ content: Review; created_at: string }>();
  if (cached && (!refresh || Date.now() - Date.parse(cached.created_at) < 12 * 3600e3)) return { ok: true, review: cached.content, createdAt: cached.created_at };
  if (!aiEnabled()) return { ok: false, error: "The AI check-in is turned off." };

  const from = addDays(today, -60);
  const [{ data: logs }, { data: sets }, { data: skips }, { data: moves }, { data: exercises }, { data: swaps }, { data: copies }] = await Promise.all([
    paged((a, b) => supabase.from("logs").select("*").gte("date", from).order("date", { ascending: false }).order("id").range(a, b).returns<LogRow[]>()),
    paged((a, b) => supabase.from("set_logs").select("id, date, exercise_key, set_no, weight, unit, weight_kg, reps, duration_sec, light_week, plan_date").gte("date", from).order("date", { ascending: false }).order("id").range(a, b).returns<SetRow[]>()),
    paged((a, b) => supabase.from("day_overrides").select("date").eq("status", "skipped").order("date").range(a, b).returns<{ date: string }[]>()),
    paged((a, b) => supabase.from("day_moves").select("from:from_date, to:to_date").order("to_date").range(a, b).returns<Move[]>()),
    paged((a, b) => supabase.from("exercises").select("key, name, load").order("key").range(a, b).returns<{ key: string; name: string; load: Load }[]>()),
    supabase.from("exercise_swaps").select("planDate:plan_date, from:from_key, to:to_key").gte("plan_date", addDays(today, -21)).returns<Swap[]>(),
    // Missing before migration 0012: no copies
    paged((a, b) => supabase.from("day_copies").select("planDate:plan_date, source:source_date").order("plan_date").range(a, b).returns<DayCopy[]>()),
  ]);
  const cleanLogs = (logs ?? []).map((l) => ({ ...l, km: l.km == null ? null : Number(l.km) }));
  const cleanSets = (sets ?? []).map((s) => ({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) }));
  const gatesPending = settings.returningFromInjury && GATES.some((g) => !profile.gates?.[g.key]);
  const known = new Map<string, { name: string; load: Load }>([...builtinRows().map((e) => [e.key, e] as const), ...(exercises ?? []).map((e) => [e.key, e] as const)]);
  // Swaps included, so a swapped-out exercise doesn't read as a gap and the coming week shows what's really planned
  const { weeks, fitness, warnings } = planFor({ settings, logs: cleanLogs, skips: (skips ?? []).map((s) => s.date), moves: moves ?? [], gatesPending, today, swaps: swaps ?? [], exercise: (k) => known.get(k), copies: copies ?? [] });
  const names = new Map([...known].map(([k, e]) => [k, e.name] as const));

  let review: Review;
  try {
    review = await generateReview({ name: profile.display_name, weeks, logs: cleanLogs, sets: cleanSets, names, warnings, fitness: goalOf(settings) ? duration(fitness.sec) : null, goal: settings.goal5kSec && goalOf(settings) ? duration(settings.goal5kSec) : null, mode: runMode(settings.runMode), today });
  } catch (e) {
    console.error("weeklyReview", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't reach the coach just now. Try again later." };
  }
  const createdAt = new Date().toISOString();
  await supabase.from("ai_reviews").upsert({ user_id: user.id, week_start: week, content: review, created_at: createdAt }, { onConflict: "user_id,week_start" });
  return { ok: true, review, createdAt };
}
