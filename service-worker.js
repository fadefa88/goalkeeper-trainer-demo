const CACHE_NAME = "gk-trainer-cloudflare-d1-training-section-v2";
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
  "./icon.svg",
  "./gk-home-hero.png"
];

const CALENDAR_CLEAN_PATCH = String.raw`
<style id="gkCalendarCleanStyle">
  .planner-session-title { display: none !important; }
</style>
<script id="gkCalendarCleanScript">
(() => {
  if (window.__gkCalendarCleanV2) return;
  window.__gkCalendarCleanV2 = true;

  function cleanCompletedSessions() {
    document.querySelectorAll(".planner-session-title").forEach((section) => section.remove());
  }

  function scheduleClean() {
    cleanCompletedSessions();
    setTimeout(cleanCompletedSessions, 80);
    setTimeout(cleanCompletedSessions, 250);
    setTimeout(cleanCompletedSessions, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleClean);
  } else {
    scheduleClean();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-tab="calendar"],.calendar-day[data-date],#prevMonthBtn,#nextMonthBtn,#addPlanExerciseBtn,#autoPlanBtn,#clearPlanBtn,[data-plan-remove],#saveCalendarPlanBtn')) {
      scheduleClean();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("#dayPlanTime,#dayPlanTotal,.plan-item-minutes")) {
      scheduleClean();
    }
  });
})();
</script>`;

function patchIndexHtml(source) {
  if (source.includes("gkCalendarCleanV2")) return source;
  if (source.includes("</body>")) return source.replace("</body>", `${CALENDAR_CLEAN_PATCH}\n</body>`);
  return `${source}\n${CALENDAR_CLEAN_PATCH}`;
}

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

  const wantsHtml = event.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html");
  if (wantsHtml) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request))
        .then(async response => {
          if (!response) return response;
          const source = await response.text();
          return new Response(patchIndexHtml(source), {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        })
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
