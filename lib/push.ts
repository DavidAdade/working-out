// Web Push, server only: "Rest over" and any other notification due at a set time.
// Off (and hidden in Settings) unless VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are set.
//
// How a push gets sent on time:
// - schedulePush() stores a row in scheduled_pushes (as the signed-in person, under RLS). If it's due
//   within SLEEP_MAX_SEC, the same request sleeps until then inside after() and sends it, accurate to about
//   a second. The calling route needs `maxDuration` of at least SLEEP_MAX_SEC + 30 (app/api/push/rest has 300).
// - Anything later, or a sleeper that got cut short, is sent by /api/push/due, which pg_cron calls every
//   minute (supabase/push-cron.sql). Sending marks the row sent in one update, so it never goes out twice.

import webpush from "web-push";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

/** The key the browser subscribes with. Public by design; null when push is off. */
export const vapidPublicKey = () => (pushEnabled() ? process.env.VAPID_PUBLIC_KEY! : null);

/** Longest wait the scheduling request covers itself; longer ones go to the every-minute sender */
export const SLEEP_MAX_SEC = 260;

export interface PushMessage {
  /** When to send it */
  at: Date | number | string;
  title: string;
  body?: string;
  /** One pending push per tag per person: scheduling the same tag replaces it. Lowercase, digits, ":" and "-". */
  tag: string;
  /** Opened when the notification is tapped. Defaults to "/". */
  url?: string;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = { ok: true } | { ok: false; error: string };

let configured = false;
function configure() {
  if (!configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/**
 * Send one notification to each subscription now. Returns the endpoints the push service says are gone
 * (the phone unsubscribed or the app was removed), so the caller can forget them.
 */
export async function sendNow(subs: PushSub[], msg: Omit<PushMessage, "at">): Promise<string[]> {
  if (!pushEnabled() || !subs.length) return [];
  configure();
  const payload = JSON.stringify({ title: msg.title, body: msg.body ?? "", tag: msg.tag, url: msg.url ?? "/" });
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          // A late "rest over" is noise: let the push service drop it after 10 minutes
          TTL: 600,
          urgency: "high",
          topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.endpoint);
      }
    }),
  );
  return gone;
}

const dueMs = (at: PushMessage["at"]) => (at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at));
const TAG = /^[a-z0-9:-]{1,60}$/;

/**
 * Notify `userId` at `msg.at`. Call from a Server Action or Route Handler while that person is signed in
 * (rows are written under their session). Replaces any pending push with the same tag.
 */
export async function schedulePush(userId: string, msg: PushMessage): Promise<PushResult> {
  if (!pushEnabled()) return { ok: false, error: "Notifications are off." };
  const due = dueMs(msg.at);
  if (!Number.isFinite(due) || !TAG.test(msg.tag)) return { ok: false, error: "Bad push." };
  const supabase = await createClient();
  const dueAt = new Date(due).toISOString();
  const row = { user_id: userId, tag: msg.tag, due_at: dueAt, title: msg.title.slice(0, 120), body: (msg.body ?? "").slice(0, 300), url: msg.url ?? "/", sent_at: null };
  const { error } = await supabase.from("scheduled_pushes").upsert(row, { onConflict: "user_id,tag" });
  if (error) return { ok: false, error: "Couldn't schedule the notification." };
  if (due - Date.now() <= SLEEP_MAX_SEC * 1000) after(() => sendWhenDue(supabase, userId, msg.tag, dueAt));
  return { ok: true };
}

/** Cancel a pending push. Harmless if it was already sent or never scheduled. */
export async function cancelPush(userId: string, tag: string): Promise<PushResult> {
  if (!TAG.test(tag)) return { ok: false, error: "Bad push." };
  const supabase = await createClient();
  const { error } = await supabase.from("scheduled_pushes").delete().eq("user_id", userId).eq("tag", tag).is("sent_at", null);
  return error ? { ok: false, error: "Couldn't cancel the notification." } : { ok: true };
}

/** The sleeper: wait, then send unless the push was cancelled, rescheduled or already sent */
async function sendWhenDue(supabase: SupabaseClient, userId: string, tag: string, dueAt: string) {
  const wait = Date.parse(dueAt) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const { data: claimed } = await supabase
    .from("scheduled_pushes")
    .update({ sent_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("tag", tag)
    .eq("due_at", dueAt)
    .is("sent_at", null)
    .select("title, body, url")
    .maybeSingle<{ title: string; body: string; url: string }>();
  if (!claimed) return;
  const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId).returns<PushSub[]>();
  const gone = await sendNow(subs ?? [], { ...claimed, tag });
  if (gone.length) await supabase.from("push_subscriptions").delete().eq("user_id", userId).in("endpoint", gone);
}
