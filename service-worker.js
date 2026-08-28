const CACHE_NAME = "gk-trainer-cloudflare-d1-count-up-timer-v1";
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
          const patched = source.includes("__gkCountUpTimerCore") ? source : `${source}\n${COUNT_UP_TIMER_PATCH}`;
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
