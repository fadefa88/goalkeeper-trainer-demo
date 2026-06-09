const exercises = [
  {
    id: "riflessi-linea",
    name: "Reazioni su linea",
    category: "Riflessi",
    duration: 30,
    rest: 20,
    description: "Il portiere resta sulla linea e reagisce a tiri ravvicinati o comandi visivi.",
    points: [
      "Peso sugli avampiedi",
      "Mani davanti al corpo",
      "Recupero rapido dopo ogni intervento",
      "Non cadere all’indietro"
    ]
  },
  {
    id: "uscita-bassa",
    name: "Uscita bassa 1 contro 1",
    category: "Uscite",
    duration: 40,
    rest: 30,
    description: "Simulazione di attaccante lanciato verso la porta. Obiettivo: chiudere angolo e tempo di uscita.",
    points: [
      "Uscire quando l’attaccante perde controllo palla",
      "Corpo compatto e basso",
      "Braccia basse e attive",
      "Non buttarsi troppo presto"
    ]
  },
  {
    id: "laterale-parata",
    name: "Spostamento laterale + parata",
    category: "Piedi",
    duration: 45,
    rest: 25,
    description: "Spostamento da palo a centro porta, poi parata su tiro o comando.",
    points: [
      "Passi corti e rapidi",
      "Spalle frontali",
      "Non incrociare troppo i piedi",
      "Assetto basso prima del tiro"
    ]
  },
  {
    id: "futsal-secondo-palo",
    name: "Secondo palo futsal",
    category: "Futsal",
    duration: 35,
    rest: 25,
    description: "Lavoro specifico su taglio al secondo palo, diagonale e copertura rapida.",
    points: [
      "Leggere il corpo del portatore",
      "Controllare secondo palo",
      "Scivolamento rapido",
      "Restare grande senza aprire varchi"
    ]
  }
];

let selectedExercise = null;
let timer = null;
let timeRemaining = 0;
let running = false;
let stats = { saves: 0, mistakes: 0, reactions: 0 };

const $ = (id) => document.getElementById(id);

function getHistory() {
  return JSON.parse(localStorage.getItem("gk_history") || "[]");
}

function setHistory(history) {
  localStorage.setItem("gk_history", JSON.stringify(history));
}

function showView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(view + "View").classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const nav = document.querySelector(`[data-tab="${view}"]`);
  if (nav) nav.classList.add("active");

  if (view === "history") renderHistory();
}

function renderExercises() {
  const list = $("exerciseList");
  list.innerHTML = exercises.map(ex => `
    <button class="exercise-card" data-id="${ex.id}">
      <p class="eyebrow">${ex.category}</p>
      <h3>${ex.name}</h3>
      <p class="muted">${ex.description}</p>
      <div class="exercise-meta">
        <span class="pill">${ex.duration}s lavoro</span>
        <span class="pill">${ex.rest}s recupero</span>
      </div>
    </button>
  `).join("");

  document.querySelectorAll(".exercise-card").forEach(card => {
    card.addEventListener("click", () => {
      selectedExercise = exercises.find(e => e.id === card.dataset.id);
      renderDetail();
      showView("detail");
    });
  });

  $("weekSessions").textContent = getHistory().length;
}

function renderDetail() {
  $("exerciseDetail").innerHTML = `
    <div class="detail-card">
      <p class="eyebrow">${selectedExercise.category}</p>
      <h2>${selectedExercise.name}</h2>
      <p class="muted" style="margin-top:10px">${selectedExercise.description}</p>

      <h3 style="margin-top:22px">Punti tecnici</h3>
      <div class="points">
        ${selectedExercise.points.map(p => `<div class="point">${p}</div>`).join("")}
      </div>

      <button id="beginWorkoutBtn" class="primary-btn full">Inizia allenamento</button>
    </div>
  `;

  $("beginWorkoutBtn").addEventListener("click", startWorkoutScreen);
}

function startWorkoutScreen() {
  stats = { saves: 0, mistakes: 0, reactions: 0 };
  timeRemaining = selectedExercise.duration;
  running = false;
  updateStats();
  updateTimer();
  $("workoutName").textContent = selectedExercise.name;
  $("workoutCategory").textContent = selectedExercise.category;
  $("phaseLabel").textContent = "Pronto";
  $("startPauseBtn").textContent = "Start";
  $("cueText").textContent = "—";
  showView("workout");
}

function updateTimer() {
  $("timerDisplay").textContent = String(timeRemaining).padStart(2, "0");
}

function updateStats() {
  $("savesCount").textContent = stats.saves;
  $("mistakesCount").textContent = stats.mistakes;
  $("reactionsCount").textContent = stats.reactions;
}

function toggleTimer() {
  running = !running;
  $("startPauseBtn").textContent = running ? "Pausa" : "Start";
  $("phaseLabel").textContent = running ? "Lavoro in corso" : "In pausa";

  if (running && !timer) {
    timer = setInterval(() => {
      if (!running) return;
      timeRemaining -= 1;
      updateTimer();

      if (timeRemaining <= 0) {
        finishWorkout();
      }
    }, 1000);
  }
}

function finishWorkout() {
  running = false;
  clearInterval(timer);
  timer = null;

  const history = getHistory();
  history.unshift({
    date: new Date().toISOString(),
    exerciseName: selectedExercise.name,
    category: selectedExercise.category,
    saves: stats.saves,
    mistakes: stats.mistakes,
    reactions: stats.reactions,
    duration: selectedExercise.duration
  });

  setHistory(history);
  $("phaseLabel").textContent = "Sessione salvata";
  $("startPauseBtn").textContent = "Start";
  renderExercises();
}

function renderHistory() {
  const history = getHistory();
  const list = $("historyList");

  if (!history.length) {
    list.innerHTML = `<div class="history-card"><h3>Nessuna sessione</h3><p class="muted">Completa un allenamento per vedere lo storico.</p></div>`;
    return;
  }

  list.innerHTML = history.map(item => {
    const date = new Date(item.date).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
    return `
      <div class="history-card">
        <p class="eyebrow">${item.category}</p>
        <h3>${item.exerciseName}</h3>
        <p class="muted">${date}</p>
        <div class="history-row">
          <span>Parate: ${item.saves}</span>
          <span>Errori: ${item.mistakes}</span>
          <span>Reazioni: ${item.reactions}</span>
        </div>
      </div>
    `;
  }).join("");
}

function randomCue() {
  const cues = ["Destra", "Sinistra", "Alto", "Basso", "Uscita", "Secondo palo", "Resta"];
  const cue = cues[Math.floor(Math.random() * cues.length)];
  $("cueText").textContent = cue;

  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(cue);
    utterance.lang = "it-IT";
    utterance.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.tab));
});

document.querySelectorAll(".back-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.go === "home") showView("home");
    if (btn.dataset.go === "detail") showView("detail");
  });
});

document.querySelectorAll(".stat-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    stats[btn.dataset.stat] += 1;
    updateStats();
  });
});

$("startPauseBtn").addEventListener("click", toggleTimer);
$("finishBtn").addEventListener("click", finishWorkout);
$("cueBtn").addEventListener("click", randomCue);
$("resetBtn").addEventListener("click", () => {
  if (confirm("Vuoi cancellare tutto lo storico?")) {
    localStorage.removeItem("gk_history");
    renderExercises();
    renderHistory();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

renderExercises();
