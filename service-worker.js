const CACHE_NAME = "gk-trainer-cloudflare-d1-ios-polish-v1";
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

const TRUE_TIMER_JS_PATCH = String.raw`
;(() => {
  if (window.__gkRuntimeTrueTimerV3) return;
  window.__gkRuntimeTrueTimerV3 = true;

  function fmt(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    const secs = value % 60;
    return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function applyTrueTimer() {
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

      if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkRuntimeTrueTimerV3) {
        const previousStart = startWorkoutScreen;
        startWorkoutScreen = function() {
          const result = previousStart.apply(this, arguments);
          timeRemaining = 0;
          running = false;
          if (typeof updateTimer === "function") updateTimer();
          const phase = document.getElementById("phaseLabel");
          const startBtn = document.getElementById("startPauseBtn");
          if (phase) phase.textContent = "Pronto";
          if (startBtn) startBtn.textContent = "Start";
          return result;
        };
        startWorkoutScreen.__gkRuntimeTrueTimerV3 = true;
      }

      if (typeof finishWorkout === "function" && !finishWorkout.__gkRuntimeTrueTimerV3) {
        const previousFinish = finishWorkout;
        finishWorkout = function() {
          const elapsedSeconds = Math.max(0, Number(typeof timeRemaining === "undefined" ? 0 : timeRemaining));
          if (selectedExercise) {
            selectedExercise = Object.assign({}, selectedExercise, {
              durationMin: Math.max(1, Math.ceil(elapsedSeconds / 60)),
              actualSeconds: elapsedSeconds
            });
          }
          return previousFinish.apply(this, arguments);
        };
        finishWorkout.__gkRuntimeTrueTimerV3 = true;
      }
    } catch {}
  }

  applyTrueTimer();
  [0, 80, 250, 800, 1600].forEach((delay) => setTimeout(applyTrueTimer, delay));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyTrueTimer);
})();
`;

