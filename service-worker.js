const CACHE_NAME = "gk-trainer-cloudflare-d1-landing-home-v1";
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

const LANDING_HOME_PATCH = String.raw`
;(() => {
  if (window.__gkLandingPatch) return;
  window.__gkLandingPatch = true;
  let autoLandingPending = true;

  function ensureLandingStyles() {
    if (document.getElementById("gkLandingStyles")) return;
    const style = document.createElement("style");
    style.id = "gkLandingStyles";
    style.textContent = [
      ".landing-card{display:grid;gap:18px;padding:20px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(180deg,rgba(7,17,11,.96),rgba(3,9,6,.98));box-shadow:var(--shadow);overflow:hidden}",
      ".landing-copy{display:grid;gap:8px}",
      ".landing-copy h2{font-size:30px;line-height:1.02;margin:0;letter-spacing:-.04em}",
      ".landing-hero{position:relative;min-height:365px;border-radius:26px;overflow:hidden;border:1px solid rgba(213,255,222,.14);background:radial-gradient(circle at 50% 38%,rgba(32,224,108,.24),transparent 38%),linear-gradient(180deg,#07110b,#020503 88%)}",
      ".landing-hero:before{content:\"\";position:absolute;inset:auto -20% 38px -20%;height:2px;background:linear-gradient(90deg,transparent,rgba(32,224,108,.95),transparent);box-shadow:0 0 40px rgba(32,224,108,.75)}",
      ".landing-hero:after{content:\"\";position:absolute;left:-10%;right:-10%;bottom:-8px;height:120px;background:linear-gradient(180deg,transparent,rgba(30,130,58,.30)),repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 1px,transparent 1px 8px);opacity:.55;filter:blur(.15px)}",
      ".gloves-svg{position:absolute;inset:0;width:100%;height:100%;display:block;filter:drop-shadow(0 26px 45px rgba(0,0,0,.6))}",
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

  function glovesSvg() {
    return '<svg class="gloves-svg" viewBox="0 0 420 520" aria-label="Guanti da portiere" role="img">' +
      '<defs><linearGradient id="gkA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171b19"/><stop offset=".55" stop-color="#030504"/><stop offset="1" stop-color="#0a3b1d"/></linearGradient><linearGradient id="gkB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2420"/><stop offset=".45" stop-color="#050807"/><stop offset="1" stop-color="#19b85a"/></linearGradient><filter id="gkGlow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<circle cx="210" cy="225" r="182" fill="none" stroke="rgba(32,224,108,.16)" stroke-width="3"/>' +
      '<path d="M75 430 C100 408 137 398 177 402 C231 407 279 404 346 429" stroke="rgba(32,224,108,.55)" stroke-width="5" fill="none" filter="url(#gkGlow)"/>' +
      '<g transform="translate(80 82) rotate(-7)">' +
      '<rect x="20" y="237" width="95" height="82" rx="20" fill="url(#gkA)" stroke="#1c2f24" stroke-width="3"/>' +
      '<path d="M30 238 L107 238 L102 305 L37 307 Z" fill="rgba(32,224,108,.08)" stroke="rgba(32,224,108,.30)"/>' +
      '<path d="M36 240 C20 195 19 144 32 68 C36 44 64 44 68 69 L72 180 L83 61 C86 35 118 37 117 64 L113 181 L128 73 C132 48 162 52 160 78 L145 201 C172 180 196 186 206 207 C217 231 197 255 163 269 C141 279 122 301 112 321 L41 321 C47 290 42 269 36 240 Z" fill="url(#gkA)" stroke="#d9efe2" stroke-width="3"/>' +
      '<path d="M50 72 L55 198 M96 60 L95 194 M142 84 L128 208" stroke="rgba(32,224,108,.45)" stroke-width="4" fill="none"/>' +
      '<circle cx="63" cy="285" r="3" fill="#20e06c"/><circle cx="78" cy="296" r="2.5" fill="#20e06c"/><circle cx="101" cy="278" r="2" fill="#20e06c"/>' +
      '</g>' +
      '<g transform="translate(190 55) rotate(8)">' +
      '<rect x="33" y="265" width="102" height="82" rx="20" fill="url(#gkB)" stroke="#1c2f24" stroke-width="3"/>' +
      '<path d="M45 276 H124 M45 298 H126 M45 320 H118" stroke="rgba(32,224,108,.50)" stroke-width="5"/>' +
      '<path d="M43 270 C22 219 22 167 42 72 C47 49 76 51 80 76 L86 190 L94 63 C96 36 130 36 132 65 L129 191 L147 72 C153 45 184 51 180 81 L163 205 C188 184 215 194 224 219 C233 244 211 269 174 283 C151 292 136 318 128 346 L53 346 C61 316 54 292 43 270 Z" fill="url(#gkB)" stroke="#d9efe2" stroke-width="3"/>' +
      '<path d="M59 93 L68 202 M112 70 L108 207 M161 96 L146 221" stroke="rgba(32,224,108,.65)" stroke-width="5" fill="none"/>' +
      '<path d="M80 238 C108 220 139 220 162 239" stroke="rgba(32,224,108,.75)" stroke-width="6" fill="none"/>' +
      '<circle cx="108" cy="256" r="27" fill="rgba(0,0,0,.35)" stroke="rgba(32,224,108,.65)" stroke-width="4"/>' +
      '<circle cx="70" cy="310" r="3" fill="#20e06c"/><circle cx="92" cy="286" r="2.5" fill="#20e06c"/><circle cx="128" cy="306" r="2" fill="#20e06c"/><circle cx="151" cy="274" r="2.5" fill="#20e06c"/>' +
      '</g>' +
    '</svg>';
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
      '<div class="landing-hero">' + glovesSvg() + '</div>' +
      '<div class="landing-stats"><div class="landing-stat"><span>Area</span><strong>Esercizi</strong></div><div class="landing-stat"><span>Piano</span><strong>Calendario</strong></div><div class="landing-stat"><span>Lettura</span><strong>Progressi</strong></div></div>' +
      '<div class="landing-actions"><button id="goExercisesBtn" class="primary-btn full" type="button">Vai agli esercizi</button></div>' +
    '</div>';
    main.insertBefore(landing, home || main.firstChild);
    const btn = document.getElementById("goExercisesBtn");
    if (btn) btn.addEventListener("click", () => { autoLandingPending = false; showView("home"); });
  }

  const previousShowView = showView;
  showView = function(view) {
    ensureLandingView();
    if (view === "home" && autoLandingPending) {
      autoLandingPending = false;
      return previousShowView("landing");
    }
    return previousShowView(view);
  };

  document.addEventListener("DOMContentLoaded", () => {
    ensureLandingView();
    const logo = document.querySelector(".topbar .eyebrow");
    const title = document.getElementById("screenTitle");
    [logo, title].forEach((el) => {
      if (!el) return;
      el.addEventListener("click", () => showView("landing"));
    });
  });
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
          const patched = source.includes("__gkLandingPatch") ? source : `${source}\n${LANDING_HOME_PATCH}`;
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
