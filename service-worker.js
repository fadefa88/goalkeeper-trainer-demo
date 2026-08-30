const CACHE_NAME = "gk-trainer-production-clean-v2";
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
  if (window.__gkCountUpTimerProduction) return;
  window.__gkCountUpTimerProduction = true;

  function fmt(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    const secs = value % 60;
    return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  updateTimer = function() {
    const display = document.getElementById("timerDisplay");
    if (display) display.textContent = fmt(timeRemaining || 0);
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
      running = false;
      clearInterval(timer);
      timer = null;
      updateTimer();
      const phase = document.getElementById("phaseLabel");
      if (phase) phase.textContent = "Cronometro pronto";
      return result;
    };
    startWorkoutScreen.__gkCountUpStart = true;
  }

  if (typeof finishWorkout === "function" && !finishWorkout.__gkCountUpFinish) {
    const previousFinishWorkout = finishWorkout;
    finishWorkout = function() {
      const elapsedSeconds = Math.max(0, Number(timeRemaining || 0));
      if (selectedExercise) selectedExercise = { ...selectedExercise, durationMin: Math.max(1, Math.ceil(elapsedSeconds / 60)) };
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
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.endsWith("/app.js")) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(async response => {
          const source = await response.text();
          const body = source.includes("__gkCountUpTimerProduction") ? source : `${source}\n${COUNT_UP_TIMER_PATCH}`;
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "no-store"
            }
          });
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  const shouldUseNetworkFirst = url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css");

  if (shouldUseNetworkFirst) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