const IOS_POLISH_PATCH = String.raw`
<style id="gkIosPolishStyleV1">
  .planner-session-title { display: none !important; }
  .stats-grid, .coach-card, .landing-stats { display: none !important; }
  .section-header h3 { display: none !important; }
  .topbar { align-items: center !important; }
  #settingsBtn.icon-btn, .topbar .icon-btn { width: 56px !important; height: 56px !important; min-width: 56px !important; min-height: 56px !important; display: grid !important; place-items: center !important; padding: 0 !important; line-height: 1 !important; font-size: 24px !important; border-radius: 22px !important; }
  input, select, textarea { box-sizing: border-box !important; max-width: 100% !important; }
  #dayPlanTime, #dayPlanTotal, #sessionDateInput, #physicalSaveDate { width: 100% !important; min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; -webkit-appearance: none !important; appearance: none !important; text-align: center !important; padding-left: 14px !important; padding-right: 14px !important; }
  .calendar-list-card, .progress-card, .keeper-selector-card, .physical-save-meta, .timer-card, .planner-card, .training-card { max-width: 100% !important; overflow: hidden !important; box-sizing: border-box !important; }
  #bottomNav [data-tab="performance"], #bottomNav [data-tab="profile"] { display: none !important; }
  @media (max-width: 480px) {
    html, body { overflow-x: hidden !important; }
    .app-shell { width: 100% !important; max-width: 490px !important; padding-left: 16px !important; padding-right: 16px !important; padding-bottom: calc(124px + env(safe-area-inset-bottom, 0px)) !important; overflow-x: hidden !important; }
    main { padding-bottom: calc(118px + env(safe-area-inset-bottom, 0px)) !important; }
    .topbar { display: grid !important; grid-template-columns: minmax(0, 1fr) 56px !important; gap: 14px !important; padding-top: calc(12px + env(safe-area-inset-top, 0px)) !important; }
    .topbar h1, #screenTitle { min-width: 0 !important; overflow-wrap: anywhere !important; }
    #bottomNav.bottom-nav { position: fixed !important; left: 12px !important; right: 12px !important; bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; transform: none !important; width: auto !important; max-width: none !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 4px !important; padding: 6px !important; border-radius: 22px !important; overflow: hidden !important; }
    #bottomNav .nav-btn { min-width: 0 !important; width: auto !important; max-width: 100% !important; padding: 12px 2px !important; font-size: clamp(11px, 3.05vw, 13px) !important; line-height: 1.1 !important; letter-spacing: -0.055em !important; white-space: nowrap !important; text-align: center !important; overflow: hidden !important; text-overflow: clip !important; border-radius: 18px !important; }
    #bottomNav .nav-btn.active { min-width: 0 !important; }
    .hero-card, .calendar-card, .calendar-list-card, .progress-card, .timer-card, .keeper-selector-card { border-radius: 24px !important; }
    .planner-grid, .planner-toolbar, .planner-summary, .planner-actions, .physical-chart-controls, .physical-kpis { grid-template-columns: minmax(0, 1fr) !important; }
    .planner-card, .planner-card *, .physical-save-meta, .physical-save-meta *, .keeper-selector-card, .keeper-selector-card * { min-width: 0 !important; }
    .planner-grid label, .keeper-selector-card label, .physical-save-meta label { width: 100% !important; max-width: 100% !important; overflow: hidden !important; }
    #dayPlanTime, #dayPlanTotal, #sessionDateInput, #physicalSaveDate { min-height: 56px !important; border-radius: 18px !important; }
    .physical-save-meta { padding: 14px !important; border-radius: 22px !important; }
    .training-item-top { grid-template-columns: minmax(0, 1fr) auto !important; }
    .training-item textarea { font-size: 15px !important; line-height: 1.35 !important; }
  }
</style>
<script id="gkIosPolishScriptV1">
(() => {
  if (window.__gkIosPolishV1) return;
  window.__gkIosPolishV1 = true;

  const norm = (value) => String(value || "").trim().toLowerCase();
  const fmt = (seconds) => {
    const value = Math.max(0, Number(seconds || 0));
    return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
  };

  function cleanCompletedSessions() {
    document.querySelectorAll(".planner-session-title").forEach((section) => section.remove());
  }

  function cleanHomeHeader() {
    const home = document.getElementById("homeView");
    const title = document.getElementById("screenTitle");
    if (home && home.classList.contains("active") && title && /FIGC/i.test(title.textContent || "")) title.textContent = "Esercizi";
    const summary = document.getElementById("profileSummaryText");
    if (summary) {
      summary.textContent = String(summary.textContent || "")
        .replace(/\s*·\s*esercizi dal documento FIGC\.?/gi, "")
        .replace(/esercizi dal documento FIGC\.?/gi, "")
        .trim();
    }
  }

  function cleanHiddenWorkoutParts() {
    document.querySelectorAll(".stats-grid,.coach-card,.landing-stats").forEach((element) => {
      element.style.display = "none";
      element.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll("#calendarView [data-plan-start]").forEach((button) => button.remove());
  }

  function polishNav() {
    const nav = document.getElementById("bottomNav");
    if (!nav) return;
    nav.querySelectorAll('[data-tab="performance"],[data-tab="profile"]').forEach((button) => button.remove());
    nav.style.setProperty("grid-template-columns", "repeat(4, minmax(0, 1fr))", "important");
  }

  function patchTimerFunctions() {
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
      if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkIosPolishTrueTimer) {
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
          scheduleClean();
          return result;
        };
        startWorkoutScreen.__gkIosPolishTrueTimer = true;
      }
      if (typeof finishWorkout === "function" && !finishWorkout.__gkIosPolishTrueTimer) {
        const previousFinish = finishWorkout;
        finishWorkout = function() {
          const elapsedSeconds = Math.max(0, Number(typeof timeRemaining === "undefined" ? 0 : timeRemaining));
          if (selectedExercise) selectedExercise = Object.assign({}, selectedExercise, { durationMin: Math.max(1, Math.ceil(elapsedSeconds / 60)), actualSeconds: elapsedSeconds });
          return previousFinish.apply(this, arguments);
        };
        finishWorkout.__gkIosPolishTrueTimer = true;
      }
    } catch {}
  }

  function rebindWorkoutButtons() {
    const start = document.getElementById("startPauseBtn");
    if (start && start.dataset.gkTrueTimerBound !== "v1") {
      const next = start.cloneNode(true);
      next.dataset.gkTrueTimerBound = "v1";
      start.replaceWith(next);
      next.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        patchTimerFunctions();
        if (typeof toggleTimer === "function") toggleTimer();
      }, true);
    }

    const finish = document.getElementById("finishBtn");
    if (finish && finish.dataset.gkTrueTimerBound !== "v1") {
      const next = finish.cloneNode(true);
      next.dataset.gkTrueTimerBound = "v1";
      finish.replaceWith(next);
      next.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        patchTimerFunctions();
        if (typeof finishWorkout === "function") finishWorkout();
        setTimeout(scheduleClean, 120);
      }, true);
    }
  }

  function observeCalendar() {
    const box = document.getElementById("selectedDateSessions");
    if (!box || box.dataset.gkCleanObserver === "v1") return;
    box.dataset.gkCleanObserver = "v1";
    new MutationObserver(() => cleanCompletedSessions()).observe(box, { childList: true, subtree: true });
  }

  function scheduleClean() {
    cleanCompletedSessions();
    cleanHomeHeader();
    cleanHiddenWorkoutParts();
    polishNav();
    observeCalendar();
    [80, 250, 700].forEach((delay) => setTimeout(() => {
      cleanCompletedSessions();
      cleanHomeHeader();
      cleanHiddenWorkoutParts();
      polishNav();
      observeCalendar();
    }, delay));
  }

  function boot() {
    patchTimerFunctions();
    rebindWorkoutButtons();
    scheduleClean();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-tab="home"],[data-tab="calendar"],[data-tab="training"],[data-tab="progress"],.calendar-day[data-date],#prevMonthBtn,#nextMonthBtn,#addPlanExerciseBtn,#autoPlanBtn,#clearPlanBtn,[data-plan-remove],#saveCalendarPlanBtn,[data-training-start],#finishBtn')) {
      setTimeout(boot, 60);
      setTimeout(scheduleClean, 300);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("#dayPlanTime,#dayPlanTotal,.plan-item-minutes,#sessionDateInput,#physicalSaveDate")) {
      setTimeout(scheduleClean, 60);
    }
  });

  [100, 400, 1000, 1800].forEach((delay) => setTimeout(boot, delay));
})();
</script>`;

function patchIndexHtml(source) {
  if (source.includes("gkIosPolishV1")) return source;
  if (source.includes("</body>")) return source.replace("</body>", `${IOS_POLISH_PATCH}\n</body>`);
  return `${source}\n${IOS_POLISH_PATCH}`;
}

function patchRuntimeJs(source) {
  if (source.includes("__gkRuntimeTrueTimerV3")) return source;
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

  if (url.pathname.endsWith("/app.js") || url.pathname.endsWith("/cloudflare-client.js")) {
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