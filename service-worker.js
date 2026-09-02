const CACHE_NAME = "gk-trainer-cloudflare-d1-true-timer-v1";
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

const COUNT_UP_TIMER_PATCH = String.raw`
;(() => {
  function fmt(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    const secs = value % 60;
    return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function setTimerToZero() {
    try {
      if (typeof timeRemaining !== "undefined") timeRemaining = 0;
      if (typeof running !== "undefined") running = false;
      if (typeof updateTimer === "function") updateTimer();
      const display = document.getElementById("timerDisplay");
      if (display) display.textContent = fmt(0);
      const phase = document.getElementById("phaseLabel");
      if (phase) phase.textContent = "Pronto";
      const startBtn = document.getElementById("startPauseBtn");
      if (startBtn) startBtn.textContent = "Start";
    } catch {}
  }

  function patchCountUpTimer() {
    window.__gkCountUpTimerCore = true;

    updateTimer = function() {
      const display = document.getElementById("timerDisplay");
      if (display) display.textContent = fmt(typeof timeRemaining === "undefined" ? 0 : timeRemaining);
    };
    updateTimer.__gkCountUpTimerCore = true;

    if (typeof toggleTimer === "function" && !toggleTimer.__gkCountUpTimerCore) {
      toggleTimer = function() {
        running = !running;
        const startBtn = document.getElementById("startPauseBtn");
        const phase = document.getElementById("phaseLabel");
        if (startBtn) startBtn.textContent = running ? "Pausa" : "Start";
        if (phase) phase.textContent = running ? "Timer attivo" : "In pausa";

        if (running && !timer) {
          timer = setInterval(() => {
            if (!running) return;
            timeRemaining += 1;
            updateTimer();
          }, 1000);
        }
      };
      toggleTimer.__gkCountUpTimerCore = true;
    }

    if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkCountUpTimerCore) {
      const previousStartWorkoutScreen = startWorkoutScreen;
      startWorkoutScreen = function() {
        const result = previousStartWorkoutScreen.apply(this, arguments);
        setTimerToZero();
        setTimeout(setTimerToZero, 60);
        return result;
      };
      startWorkoutScreen.__gkCountUpTimerCore = true;
    }

    if (typeof finishWorkout === "function" && !finishWorkout.__gkCountUpFinish) {
      const previousFinishWorkout = finishWorkout;
      finishWorkout = function() {
        const elapsedSeconds = Math.max(0, Number(typeof timeRemaining === "undefined" ? 0 : timeRemaining));
        if (selectedExercise) {
          selectedExercise = Object.assign({}, selectedExercise, {
            durationMin: Math.max(1, Math.ceil(elapsedSeconds / 60)),
            actualSeconds: elapsedSeconds
          });
        }
        return previousFinishWorkout.apply(this, arguments);
      };
      finishWorkout.__gkCountUpFinish = true;
    }
  }

  patchCountUpTimer();
  [0, 80, 250, 700].forEach((delay) => setTimeout(patchCountUpTimer, delay));
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { patchCountUpTimer(); setTimerToZero(); });
  } else {
    setTimerToZero();
  }
})();
`;

