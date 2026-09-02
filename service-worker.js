const CACHE_NAME = "gk-trainer-cloudflare-d1-exercises-pruned-v1";
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

  if (!window.__gkCountUpTimerCore) {
    window.__gkCountUpTimerCore = true;

    updateTimer = function() {
      const display = document.getElementById("timerDisplay");
      if (display) display.textContent = fmt(timeRemaining);
    };

    toggleTimer = function() {
      running = !running;
      const startBtn = document.getElementById("startPauseBtn");
      const phase = document.getElementById("phaseLabel");
      if (startBtn) startBtn.textContent = running ? "Pausa" : "Start";
      if (phase) phase.textContent = running ? "Cronometro attivo" : "In pausa";

      if (running && !timer) {
        timer = setInterval(() => {
          if (!running) return;
          timeRemaining += 1;
          updateTimer();
        }, 1000);
      }
    };

    if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkCountUpStart) {
      const previousStartWorkoutScreen = startWorkoutScreen;
      startWorkoutScreen = function() {
        const result = previousStartWorkoutScreen.apply(this, arguments);
        timeRemaining = 0;
        updateTimer();
        const phase = document.getElementById("phaseLabel");
        if (phase) phase.textContent = "Pronto";
        return result;
      };
      startWorkoutScreen.__gkCountUpStart = true;
    }
  }

  if (typeof finishWorkout === "function" && !finishWorkout.__gkCountUpFinish) {
    const previousFinishWorkout = finishWorkout;
    finishWorkout = function() {
      const elapsedSeconds = Math.max(0, Number(timeRemaining || 0));
      if (selectedExercise) {
        selectedExercise = {
          ...selectedExercise,
          durationMin: Math.max(1, Math.ceil(elapsedSeconds / 60)),
          actualSeconds: elapsedSeconds
        };
      }
      return previousFinishWorkout.apply(this, arguments);
    };
    finishWorkout.__gkCountUpFinish = true;
  }
})();
`;

const EXERCISES_UI_PATCH = String.raw`
;(() => {
  function cleanExerciseTab() {
    document.querySelectorAll(".filters").forEach((element) => element.remove());
    document.querySelectorAll(".cloud-pill").forEach((element) => element.remove());

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
    "partita-9-contro-9"
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
    "partita 9 contro 9"
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

  function applyPrunedCatalogue() {
    pruneExercisesArray();
    patchCatalogueFunctions();
    if (typeof renderExercises === "function") {
      const home = document.getElementById("homeView");
      if (home && home.classList.contains("active")) renderExercises();
    }
  }

  if (!window.__gkPrunedCatalogue) {
    window.__gkPrunedCatalogue = true;
    applyPrunedCatalogue();
    [0, 80, 250, 700].forEach((delay) => setTimeout(applyPrunedCatalogue, delay));
    document.addEventListener("DOMContentLoaded", () => {
      applyPrunedCatalogue();
      setTimeout(applyPrunedCatalogue, 250);
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
          if (!patched.includes("__gkCountUpTimerCore")) patched += `\n${COUNT_UP_TIMER_PATCH}`;
          if (!patched.includes("__gkExercisesCleanUi")) patched += `\n${EXERCISES_UI_PATCH}`;
          if (!patched.includes("__gkPrunedCatalogue")) patched += `\n${EXERCISE_CATALOGUE_PATCH}`;
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