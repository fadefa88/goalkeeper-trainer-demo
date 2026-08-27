const CACHE_NAME = "gk-trainer-cloudflare-d1-calendar-keepers-direct-v1";
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

const LANDING_HOME_PATCH = String.raw`
;(() => {
  if (window.__gkLandingHomeImagePatchDirect) return;
  window.__gkLandingHomeImagePatchDirect = true;
  let autoLandingPending = true;

  function ensureLandingStyles() {
    if (document.getElementById("gkLandingStyles")) return;
    const style = document.createElement("style");
    style.id = "gkLandingStyles";
    style.textContent = [
      ".landing-card{display:grid;gap:18px;padding:20px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(180deg,rgba(7,17,11,.96),rgba(3,9,6,.98));box-shadow:var(--shadow);overflow:hidden}",
      ".landing-copy{display:grid;gap:8px}",
      ".landing-copy h2{font-size:30px;line-height:1.02;margin:0;letter-spacing:-.04em}",
      ".landing-hero{position:relative;min-height:365px;border-radius:26px;overflow:hidden;border:1px solid rgba(213,255,222,.14);background:linear-gradient(180deg,rgba(7,17,11,.05),rgba(7,17,11,.78)),url('/gk-home-hero.png') center/cover no-repeat;box-shadow:inset 0 -90px 120px rgba(0,0,0,.50)}",
      ".landing-hero:after{content:\"\";position:absolute;left:0;right:0;bottom:0;height:44%;background:linear-gradient(180deg,transparent,rgba(3,9,6,.78));pointer-events:none}",
      ".landing-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}",
      ".landing-stat{padding:12px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid var(--line)}",
      ".landing-stat span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:900}",
      ".landing-stat strong{display:block;margin-top:4px;font-size:18px;color:var(--text)}",
      ".landing-actions{display:grid;grid-template-columns:1fr;gap:10px}",
      ".topbar .eyebrow,#screenTitle{cursor:pointer}",
      "@media(max-width:390px){.landing-card{padding:16px}.landing-copy h2{font-size:26px}.landing-hero{min-height:315px}.landing-stats{grid-template-columns:1fr}.landing-stat{padding:11px}}"
    ].join("");
    document.head.appendChild(style);
  }

  function ensureLandingView() {
    ensureLandingStyles();
    if (document.getElementById("landingView")) return;
    const main = document.querySelector("main");
    const home = document.getElementById("homeView");
    if (!main) return;
    const landing = document.createElement("section");
    landing.id = "landingView";
    landing.className = "view";
    landing.innerHTML = '<div class="landing-card">' +
      '<div class="landing-copy"><p class="eyebrow">GK Trainer</p><h2>Portieri pronti, seduta sotto controllo.</h2><p class="muted">Organizza esercizi, calendario e progressi da un punto unico. La barra sotto resta sempre disponibile.</p></div>' +
      '<div class="landing-hero" role="img" aria-label="Guanti da portiere"></div>' +
      '<div class="landing-stats"><div class="landing-stat"><span>Area</span><strong>Esercizi</strong></div><div class="landing-stat"><span>Piano</span><strong>Calendario</strong></div><div class="landing-stat"><span>Lettura</span><strong>Progressi</strong></div></div>' +
      '<div class="landing-actions"><button id="goExercisesBtn" class="primary-btn full" type="button">Vai agli esercizi</button></div>' +
    '</div>';
    main.insertBefore(landing, home || main.firstChild);
    const btn = document.getElementById("goExercisesBtn");
    if (btn) btn.addEventListener("click", () => { autoLandingPending = false; showView("home"); });
  }

  function hookShowView() {
    if (typeof showView !== "function" || showView.__gkLandingHomeHook) return;
    const previousShowView = showView;
    showView = function(view) {
      ensureLandingView();
      if (view === "home" && autoLandingPending) {
        autoLandingPending = false;
        return previousShowView("landing");
      }
      return previousShowView(view);
    };
    showView.__gkLandingHomeHook = true;
  }

  function bootLanding() {
    ensureLandingView();
    hookShowView();
    const logo = document.querySelector(".topbar .eyebrow");
    const title = document.getElementById("screenTitle");
    [logo, title].forEach((el) => {
      if (!el) return;
      el.addEventListener("click", () => showView("landing"));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootLanding);
  else bootLanding();
})();
`;

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

  if (url.pathname.endsWith("/cloudflare-client.js")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async response => {
          const source = await response.text();
          const patched = source.includes("__gkLandingHomeImagePatchDirect") ? source : `${source}\n${LANDING_HOME_PATCH}`;
          return new Response(patched, {
            status: 200,
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
