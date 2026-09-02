const CACHE_NAME = "gk-trainer-cloudflare-d1-ios-polish-v2";
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

const IOS_STYLE_PATCH = String.raw`

/* gk-ios-polish-v2 */
html, body {
  max-width: 100% !important;
  overflow-x: hidden !important;
}

* {
  min-width: 0;
}

body {
  -webkit-text-size-adjust: 100% !important;
}

.app-shell {
  width: 100% !important;
  max-width: 490px !important;
  overflow-x: hidden !important;
  padding-left: 16px !important;
  padding-right: 16px !important;
  padding-bottom: calc(140px + env(safe-area-inset-bottom, 0px)) !important;
}

main {
  max-width: 100% !important;
  overflow-x: hidden !important;
  padding-bottom: calc(118px + env(safe-area-inset-bottom, 0px)) !important;
}

.topbar {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 56px !important;
  align-items: center !important;
  gap: 14px !important;
  padding-top: calc(12px + env(safe-area-inset-top, 0px)) !important;
}

.topbar > div,
#screenTitle {
  min-width: 0 !important;
  overflow-wrap: anywhere !important;
}

#settingsBtn.icon-btn,
.topbar .icon-btn {
  width: 56px !important;
  height: 56px !important;
  min-width: 56px !important;
  min-height: 56px !important;
  padding: 0 !important;
  display: grid !important;
  place-items: center !important;
  border-radius: 22px !important;
  line-height: 1 !important;
  font-size: 0 !important;
  text-align: center !important;
}

#settingsBtn.icon-btn::before,
.topbar .icon-btn::before {
  content: "⚙";
  display: block;
  font-size: 26px !important;
  line-height: 1 !important;
  transform: translateY(-1px);
}

#bottomNav.bottom-nav {
  left: 12px !important;
  right: 12px !important;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
  transform: none !important;
  width: auto !important;
  max-width: none !important;
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 4px !important;
  padding: 6px !important;
  border-radius: 22px !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

#bottomNav [data-tab="performance"],
#bottomNav [data-tab="profile"] {
  display: none !important;
}

#bottomNav .nav-btn {
  min-width: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  padding: 12px 1px !important;
  border-radius: 17px !important;
  font-size: clamp(10px, 2.65vw, 12px) !important;
  line-height: 1.05 !important;
  letter-spacing: -0.075em !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: clip !important;
  text-align: center !important;
}

#bottomNav .nav-btn[data-tab="training"] {
  font-size: clamp(9.5px, 2.45vw, 11px) !important;
}

#bottomNav .nav-btn.active {
  min-width: 0 !important;
}

input,
select,
textarea {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}

input[type="date"],
input[type="time"],
input[type="number"],
#dayPlanTime,
#dayPlanTotal,
#sessionDateInput,
#physicalSaveDate {
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  -webkit-appearance: none !important;
  appearance: none !important;
  text-align: center !important;
  padding-left: 14px !important;
  padding-right: 14px !important;
  border-radius: 18px !important;
  box-sizing: border-box !important;
}

.calendar-card,
.calendar-list-card,
.progress-card,
.keeper-selector-card,
.timer-card,
.planner-card,
.training-card,
.physical-save-meta,
.measure-card,
.quality-item {
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

.planner-card,
.planner-card *,
.keeper-selector-card,
.keeper-selector-card *,
.physical-save-meta,
.physical-save-meta *,
.progress-card,
.progress-card * {
  max-width: 100% !important;
  box-sizing: border-box !important;
}

.planner-grid,
.planner-toolbar,
.planner-summary,
.planner-actions,
.physical-chart-controls,
.physical-kpis {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
}

.planner-grid label,
.keeper-selector-card label,
.physical-save-meta label {
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
}

.planner-session-title {
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
}

.stats-grid,
.coach-card,
.landing-stats {
  display: none !important;
}

.section-header h3 {
  display: none !important;
}

@media (max-width: 430px) {
  .hero-card,
  .calendar-card,
  .calendar-list-card,
  .progress-card,
  .timer-card,
  .keeper-selector-card,
  .training-card {
    border-radius: 24px !important;
  }

  h1, #screenTitle {
    font-size: clamp(31px, 8.4vw, 42px) !important;
    line-height: 1.04 !important;
  }

  h2 {
    font-size: clamp(26px, 7vw, 38px) !important;
    line-height: 1.1 !important;
  }

  .planner-item,
  .training-item-top,
  .training-plan-head {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .training-item textarea {
    min-height: 58px !important;
    max-height: 110px !important;
    font-size: 15px !important;
    line-height: 1.35 !important;
  }
}
`;

