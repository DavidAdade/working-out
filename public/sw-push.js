// Push notifications ("Rest over" and other scheduled ones from lib/push.ts).
// Loaded by the app's service worker with importScripts('/sw-push.js'); it owns registration and caching.

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: event.data ? event.data.text() : "" };
  }
  const title = msg.title || "WorkoutFlex";
  // iOS revokes a subscription that receives pushes without showing anything, so always show one
  event.waitUntil(
    self.registration.showNotification(title, {
      body: msg.body || "",
      tag: msg.tag || "workoutflex",
      renotify: true,
      icon: "/icon",
      badge: "/icon",
      data: { url: msg.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Bring back the open app rather than loading a second copy
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
