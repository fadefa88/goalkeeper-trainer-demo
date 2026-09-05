const CACHE_NAME = "gk-trainer-shell-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./style.css",
  "./app.js",
  "./cloudflare-client.js",
  "./calendar-keepers.js",
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
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  const isFresh = event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/cloudflare-client.js") ||
    url.pathname.endsWith("/calendar-keepers.js");

  if (isFresh) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          if (!response || !response.ok) return response;
          const headers = new Headers(response.headers);
          headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        })
        // Gli asset precaricati sono salvati senza "?v=...": senza ignoreSearch
        // questo fallback offline non trovava mai corrispondenza per una
        // richiesta con query string, anche a cache piena.
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // gk-home-hero.png (~2MB) non è più nel precache eager dell'install:
        // la prima richiesta reale lo scarica e lo mette qui in cache, così le
        // successive (offline incluso) lo trovano senza riscaricarlo.
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
