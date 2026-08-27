const CACHE_NAME = "gk-trainer-cloudflare-d1-planner-css-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./style.css",
  "./app.js",
  "./cloudflare-client.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