const HTML_PATCH = String.raw`
<style id="gkIosPolishStyleV2">${IOS_STYLE_PATCH}</style>
<script id="gkIosPolishScriptV2">
(() => {
  if (window.__gkIosPolishV2) return;
  window.__gkIosPolishV2 = true;

  const fmt = (seconds) => {
    const value = Math.max(0, Number(seconds || 0));
    return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
  };

  function removeCompletedSessions() {
    document.querySelectorAll(".planner-session-title").forEach((node) => node.remove());
    document.querySelectorAll("#calendarView p,#calendarView h2,#calendarView h3,#calendarView strong").forEach((node) => {
      if (String(node.textContent || "").trim().toLowerCase() === "sessioni completate") {
        const block = node.closest(".planner-session-title") || node.parentElement;
        if (block) block.remove();
      }
    });
  }

  function cleanHomeText() {
    const title = document.getElementById("screenTitle");
    const home = document.getElementById("homeView");
    if (home && home.classList.contains("active") && title && /FIGC/i.test(title.textContent || "")) title.textContent = "Esercizi";
    const summary = document.getElementById("profileSummaryText");
    if (summary) {
      summary.textContent = String(summary.textContent || "")
        .replace(/\s*·\s*esercizi dal documento FIGC\.?/gi, "")
        .replace(/esercizi dal documento FIGC\.?/gi, "")
        .trim();
    }
  }

  function trimNavigation() {
    const nav = document.getElementById("bottomNav");
    if (!nav) return;
    nav.querySelectorAll('[data-tab="performance"],[data-tab="profile"]').forEach((node) => node.remove());
    nav.style.setProperty("grid-template-columns", "repeat(4, minmax(0, 1fr))", "important");
  }

  function hideWorkoutExtras() {
    document.querySelectorAll(".stats-grid,.coach-card,.landing-stats").forEach((node) => {
      node.style.display = "none";
      node.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll("#calendarView [data-plan-start]").forEach((node) => node.remove());
  }

  function patchTrueTimer() {
    try {
      updateTimer = function() {
        const display = document.getElementById("timerDisplay");
        const current = typeof timeRemaining === "undefined" ? 0 : timeRemaining;
        if (display) display.textContent = fmt(current);
      };
      toggleTimer = function() {
        running = !running;
        const startBtn = document.getElementById("startPauseBtn");
        const phase = document.getElementById("phaseLabel");
        if (startBtn) startBtn.textContent = running ? "Pausa" : "Start";
        if (phase) phase.textContent = running ? "Timer attivo" : "In pausa";
        if (running && !timer) {
          timer = setInterval(() => {
            if (!running) return;
            timeRemaining = Math.max(0, Number(timeRemaining || 0)) + 1;
            updateTimer();
          }, 1000);
        }
      };
      if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkTrueTimerV2) {
        const previousStart = startWorkoutScreen;
        startWorkoutScreen = function() {
          const result = previousStart.apply(this, arguments);
          timeRemaining = 0;
          running = false;
          updateTimer();
          const phase = document.getElementById("phaseLabel");
          const startBtn = document.getElementById("startPauseBtn");
          if (phase) phase.textContent = "Pronto";
          if (startBtn) startBtn.textContent = "Start";
          return result;
        };
        startWorkoutScreen.__gkTrueTimerV2 = true;
      }
    } catch {}
  }

  let queued = false;
  function run() {
    queued = false;
    patchTrueTimer();
    removeCompletedSessions();
    cleanHomeText();
    trimNavigation();
    hideWorkoutExtras();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
    setTimeout(run, 120);
    setTimeout(run, 500);
  }

  function attachCalendarObserver() {
    const box = document.getElementById("selectedDateSessions");
    if (!box || box.dataset.gkIosPolishV2 === "1") return;
    box.dataset.gkIosPolishV2 = "1";
    new MutationObserver(schedule).observe(box, { childList: true, subtree: true });
  }

  function boot() {
    run();
    attachCalendarObserver();
    setTimeout(() => { run(); attachCalendarObserver(); }, 250);
    setTimeout(() => { run(); attachCalendarObserver(); }, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-tab="home"],[data-tab="calendar"],[data-tab="training"],[data-tab="progress"],.calendar-day[data-date],#prevMonthBtn,#nextMonthBtn,#addPlanExerciseBtn,#autoPlanBtn,#clearPlanBtn,[data-plan-remove],#saveCalendarPlanBtn,[data-training-start],#finishBtn')) schedule();
  });
  document.addEventListener("change", (event) => {
    if (event.target.closest("#dayPlanTime,#dayPlanTotal,.plan-item-minutes,#sessionDateInput,#physicalSaveDate")) schedule();
  });
})();
</script>`;

