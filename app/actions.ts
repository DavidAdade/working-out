"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { parseDuration } from "@/lib/plan/format.ts";
import type { LogKind } from "@/lib/types";

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
  const { error } = await supabase.from("logs").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: "Couldn't delete. Try again." };
  revalidatePath("/");
  return { ok: true };
}
