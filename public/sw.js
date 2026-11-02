// WorkoutFlex service worker: opens the home-screen app with no signal.
//
// - Pages: network first. If the network fails (or hangs, or the server is down), the cached /offline page
//   opens instead, and it draws the app from the copy saved on this phone (lib/offline.ts).
//   No page with someone's data in it is ever cached here.
// - /_next/static (hashed, never changes) and fonts: cache first.
// - Server actions (POST), RSC fetches, /api, /auth, /cal and /login: never touched.
// Registered as /sw.js?v=<build> by components/ServiceWorker.tsx, so every deploy installs a new one,
// takes over at once, and deletes the old caches.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL = `wf-shell-${VERSION}`;
const STATIC = "wf-static-v1";
const FONTS = "wf-fonts-v1";
const KEEP = [SHELL, STATIC, FONTS];
const OFFLINE = "/offline";
/** How long a page may hang on bad signal before the saved copy opens */
const NAV_TIMEOUT_MS = 10000;
const MAX_STATIC = 400;

// Push notifications live in their own file (written separately); fine if it isn't there yet
try {
  importScripts("/sw-push.js");
} catch (e) {}

/** Caches the offline page and every script and stylesheet it needs */
async function cacheShell() {
  const cache = await caches.open(SHELL);
  const res = await fetch(OFFLINE, { cache: "no-store", credentials: "omit" });
  if (!res.ok) throw new Error(`offline page: ${res.status}`);
  const html = await res.clone().text();
  await cache.put(OFFLINE, res);
  const assets = new Set(["/manifest.webmanifest", "/icon", "/apple-icon"]);
  for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)]+/g)) assets.add(m[0]);
  const stat = await caches.open(STATIC);
  await Promise.all(
    [...assets].map(async (url) => {
      try {
        const r = await fetch(url, { credentials: "omit" });
        if (r.ok) await (url.startsWith("/_next/static/") ? stat : cache).put(url, r);
      } catch (e) {}
    }),
  );
}

self.addEventListener("install", (event) => {
  // A failed shell download doesn't block the update; it's retried on the next page load
  event.waitUntil(cacheShell().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("wf-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    await cache.put(request, res.clone());
    if (cacheName === STATIC) trim(STATIC, MAX_STATIC);
  }
  return res;
}

async function offlinePage() {
  const cache = await caches.open(SHELL);
  let hit = await cache.match(OFFLINE);
  if (!hit) {
    // Not cached yet (e.g. the install download failed): any older version's copy will do
    hit = await caches.match(OFFLINE);
  }
  return hit || new Response("<h1>No connection</h1><p>Try again when you have signal.</p>", { status: 503, headers: { "Content-Type": "text/html" } });
}

async function navigate(event) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
  try {
    const res = await Promise.race([fetch(event.request), timeout]);
    // Vercel's own "server down" pages; the app's own errors render its error screen instead
    if (res && ![502, 503, 504].includes(res.status)) {
      // Keep the offline page fresh with this build when there's signal anyway
      if (!(await caches.open(SHELL).then((c) => c.match(OFFLINE)))) event.waitUntil(cacheShell().catch(() => {}));
      return res;
    }
  } catch (e) {}
  return offlinePage();
}

/** Pages that must always come from the server: sign-in and token routes */
const LIVE_ONLY = /^\/(api|auth|cal|login)(\/|$)/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // server actions and every other write
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req, STATIC));
    if (req.mode === "navigate" && !LIVE_ONLY.test(url.pathname)) return event.respondWith(navigate(event));
    if (url.pathname === "/manifest.webmanifest" || url.pathname === "/icon" || url.pathname === "/apple-icon") {
      return event.respondWith(fetch(req).catch(() => caches.match(url.pathname).then((r) => r || Response.error())));
    }
    return; // RSC fetches, prefetches, /api: straight to the network
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return event.respondWith(cacheFirst(req, FONTS));
});