const TRUE_TIMER_JS_PATCH = String.raw`
;(() => {
  if (window.__gkTrueTimerRuntimeV2) return;
  window.__gkTrueTimerRuntimeV2 = true;
  const fmt = (seconds) => {
    const value = Math.max(0, Number(seconds || 0));
    return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
  };
  function apply() {
    try {
      updateTimer = function() {
        const display = document.getElementById("timerDisplay");
        const current = typeof timeRemaining === "undefined" ? 0 : timeRemaining;
        if (display) display.textContent = fmt(current);
      };
      toggleTimer = function() {
        running = !running;
        const startBtn = document.getElementById("startPauseBtn");
        const phase = document.getElementById("phaseLabel");
        if (startBtn) startBtn.textContent = running ? "Pausa" : "Start";
        if (phase) phase.textContent = running ? "Timer attivo" : "In pausa";
        if (running && !timer) {
          timer = setInterval(() => {
            if (!running) return;
            timeRemaining = Math.max(0, Number(timeRemaining || 0)) + 1;
            updateTimer();
          }, 1000);
        }
      };
      if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkTrueTimerRuntimeV2) {
        const previous = startWorkoutScreen;
        startWorkoutScreen = function() {
          const result = previous.apply(this, arguments);
          timeRemaining = 0;
          running = false;
          updateTimer();
          return result;
        };
        startWorkoutScreen.__gkTrueTimerRuntimeV2 = true;
      }
    } catch {}
  }
  apply();
  [80, 250, 800, 1600].forEach((delay) => setTimeout(apply, delay));
})();
`;

function patchIndexHtml(source) {
  if (source.includes("gkIosPolishV2")) return source;
  if (source.includes("</body>")) return source.replace("</body>", `${HTML_PATCH}\n</body>`);
  return `${source}\n${HTML_PATCH}`;
}

function patchStyleCss(source) {
  if (source.includes("gk-ios-polish-v2")) return source;
  return `${source}\n${IOS_STYLE_PATCH}`;
}

function patchRuntimeJs(source) {
  if (source.includes("__gkTrueTimerRuntimeV2")) return source;
  return `${source}\n${TRUE_TIMER_JS_PATCH}`;
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

  if (url.pathname.endsWith("/style.css")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request))
        .then(async response => {
          if (!response) return response;
          const source = await response.text();
          return new Response(patchStyleCss(source), {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": "text/css; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        })
    );
    return;
  }

  if (url.pathname.endsWith("/app.js") || url.pathname.endsWith("/cloudflare-client.js") || url.pathname.endsWith("/calendar-keepers.js")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request))
        .then(async response => {
          if (!response) return response;
          const source = await response.text();
          return new Response(patchRuntimeJs(source), {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        })
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});