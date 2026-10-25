"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { duration, parseDuration } from "@/lib/plan/format.ts";
import { addDays, daysBetween, isMonday, isTimeZone, mondayOf, safeTimeZone, todayIn } from "@/lib/plan/dates.ts";
import { planFor } from "@/lib/plan/adapt.ts";
import { builtinRows } from "@/lib/plan/catalog.ts";
import { generateReview, type Review } from "@/lib/coach/review";
import { MIN_RACE_GAP_WEEKS } from "@/lib/plan/generate.ts";
import { GATES, profileToSettings, type LogKind, type LogRow, type ProfileRow, type SetRow, type Unit } from "@/lib/types";
import { exerciseByKey } from "@/lib/plan/exercises.ts";
import { customKey, youtubeId } from "@/lib/plan/catalog.ts";
import { MUSCLES } from "@/lib/plan/muscles.ts";

export type ActionResult = { ok: true } | { ok: false, error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/* ---------- auth ---------- */
export async function sendMagicLink(_: unknown, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
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
  const injury = form.get("returning_from_injury") === "on";
  const update = {
    display_name: str("display_name"),
    timezone: str("timezone") ?? "America/Toronto",
    rest_timer: form.get("rest_timer") === "on",
    start_date: str("start_date"),
    recovery_start: injury ? str("recovery_start") : null,
    returning_from_injury: injury,
    hide_dates: form.get("hide_dates") === "on",
    weight_unit: form.get("weight_unit") === "lb" ? "lb" : "kg",
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
  };
  if (!update.start_date || !update.time_trial_date) return { ok: false, error: "Add a start date and a time trial date." };
  if (!update.current_5k_sec || !update.goal_5k_sec) return { ok: false, error: "5K times should look like 35:00." };
  if (update.goal_5k_sec >= update.current_5k_sec) return { ok: false, error: "The goal 5K should be faster than your current time." };
  if (update.time_trial_date <= update.start_date) return { ok: false, error: "The time trial has to come after the start date." };
  if (!isTimeZone(update.timezone)) return { ok: false, error: "Pick a time zone from the list." };
  if (update.recovery_start && update.recovery_start >= update.start_date) return { ok: false, error: "The strength-only phase has to start before running does." };
  if (update.race_date && daysBetween(update.time_trial_date, update.race_date) < MIN_RACE_GAP_WEEKS * 7)
    return { ok: false, error: `Put the race at least ${MIN_RACE_GAP_WEEKS} weeks after the time trial, so it gets its own taper.` };
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't save settings. Try again." };
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

/* ---------- logs ---------- */
const KINDS: LogKind[] = ["run", "test", "strength", "walk", "check"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
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
  const rpeRaw = input.rpe.trim();
  const rpe = rpeRaw ? Math.round(Number(rpeRaw)) : null;
  if (rpeRaw && (rpe == null || !Number.isFinite(rpe) || rpe < 1 || rpe > 10)) return { error: "Effort is 1 to 10." } as const;
  const pain: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.pain ?? {}).slice(0, 5)) if (/^[\p{L} -]{1,30}$/u.test(k)) pain[k] = Math.max(0, Math.min(10, Math.round(Number(v) || 0)));
  return {
    row: { date: input.date, kind: input.kind, title: input.title.trim().slice(0, 120) || null, km, duration_sec, rpe, pain, notes: input.notes.trim().slice(0, 1000) || null },
  } as const;
}

