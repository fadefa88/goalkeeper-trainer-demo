const CACHE_NAME = "gk-trainer-home-nav-v2";
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

const HTML_COMPAT_PATCH = String.raw`
<style id="gkHomeNavForceStyleV2">
  body:has(#landingView.active) #bottomNav,
  body:has(#landingView.active) #bottomNav.hidden {
    display: grid !important;
  }
</style>
<script id="gkHomeNavCompatV2">
(() => {
  function ensureProgressCompat() {
    const progress = document.getElementById("progressView");
    if (!progress) return;
    const defs = [
      ["progressKpis", "progress-kpis"],
      ["monthlyChart", "monthly-chart"],
      ["exerciseQualityList", "quality-list"]
    ];
    defs.forEach(([id, className]) => {
      if (document.getElementById(id)) return;
      const el = document.createElement("div");
      el.id = id;
      el.className = className;
      el.hidden = true;
      progress.appendChild(el);
    });
  }

  function cleanCalendar() {
    document.querySelectorAll(".planner-session-title").forEach((section) => section.remove());
    document.querySelectorAll("#calendarView [data-plan-start]").forEach((button) => button.remove());
  }

  function cleanNav() {
    const nav = document.getElementById("bottomNav");
    if (!nav) return;
    nav.querySelectorAll('[data-tab="performance"],[data-tab="profile"]').forEach((button) => button.remove());
    nav.style.setProperty("grid-template-columns", "repeat(4,minmax(0,1fr))", "important");
  }

  function forceNavVisible() {
    const nav = document.getElementById("bottomNav");
    if (!nav) return;
    nav.classList.remove("hidden");
    nav.hidden = false;
    nav.removeAttribute("hidden");
    nav.style.setProperty("display", "grid", "important");
    nav.style.setProperty("grid-template-columns", "repeat(4,minmax(0,1fr))", "important");
  }

  function keepNavOnLanding() {
    const landing = document.getElementById("landingView");
    if (!landing || !landing.classList.contains("active")) return;
    forceNavVisible();
    document.querySelectorAll("#bottomNav .nav-btn").forEach((btn) => btn.classList.remove("active"));
  }

  function run() {
    ensureProgressCompat();
    cleanCalendar();
    cleanNav();
    keepNavOnLanding();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
  [0, 40, 120, 300, 800, 1500].forEach((delay) => setTimeout(run, delay));

  document.addEventListener("click", (event) => {
    if (event.target.closest("#homeTopBtn")) {
      [0, 20, 80, 200, 500].forEach((delay) => setTimeout(() => {
        forceNavVisible();
        keepNavOnLanding();
      }, delay));
      return;
    }
    if (event.target.closest("[data-tab],[data-quick-go],.calendar-day[data-date],#prevMonthBtn,#nextMonthBtn,#addPlanExerciseBtn,#autoPlanBtn,#clearPlanBtn,[data-plan-remove],#saveCalendarPlanBtn")) {
      setTimeout(run, 0);
      setTimeout(run, 80);
      setTimeout(run, 300);
    }
  }, true);
})();
</script>`;

function patchHomeFunction(source) {
  return source
    .replace(
      'document.getElementById("bottomNav")?.classList.toggle("hidden", !localStorage.getItem("gk_profile") && !window.cloudProfile);',
      'document.getElementById("bottomNav")?.classList.remove("hidden");'
    )
    .replace(
      'document.getElementById("bottomNav")?.classList.toggle("hidden", !localStorage.getItem("gk_profile") && !window.cloudProfile)',
      'document.getElementById("bottomNav")?.classList.remove("hidden")'
    );
}

function patchHtml(source) {
  let html = patchHomeFunction(source);
  if (html.includes("gkHomeNavCompatV2")) return html;
  if (html.includes("</body>")) return html.replace("</body>", `${HTML_COMPAT_PATCH}\n</body>`);
  return `${html}\n${HTML_COMPAT_PATCH}`;
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
  const isFreshAsset = url.pathname.endsWith("/style.css") || url.pathname.endsWith("/app.js") || url.pathname.endsWith("/cloudflare-client.js") || url.pathname.endsWith("/calendar-keepers.js");

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

  if (isFreshAsset) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
