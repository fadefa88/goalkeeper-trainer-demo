const CACHE_NAME = "gk-trainer-account-source-v2";
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

function patchHtml(source) {
  let html = source;

  html = html.replace(
    "<link rel=\"stylesheet\" href=\"style.css?v=account-source-v1\" />",
    "<link rel=\"stylesheet\" href=\"style.css?v=account-source-v2\" />"
  );
  html = html.replaceAll("app.js?v=account-source-v1", "app.js?v=account-source-v2");
  html = html.replaceAll("cloudflare-client.js?v=account-source-v1", "cloudflare-client.js?v=account-source-v2");
  html = html.replaceAll("calendar-keepers.js?v=account-source-v1", "calendar-keepers.js?v=account-source-v2");

  html = html.replace(
    "if ($id('calendarView')?.classList.contains('active') && typeof showView === 'function') setTimeout(() => showView('calendar'), 80);",
    "if ($id('calendarView')?.classList.contains('active')) setTimeout(() => { cleanCalendarUi(); ensureSaveButton(); }, 80);"
  );

  if (!html.includes("gkNoAttendanceFlickerV2")) {
    const patch = `\n<script id="gkNoAttendanceFlickerV2">\n(() => {\n  let lastCalendarHydrate = 0;\n  function stableCalendarCleanup() {\n    const calendar = document.getElementById('calendarView');\n    if (!calendar || !calendar.classList.contains('active')) return;\n    document.querySelectorAll('.planner-session-title').forEach((el) => el.remove());\n    document.querySelectorAll('#calendarView [data-plan-start]').forEach((el) => el.remove());\n    const nav = document.getElementById('bottomNav');\n    if (nav) {\n      nav.classList.remove('hidden');\n      nav.style.setProperty('display', 'grid', 'important');\n      nav.style.setProperty('grid-template-columns', 'repeat(4,minmax(0,1fr))', 'important');\n    }\n  }\n  function throttleCalendarReloads() {\n    const now = Date.now();\n    if (now - lastCalendarHydrate < 1200) return false;\n    lastCalendarHydrate = now;\n    return true;\n  }\n  document.addEventListener('click', (event) => {\n    if (event.target?.closest?.('[data-tab="calendar"],.calendar-day[data-date],#prevMonthBtn,#nextMonthBtn,#addPlanExerciseBtn,#autoPlanBtn,#clearPlanBtn,[data-plan-remove],#saveCalendarPlanBtn')) {\n      setTimeout(stableCalendarCleanup, 120);\n      setTimeout(stableCalendarCleanup, 420);\n    }\n  }, true);\n  const originalSetTimeout = window.setTimeout;\n  window.setTimeout = function(fn, delay, ...args) {\n    if (typeof fn === 'function' && delay === 80) {\n      const text = Function.prototype.toString.call(fn);\n      if (text.includes("showView('calendar')") || text.includes('showView(\"calendar\")')) {\n        if (!throttleCalendarReloads()) return 0;\n        return originalSetTimeout(() => stableCalendarCleanup(), delay, ...args);\n      }\n    }\n    return originalSetTimeout(fn, delay, ...args);\n  };\n  stableCalendarCleanup();\n  [120, 420, 1000, 1800].forEach((delay) => setTimeout(stableCalendarCleanup, delay));\n})();\n</script>\n`;
    html = html.replace("</body>", `${patch}</body>`);
  }

  return html;
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

  const isHtml = event.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html");
  const isFresh = isHtml ||
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/cloudflare-client.js") ||
    url.pathname.endsWith("/calendar-keepers.js");

  if (isHtml) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request))
        .then(async response => {
          if (!response) return response;
          const html = await response.text();
          return new Response(patchHtml(html), {
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

  if (isFresh) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