export async function addLog(input: LogInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!UUID.test(input.id)) return { ok: false, error: "Couldn't save the session. Try again." };
  const c = cleanLog(input);
  if ("error" in c) return { ok: false, error: c.error! };
  const { error } = await supabase.from("logs").upsert({ id: input.id, user_id: user.id, ...c.row }, { onConflict: "id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn't save the session. Try again." };
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
    // distance and time aren't edited here
    km: "",
    time: "",
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
  const { data: log } = await supabase.from("logs").select("date, auto").eq("id", id).single<{ date: string; auto: boolean }>();
  // An auto entry stands for that day's sets, so deleting it removes them too
  if (log?.auto) await supabase.from("set_logs").delete().eq("user_id", user.id).eq("date", log.date);
  const { error } = await supabase.from("logs").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete. Try again." };
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
  if (reps == null && duration_sec == null) return { ok: false, error: "Add reps or seconds." };
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
      plan_date: input.planDate && ISO.test(input.planDate) && input.planDate !== input.date ? input.planDate : null,
    },
    { onConflict: "user_id,date,exercise_key,set_no" },
  );
  if (error) return { ok: false, error: "Couldn't save that set. Try again." };
  // First set of the day: add one "strength" entry to the Log tab. A unique index makes a repeat a harmless no-op.
  if (input.firstOfDay) {
    const { error: logError } = await supabase.from("logs").insert({ user_id: user.id, date: input.date, kind: "strength", auto: true, title: input.dayTitle.slice(0, 120) });
    if (!logError) revalidatePath("/");
  }
  return { ok: true };
}

export async function deleteSet(date: string, exerciseKey: string, setNo: number): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("set_logs").delete().eq("user_id", user.id).eq("date", date).eq("exercise_key", exerciseKey).eq("set_no", setNo);
  if (error) return { ok: false, error: "Couldn't remove that set." };
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
  const videoRaw = String(form.get("video") ?? "").trim();
  const video = videoRaw ? youtubeId(videoRaw) : null;
  if (videoRaw && !video) return { ok: false, error: "That doesn't look like a YouTube link." };
  const { error } = await supabase.from("exercises").insert({
    key: customKey(name, user.id.slice(0, 6)),
    name,
    load,
    primary_muscles: primary,
    secondary_muscles: secondary,
    video_ids: video ? [video] : [],
    video_query: name,
    owner: user.id,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "You already have an exercise with that name." : "Couldn't save. Try again." };
  revalidatePath("/");
  return { ok: true };
}

export async function deleteExercise(key: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  // Built-ins have no owner, so this only ever removes your own. Logged sets stay in your history.
  const { error } = await supabase.from("exercises").delete().eq("key", key).eq("owner", user.id);
  if (error) return { ok: false, error: "Couldn't delete. Try again." };
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
  // On Vercel the AI Gateway signs in with the deployment's OIDC token; elsewhere it needs a key
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL) return { ok: false, error: "The AI check-in isn't set up yet: add AI_GATEWAY_API_KEY." };

  const from = addDays(today, -60);
  const [{ data: logs }, { data: sets }, { data: skips }, { data: exercises }] = await Promise.all([
    supabase.from("logs").select("*").gte("date", from).order("date", { ascending: false }).returns<LogRow[]>(),
    supabase.from("set_logs").select("id, date, exercise_key, set_no, weight, unit, weight_kg, reps, duration_sec, light_week, plan_date").gte("date", from).returns<SetRow[]>(),
    supabase.from("day_overrides").select("date").eq("status", "skipped").returns<{ date: string }[]>(),
    supabase.from("exercises").select("key, name").returns<{ key: string; name: string }[]>(),
  ]);
  const cleanLogs = (logs ?? []).map((l) => ({ ...l, km: l.km == null ? null : Number(l.km) }));
  const cleanSets = (sets ?? []).map((s) => ({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg) }));
  const gatesPending = settings.returningFromInjury && GATES.some((g) => !profile.gates?.[g.key]);
  const { weeks, fitness, warnings } = planFor({ settings, logs: cleanLogs, skips: (skips ?? []).map((s) => s.date), gatesPending, today });
  const names = new Map([...builtinRows().map((e) => [e.key, e.name] as const), ...(exercises ?? []).map((e) => [e.key, e.name] as const)]);

  let review: Review;
  try {
    review = await generateReview({ name: profile.display_name, weeks, logs: cleanLogs, sets: cleanSets, names, warnings, fitness: duration(fitness.sec), goal: duration(settings.goal5kSec), today });
  } catch (e) {
    console.error("weeklyReview", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't reach the coach just now. Try again later." };
  }
  const createdAt = new Date().toISOString();
  await supabase.from("ai_reviews").upsert({ user_id: user.id, week_start: week, content: review, created_at: createdAt }, { onConflict: "user_id,week_start" });
  return { ok: true, review, createdAt };
}
