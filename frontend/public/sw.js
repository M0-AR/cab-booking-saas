// Minimal service worker: makes the app installable and serves a network
// pass-through. API responses are never cached (tenant data must stay fresh).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network by default; nothing to intercept yet.
});