const EXERCISES_UI_PATCH = String.raw`
;(() => {
  function cleanExerciseTab() {
    document.querySelectorAll(".filters").forEach((element) => element.remove());
    document.querySelectorAll(".cloud-pill").forEach((element) => element.remove());
    document.querySelectorAll(".landing-stats").forEach((element) => element.remove());

    document.querySelectorAll(".section-header h3").forEach((title) => {
      if (String(title.textContent || "").trim().toLowerCase() === "proposte pratiche dal documento") title.remove();
    });

    const summary = document.getElementById("profileSummaryText");
    if (summary) {
      summary.textContent = String(summary.textContent || "")
        .replace(/\s*·\s*esercizi dal documento FIGC\.?/gi, "")
        .replace(/esercizi dal documento FIGC\.?/gi, "")
        .trim();
    }
  }

  function patchRenderProfileSummary() {
    if (typeof renderProfileSummary !== "function" || renderProfileSummary.__gkExercisesCleanUi) return;
    const previousRenderProfileSummary = renderProfileSummary;
    renderProfileSummary = function() {
      const result = previousRenderProfileSummary.apply(this, arguments);
      cleanExerciseTab();
      return result;
    };
    renderProfileSummary.__gkExercisesCleanUi = true;
  }

  function patchShowView() {
    if (typeof showView !== "function" || showView.__gkExercisesCleanUi) return;
    const previousShowView = showView;
    showView = function() {
      const result = previousShowView.apply(this, arguments);
      cleanExerciseTab();
      setTimeout(cleanExerciseTab, 80);
      return result;
    };
    showView.__gkExercisesCleanUi = true;
  }

  function applyExerciseCleanUi() {
    window.__gkExercisesCleanUi = true;
    patchRenderProfileSummary();
    patchShowView();
    cleanExerciseTab();
  }

  applyExerciseCleanUi();
  [0, 80, 250, 700].forEach((delay) => setTimeout(applyExerciseCleanUi, delay));

  if (!window.__gkExercisesCleanUiListeners) {
    window.__gkExercisesCleanUiListeners = true;
    document.addEventListener("DOMContentLoaded", () => {
      applyExerciseCleanUi();
      setTimeout(applyExerciseCleanUi, 250);
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-tab='home']") || event.target.closest("#goExercisesBtn") || event.target.closest(".topbar .eyebrow") || event.target.closest("#screenTitle")) {
        setTimeout(applyExerciseCleanUi, 80);
      }
    });
  }
})();
`;

const EXERCISE_CATALOGUE_PATCH = String.raw`
;(() => {
  const removedIds = new Set([
    "attacchi-a-scelta",
    "passo-lungo-passo-corto",
    "finalizzazioni-marcatura-individuale",
    "attacco-continuo",
    "partita-situazioni",
    "attacco-linea-finalizzo",
    "bersaglio-mobile",
    "5-contro-3-uscita",
    "partita-9-contro-9",
    "partita-7-contro-7"
  ]);

  const removedNames = new Set([
    "attacchi a scelta",
    "passo lungo, passo corto",
    "finalizzazioni da marcatura individuale",
    "attacco continuo",
    "partita a situazioni",
    "attacco la linea e finalizzo",
    "attacco a linea e finalizzo",
    "bersaglio mobile",
    "5 contro 3 con uscita",
    "5 contro 3 uscita",
    "partita 9 contro 9",
    "partita 7 contro 7"
  ]);

  function norm(value) {
    return String(value || "").trim().toLowerCase();
  }

  function shouldRemove(exercise) {
    if (!exercise) return false;
    return removedIds.has(norm(exercise.id)) || removedNames.has(norm(exercise.name));
  }

  function pruneExercisesArray() {
    if (typeof exercises === "undefined" || !Array.isArray(exercises)) return;
    for (let i = exercises.length - 1; i >= 0; i -= 1) {
      if (shouldRemove(exercises[i])) exercises.splice(i, 1);
    }
  }

  function patchCatalogueFunctions() {
    if (typeof filteredExercises === "function" && !filteredExercises.__gkPrunedCatalogue) {
      const previousFilteredExercises = filteredExercises;
      filteredExercises = function() {
        pruneExercisesArray();
        return previousFilteredExercises.apply(this, arguments).filter((exercise) => !shouldRemove(exercise));
      };
      filteredExercises.__gkPrunedCatalogue = true;
    }

    if (typeof renderExercises === "function" && !renderExercises.__gkPrunedCatalogue) {
      const previousRenderExercises = renderExercises;
      renderExercises = function() {
        pruneExercisesArray();
        return previousRenderExercises.apply(this, arguments);
      };
      renderExercises.__gkPrunedCatalogue = true;
    }

    if (typeof plannerExercisePool === "function" && !plannerExercisePool.__gkPrunedCatalogue) {
      const previousPlannerExercisePool = plannerExercisePool;
      plannerExercisePool = function() {
        pruneExercisesArray();
        return previousPlannerExercisePool.apply(this, arguments).filter((exercise) => !shouldRemove(exercise));
      };
      plannerExercisePool.__gkPrunedCatalogue = true;
    }

    if (typeof exerciseById === "function" && !exerciseById.__gkPrunedCatalogue) {
      const previousExerciseById = exerciseById;
      exerciseById = function(id) {
        const found = previousExerciseById.apply(this, arguments);
        return shouldRemove(found) ? null : found;
      };
      exerciseById.__gkPrunedCatalogue = true;
    }
  }

  function removeDeletedPlannedItems() {
    Object.keys(localStorage).forEach((key) => {
      if (!key.startsWith("gk_day_plans_")) return;
      try {
        let changed = false;
        const plans = JSON.parse(localStorage.getItem(key) || "{}");
        Object.keys(plans).forEach((dateKey) => {
          const items = Array.isArray(plans[dateKey]?.items) ? plans[dateKey].items : [];
          const nextItems = items.filter((item) => {
            const ex = typeof exerciseById === "function" ? exerciseById(item.exerciseId) : null;
            return ex && !shouldRemove(ex);
          });
          if (nextItems.length !== items.length) {
            plans[dateKey].items = nextItems;
            changed = true;
          }
        });
        if (changed) localStorage.setItem(key, JSON.stringify(plans));
      } catch {}
    });
  }

  function applyPrunedCatalogue() {
    window.__gkPrunedCatalogue = true;
    pruneExercisesArray();
    patchCatalogueFunctions();
    removeDeletedPlannedItems();
    if (typeof renderExercises === "function") {
      const home = document.getElementById("homeView");
      if (home && home.classList.contains("active")) renderExercises();
    }
  }

  applyPrunedCatalogue();
  [0, 80, 250, 700].forEach((delay) => setTimeout(applyPrunedCatalogue, delay));
  if (!window.__gkPrunedCatalogueListeners) {
    window.__gkPrunedCatalogueListeners = true;
    document.addEventListener("DOMContentLoaded", () => {
      applyPrunedCatalogue();
      setTimeout(applyPrunedCatalogue, 250);
    });
  }
})();
`;

