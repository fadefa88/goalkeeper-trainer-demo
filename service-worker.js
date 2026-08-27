const CACHE_NAME = "gk-trainer-cloudflare-d1-calendar-keepers-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./style.css",
  "./app.js",
  "./cloudflare-client.js",
  "./manifest.json",
  "./icon.svg",
  "./gk-home-hero.png"
];

const CLIENT_PATCH = String.raw`
;(() => {
  if (window.__gkLandingHomeImagePatch && window.__gkCalendarKeeperPatch) return;

  if (!window.__gkLandingHomeImagePatch) {
    window.__gkLandingHomeImagePatch = true;
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

    const previousShowView = showView;
    showView = function(view) {
      ensureLandingView();
      if (view === "home" && autoLandingPending) {
        autoLandingPending = false;
        return previousShowView("landing");
      }
      const result = previousShowView(view);
      setTimeout(() => window.__renderKeeperAttendance?.(), 0);
      return result;
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
  }

  if (!window.__gkCalendarKeeperPatch) {
    window.__gkCalendarKeeperPatch = true;

    function ensureAttendanceStyles() {
      if (document.getElementById("gkAttendanceStyles")) return;
      const style = document.createElement("style");
      style.id = "gkAttendanceStyles";
      style.textContent = [
        ".keeper-attendance-card{display:grid;gap:12px;padding:14px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.045)}",
        ".keeper-attendance-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}",
        ".keeper-attendance-head h3{margin:0;font-size:16px}",
        ".keeper-attendance-list{display:grid;gap:8px}",
        ".keeper-attendance-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:15px;border:1px solid var(--line);background:rgba(7,17,11,.60)}",
        ".keeper-attendance-row span{font-weight:850;color:var(--text)}",
        ".keeper-attendance-row small{display:block;margin-top:2px;color:var(--muted);font-size:11px;font-weight:600}",
        ".keeper-attendance-row input{width:22px;height:22px;accent-color:var(--green)}",
        ".keeper-attendance-summary{color:var(--muted);font-size:12px;line-height:1.35}",
        "@media(max-width:390px){.keeper-attendance-head{display:grid}.keeper-attendance-row{align-items:flex-start}}"
      ].join("");
      document.head.appendChild(style);
    }

    function todayKeyLocal(d) {
      const value = d || new Date();
      return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
    }

    function selectedCalendarKey() {
      const selected = document.querySelector('.calendar-day.selected[data-date]');
      return selected?.dataset?.date || todayKeyLocal();
    }

    function attendanceStorageKey() {
      return 'gk_keeper_attendance_v1';
    }

    function readAttendanceMap() {
      try { return JSON.parse(localStorage.getItem(attendanceStorageKey()) || '{}'); }
      catch { return {}; }
    }

    function writeAttendanceMap(map) {
      localStorage.setItem(attendanceStorageKey(), JSON.stringify(map));
    }

    function keeperKey(keeper, index) {
      return String(keeper?.id || keeper?.name || ('keeper-' + index));
    }

    function profileKeepers() {
      try { return getProfile()?.keepers || []; }
      catch { return []; }
    }

    function presentKeysForDate(dateKey, keepers) {
      const map = readAttendanceMap();
      const stored = map[dateKey];
      if (Array.isArray(stored)) return stored.map(String);
      return keepers.map((keeper, index) => keeperKey(keeper, index));
    }

    function renderSummary(card, dateKey, keepers) {
      const summary = card.querySelector('.keeper-attendance-summary');
      if (!summary) return;
      const present = presentKeysForDate(dateKey, keepers);
      const names = keepers
        .filter((keeper, index) => present.includes(keeperKey(keeper, index)))
        .map((keeper, index) => keeper.name || ('Portiere ' + (index + 1)));
      summary.textContent = names.length ? (names.length + ' presenti: ' + names.join(', ')) : 'Nessun portiere selezionato per questa giornata.';
    }

    function saveAttendanceFromCard(card, dateKey, keepers) {
      const map = readAttendanceMap();
      const checked = Array.from(card.querySelectorAll('.keeper-attendance-check:checked')).map((input) => String(input.value));
      map[dateKey] = checked;
      writeAttendanceMap(map);
      renderSummary(card, dateKey, keepers);
    }

    function renderKeeperAttendance() {
      ensureAttendanceStyles();
      const calendarView = document.getElementById('calendarView');
      if (!calendarView?.classList.contains('active')) return;
      const box = document.getElementById('selectedDateSessions');
      if (!box) return;
      const planner = box.querySelector('.planner-card') || box;
      if (!planner) return;
      const dateKey = selectedCalendarKey();
      const keepers = profileKeepers();
      const old = planner.querySelector('.keeper-attendance-card');
      if (old && old.dataset.date === dateKey && old.dataset.count === String(keepers.length)) return;
      if (old) old.remove();
      const present = presentKeysForDate(dateKey, keepers);
      const card = document.createElement('div');
      card.className = 'keeper-attendance-card';
      card.dataset.date = dateKey;
      card.dataset.count = String(keepers.length);
      card.innerHTML = '<div class="keeper-attendance-head"><div><p class="eyebrow">Presenze</p><h3>Portieri presenti</h3></div><span class="pill">' + keepers.length + ' in rosa</span></div>' +
        (keepers.length ? '<div class="keeper-attendance-list">' + keepers.map((keeper, index) => {
          const key = keeperKey(keeper, index);
          const checked = present.includes(key) ? ' checked' : '';
          const subtitle = [keeper.height ? keeper.height + ' cm' : '', keeper.weight ? keeper.weight + ' kg' : ''].filter(Boolean).join(' · ');
          return '<label class="keeper-attendance-row"><div><span>' + escapeHtml(keeper.name || ('Portiere ' + (index + 1))) + '</span>' + (subtitle ? '<small>' + escapeHtml(subtitle) + '</small>' : '') + '</div><input class="keeper-attendance-check" type="checkbox" value="' + escapeHtml(key) + '"' + checked + ' /></label>';
        }).join('') + '</div>' : '<div class="planner-empty">Configura prima i portieri nel profilo.</div>') +
        '<div class="keeper-attendance-summary"></div>';
      const grid = planner.querySelector('.planner-grid');
      if (grid?.nextSibling) planner.insertBefore(card, grid.nextSibling);
      else planner.prepend(card);
      card.querySelectorAll('.keeper-attendance-check').forEach((input) => {
        input.addEventListener('change', () => saveAttendanceFromCard(card, dateKey, keepers));
      });
      renderSummary(card, dateKey, keepers);
    }

    window.__renderKeeperAttendance = renderKeeperAttendance;

    document.addEventListener('DOMContentLoaded', () => {
      ensureAttendanceStyles();
      document.addEventListener('click', (event) => {
        if (event.target.closest('.calendar-day[data-date]') || event.target.closest('#prevMonthBtn') || event.target.closest('#nextMonthBtn')) {
          setTimeout(renderKeeperAttendance, 80);
        }
      });
      const observer = new MutationObserver(() => setTimeout(renderKeeperAttendance, 0));
      const startObserver = () => {
        const box = document.getElementById('selectedDateSessions');
        if (box) observer.observe(box, { childList: true, subtree: true });
      };
      startObserver();
      setTimeout(startObserver, 600);
      setTimeout(renderKeeperAttendance, 250);
    });
  }
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
          const patched = source.includes("__gkCalendarKeeperPatch") ? source : `${source}\n${CLIENT_PATCH}`;
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
