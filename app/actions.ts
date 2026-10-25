"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/plan/format.ts";
import type { LogKind, Unit } from "@/lib/types";
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
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't save settings. Try again." };
  revalidatePath("/");
  redirect("/");
}

export async function setGate(key: string, value: boolean): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("gates").eq("id", user.id).single();
  const gates = { ...((data?.gates as Record<string, boolean>) ?? {}), [key]: value };
  const { error } = await supabase.from("profiles").update({ gates }).eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/");
  return { ok: true };
}

export async function setStartDate(date: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
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
const KINDS: LogKind[] = ["run", "test", "strength", "walk"];

export async function addLog(_: unknown, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const kind = String(form.get("kind")) as LogKind;
  if (!KINDS.includes(kind)) return { ok: false, error: "Pick a session type." };
  const date = String(form.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };
  const timeRaw = String(form.get("time") ?? "").trim();
  const duration_sec = timeRaw ? parseDuration(timeRaw) : null;
  if (timeRaw && duration_sec == null) return { ok: false, error: "Time should look like 34:10 or 1:02:30." };
  const kmRaw = String(form.get("km") ?? "").trim();
  const km = kmRaw ? Number(kmRaw.replace(",", ".")) : null;
  if (kmRaw && (km == null || !Number.isFinite(km) || km < 0)) return { ok: false, error: "Distance should be a number, like 5 or 7.5." };
  const rpeRaw = String(form.get("rpe") ?? "").trim();
  const pain: Record<string, number> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("pain_")) pain[k.slice(5)] = Math.max(0, Math.min(10, Number(v) || 0));
  }
  const { error } = await supabase.from("logs").insert({
    user_id: user.id,
    date,
    kind,
    title: String(form.get("title") ?? "").trim() || null,
    km,
    duration_sec,
    rpe: rpeRaw ? Math.max(1, Math.min(10, Number(rpeRaw))) : null,
    pain,
    notes: String(form.get("notes") ?? "").trim() || null,
  });
  if (error) return { ok: false, error: "Couldn't save the session. Try again." };
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
}

const num = (v: number | null, max: number) => (v == null || !Number.isFinite(v) || v < 0 || v > max ? null : v);

export async function upsertSet(input: SetInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!exerciseByKey(input.exerciseKey)) {
    // Not a built-in: it has to be one of this person's own exercises (RLS hides everyone else's)
    const { data } = await supabase.from("exercises").select("key").eq("key", input.exerciseKey).maybeSingle();
    if (!data) return { ok: false, error: "Unknown exercise." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.setNo < 1 || input.setNo > 20) return { ok: false, error: "Couldn't save that set." };
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
    },
    { onConflict: "user_id,date,exercise_key,set_no" },
  );
  if (error) return { ok: false, error: "Couldn't save that set. Try again." };
  // First set of the day: add one "strength" entry to the Log tab. A unique index makes repeats a no-op.
  const { error: logError } = await supabase.from("logs").insert({ user_id: user.id, date: input.date, kind: "strength", auto: true, title: input.dayTitle });
  if (!logError) revalidatePath("/");
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