const WORKOUT_UI_PATCH = String.raw`
;(() => {
  function ensureMinimalWorkoutStyle() {
    if (document.getElementById("gkMinimalWorkoutStyle")) return;
    const style = document.createElement("style");
    style.id = "gkMinimalWorkoutStyle";
    style.textContent = ".landing-stats,.stats-grid,.coach-card{display:none!important}.section-header h3:empty{display:none!important}";
    document.head.appendChild(style);
  }

  function ensureWorkoutCompatNodes() {
    const target = document.getElementById("workoutView") || document.body;
    if (!target) return;
    if (!document.getElementById("cueText") || !document.getElementById("cueBtn")) {
      const cueFallback = document.createElement("div");
      cueFallback.hidden = true;
      cueFallback.innerHTML = '<h3 id="cueText">—</h3><button id="cueBtn" type="button">Comando</button>';
      target.appendChild(cueFallback);
    }
    if (!document.getElementById("savesCount") || !document.getElementById("mistakesCount") || !document.getElementById("reactionsCount")) {
      const statsFallback = document.createElement("div");
      statsFallback.hidden = true;
      statsFallback.innerHTML = '<span id="savesCount">0</span><span id="mistakesCount">0</span><span id="reactionsCount">0</span>';
      target.appendChild(statsFallback);
    }
  }

  function cleanCompletedSessionStats() {
    const scope = document.getElementById("calendarView") || document;
    scope.querySelectorAll(".planner-session-title .history-row").forEach((row) => {
      Array.from(row.children).forEach((child) => {
        const text = String(child.textContent || "").trim().toLowerCase();
        if (text.startsWith("parate:") || text.startsWith("errori:") || text.startsWith("reazioni:")) child.remove();
      });
    });
  }

  function cleanMinimalWorkoutUi() {
    ensureMinimalWorkoutStyle();
    ensureWorkoutCompatNodes();
    document.querySelectorAll(".landing-stats").forEach((element) => element.remove());
    document.querySelectorAll(".stats-grid,.coach-card").forEach((element) => {
      element.style.display = "none";
      element.setAttribute("aria-hidden", "true");
    });
    document.querySelectorAll(".section-header h3").forEach((title) => {
      if (String(title.textContent || "").trim().toLowerCase() === "proposte pratiche dal documento") title.remove();
    });
    cleanCompletedSessionStats();
  }

  function patchWorkoutCore() {
    if (typeof updateStats === "function" && !updateStats.__gkMinimalWorkoutUi) {
      updateStats = function() {
        const saves = document.getElementById("savesCount");
        const mistakes = document.getElementById("mistakesCount");
        const reactions = document.getElementById("reactionsCount");
        if (saves) saves.textContent = stats?.saves ?? 0;
        if (mistakes) mistakes.textContent = stats?.mistakes ?? 0;
        if (reactions) reactions.textContent = stats?.reactions ?? 0;
      };
      updateStats.__gkMinimalWorkoutUi = true;
    }

    if (typeof randomCue === "function" && !randomCue.__gkMinimalWorkoutUi) {
      randomCue = function() {
        const cue = document.getElementById("cueText");
        if (cue) cue.textContent = "—";
      };
      randomCue.__gkMinimalWorkoutUi = true;
    }

    if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkMinimalWorkoutUi) {
      const previousStartWorkoutScreen = startWorkoutScreen;
      startWorkoutScreen = function() {
        ensureWorkoutCompatNodes();
        const result = previousStartWorkoutScreen.apply(this, arguments);
        if (typeof timeRemaining !== "undefined") timeRemaining = 0;
        if (typeof running !== "undefined") running = false;
        if (typeof updateTimer === "function") updateTimer();
        const display = document.getElementById("timerDisplay");
        if (display) display.textContent = "00:00";
        cleanMinimalWorkoutUi();
        return result;
      };
      startWorkoutScreen.__gkMinimalWorkoutUi = true;
    }

    if (typeof showView === "function" && !showView.__gkMinimalWorkoutUi) {
      const previousShowView = showView;
      showView = function() {
        const result = previousShowView.apply(this, arguments);
        cleanMinimalWorkoutUi();
        setTimeout(cleanMinimalWorkoutUi, 80);
        setTimeout(cleanCompletedSessionStats, 250);
        return result;
      };
      showView.__gkMinimalWorkoutUi = true;
    }
  }

  function scheduleClean() {
    cleanMinimalWorkoutUi();
    setTimeout(cleanMinimalWorkoutUi, 80);
    setTimeout(cleanCompletedSessionStats, 250);
  }

  function applyMinimalWorkoutUi() {
    window.__gkMinimalWorkoutUi = true;
    ensureMinimalWorkoutStyle();
    ensureWorkoutCompatNodes();
    patchWorkoutCore();
    cleanMinimalWorkoutUi();
  }

  applyMinimalWorkoutUi();
  [0, 80, 250, 700].forEach((delay) => setTimeout(applyMinimalWorkoutUi, delay));
  if (!window.__gkMinimalWorkoutUiListeners) {
    window.__gkMinimalWorkoutUiListeners = true;
    document.addEventListener("DOMContentLoaded", () => {
      applyMinimalWorkoutUi();
      setTimeout(scheduleClean, 250);
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-tab='calendar']") || event.target.closest(".calendar-day[data-date]") || event.target.closest("#prevMonthBtn") || event.target.closest("#nextMonthBtn") || event.target.closest("#addPlanExerciseBtn") || event.target.closest("#autoPlanBtn") || event.target.closest("#clearPlanBtn") || event.target.closest("[data-plan-remove]") || event.target.closest("[data-plan-start]") || event.target.closest("#finishBtn")) {
        setTimeout(scheduleClean, 80);
      }
    });
    document.addEventListener("change", (event) => {
      if (event.target.closest("#dayPlanTime") || event.target.closest("#dayPlanTotal") || event.target.closest(".plan-item-minutes")) {
        setTimeout(scheduleClean, 80);
      }
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

  if (url.pathname.endsWith("/app.js") || url.pathname.endsWith("/cloudflare-client.js")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async response => {
          const source = await response.text();
          let patched = source;
          if (!patched.includes("__gkCountUpTimerCore")) patched += "\n" + COUNT_UP_TIMER_PATCH;
          if (!patched.includes("__gkExercisesCleanUi")) patched += "\n" + EXERCISES_UI_PATCH;
          if (!patched.includes("__gkPrunedCatalogue")) patched += "\n" + EXERCISE_CATALOGUE_PATCH;
          if (!patched.includes("__gkMinimalWorkoutUi")) patched += "\n" + WORKOUT_UI_PATCH;
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