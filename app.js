const exercises = [
  {
    id: "riflessi-linea",
    name: "Reazioni su linea",
    category: "Riflessi",
    sports: ["calcio", "futsal"],
    levels: ["base", "medio", "pro"],
    duration: 30,
    rest: 20,
    players: "1-5 portieri",
    source: "Esercizio originale ispirato a principi FIGC/SGS",
    description: "Il portiere lavora su postura, mani attive e risposta rapida a tiro o comando visivo.",
    points: [
      "Peso sugli avampiedi e busto leggermente avanti",
      "Mani davanti al corpo, non basse",
      "Recupero rapido dopo ogni intervento",
      "Evitare caduta all’indietro"
    ]
  },
  {
    id: "uscita-bassa-1v1",
    name: "Uscita bassa 1 contro 1",
    category: "Uscite basse",
    sports: ["calcio", "futsal"],
    levels: ["medio", "pro"],
    duration: 40,
    rest: 30,
    players: "2-4 portieri + tiratori",
    source: "Ispirato ad aree FIGC/YouCoach su uscita bassa e 1 contro 1",
    description: "Situazione di attaccante in avvicinamento. Il portiere decide quando uscire, chiude spazio e resta compatto.",
    points: [
      "Uscire quando l’attaccante perde controllo o allunga palla",
      "Non buttarsi troppo presto",
      "Corpo basso, mani attive, ginocchio protetto",
      "Chiudere angolo più che cercare intervento spettacolare"
    ]
  },
  {
    id: "spostamento-bisettrice",
    name: "Spostamento e bisettrice",
    category: "Posizionamento",
    sports: ["calcio", "futsal"],
    levels: ["base", "medio", "pro"],
    duration: 45,
    rest: 25,
    players: "1-4 portieri",
    source: "Ispirato a indicazioni FIGC su posizionamento rispetto a palla e porta",
    description: "Spostamento laterale, arresto corretto e parata da zona centrale o laterale.",
    points: [
      "Spostarsi prima del tiro, non durante",
      "Tenere la linea tra palla e centro porta",
      "Passi corti, spalle frontali",
      "Assetto basso prima della conclusione"
    ]
  },
  {
    id: "rotazione-180",
    name: "Rotazione 180° e intervento",
    category: "Orientamento",
    sports: ["calcio", "futsal"],
    levels: ["medio", "pro"],
    duration: 35,
    rest: 25,
    players: "2-4 portieri",
    source: "Ispirato al catalogo esercitazioni ufficiali FIGC/YouCoach",
    description: "Il portiere parte girato, riceve comando o stimolo, ruota e interviene sul pallone.",
    points: [
      "Girarsi rapidamente senza perdere equilibrio",
      "Riconoscere subito posizione della palla",
      "Primo passo deciso",
      "Chiusura con presa o respinta sicura"
    ]
  },
  {
    id: "girarsi-tuffo",
    name: "Girarsi e tuffo rapido",
    category: "Reattività",
    sports: ["calcio", "futsal"],
    levels: ["base", "medio"],
    duration: 30,
    rest: 20,
    players: "2 portieri per coppia",
    source: "Adattamento libero da proposta FIGC SGS su girarsi velocemente ed effettuare un tuffo",
    description: "Un compagno genera uno stimolo alle spalle. Il portiere si gira, localizza la palla e interviene.",
    points: [
      "Reazione immediata allo stimolo",
      "Trovare la palla con lo sguardo prima di tuffarsi",
      "Atterrare in sicurezza",
      "Alternare lato destro e sinistro"
    ]
  },
  {
    id: "presa-cono",
    name: "Presa sul cono",
    category: "Presa",
    sports: ["calcio", "futsal"],
    levels: ["base", "medio"],
    duration: 30,
    rest: 20,
    players: "1-4 portieri",
    source: "Ispirato al catalogo FIGC/YouCoach",
    description: "Il portiere parte vicino a un riferimento, si muove, raccoglie posizione e blocca il pallone.",
    points: [
      "Mani morbide ma forti",
      "Portare il corpo dietro la palla",
      "Bloccare e proteggere",
      "Rialzarsi senza perdere controllo"
    ]
  },
  {
    id: "doppio-intervento",
    name: "Doppio intervento in tuffo",
    category: "Forza specifica",
    sports: ["calcio", "futsal"],
    levels: ["medio", "pro"],
    duration: 35,
    rest: 35,
    players: "1-3 portieri",
    source: "Ispirato al catalogo FIGC/YouCoach",
    description: "Due interventi consecutivi, stessa direzione o direzioni alternate, con recupero rapido.",
    points: [
      "Spinta della gamba opposta al lato di tuffo",
      "Rialzata rapida ma controllata",
      "Non perdere orientamento porta",
      "Qualità prima della quantità"
    ]
  },
  {
    id: "uscita-alta",
    name: "Uscita alta e rilancio",
    category: "Uscite alte",
    sports: ["calcio"],
    levels: ["medio", "pro"],
    duration: 45,
    rest: 35,
    players: "1-4 portieri + crossatori",
    source: "Ispirato al catalogo FIGC/YouCoach su uscite alte",
    description: "Cross o pallone alto: scelta del tempo di uscita, presa/respinta e immediata trasmissione.",
    points: [
      "Chiamata vocale chiara",
      "Punto più alto possibile",
      "Ginocchio di protezione",
      "Dopo presa, cercare subito compagno libero"
    ]
  },
  {
    id: "secondo-palo-futsal",
    name: "Secondo palo futsal",
    category: "Futsal",
    sports: ["futsal"],
    levels: ["base", "medio", "pro"],
    duration: 35,
    rest: 25,
    players: "1-3 portieri + 2 giocatori",
    source: "Esercizio originale per futsal",
    description: "Lavoro su diagonale, chiusura secondo palo e lettura del passaggio laterale.",
    points: [
      "Leggere postura del portatore",
      "Non scoprire il primo palo troppo presto",
      "Scivolamento rapido e compatto",
      "Mani basse e corpo grande"
    ]
  },
  {
    id: "portiere-uomo-in-piu",
    name: "Portiere uomo in più",
    category: "Costruzione",
    sports: ["calcio", "futsal"],
    levels: ["medio", "pro"],
    duration: 60,
    rest: 30,
    players: "3-8 giocatori",
    source: "Ispirato al catalogo esercitazioni ufficiali FIGC/YouCoach",
    description: "Il portiere partecipa alla costruzione come sostegno, scegliendo controllo, passaggio o cambio gioco.",
    points: [
      "Orientamento aperto prima della ricezione",
      "Giocare semplice se pressato",
      "Dare linea di passaggio utile",
      "Comunicare con i compagni"
    ]
  },
  {
    id: "spaccata-futsal",
    name: "Spaccata e chiusura",
    category: "Futsal",
    sports: ["futsal"],
    levels: ["medio", "pro"],
    duration: 30,
    rest: 30,
    players: "1-3 portieri",
    source: "Ispirato al catalogo FIGC/YouCoach su gesti specifici futsal",
    description: "Chiusura rapida a terra su tiro ravvicinato o palla sul secondo palo.",
    points: [
      "Usare il gesto solo quando coerente con distanza e angolo",
      "Tenere busto presente sulla palla",
      "Non girarsi di fianco troppo presto",
      "Recuperare posizione dopo l’intervento"
    ]
  },
  {
    id: "tiro-duello",
    name: "Tiro o duello",
    category: "Decisione",
    sports: ["calcio", "futsal"],
    levels: ["pro"],
    duration: 50,
    rest: 35,
    players: "1 portiere + 2-4 attaccanti",
    source: "Ispirato al catalogo FIGC/YouCoach",
    description: "L’attaccante può calciare subito o portare palla in duello. Il portiere deve leggere il comportamento.",
    points: [
      "Non anticipare sempre la stessa soluzione",
      "Rimanere in equilibrio fino alla scelta dell’attaccante",
      "Ridurre spazio progressivamente",
      "Valutare esito: parata, errore tecnico, scelta corretta"
    ]
  }
];

let selectedExercise = null;
let activeFilter = "all";
let timer = null;
let timeRemaining = 0;
let running = false;
let stats = { saves: 0, mistakes: 0, reactions: 0 };

const $ = (id) => document.getElementById(id);

function getProfile() {
  return JSON.parse(localStorage.getItem("gk_profile") || "null");
}

function setProfile(profile) {
  localStorage.setItem("gk_profile", JSON.stringify(profile));
}

function getHistory() {
  return JSON.parse(localStorage.getItem("gk_history") || "[]");
}

function setHistory(history) {
  localStorage.setItem("gk_history", JSON.stringify(history));
}

function showView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(view + "View").classList.add("active");

  const titleMap = {
    setup: "Setup allenamento",
    home: "Esercizi",
    detail: "Dettaglio esercizio",
    workout: "Allenamento",
    history: "Storico",
    profile: "Profilo"
  };

  $("screenTitle").textContent = titleMap[view] || "GK Trainer";

  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const nav = document.querySelector(`[data-tab="${view}"]`);
  if (nav) nav.classList.add("active");

  $("bottomNav").classList.toggle("hidden", view === "setup");

  if (view === "home") {
    renderProfileSummary();
    renderExercises();
  }

  if (view === "history") renderHistory();
}

function renderKeeperFields() {
  const count = Number($("keepersCount").value);
  const previous = Array.from(document.querySelectorAll(".keeper-row")).map(row => ({
    name: row.querySelector(".keeper-name")?.value || "",
    height: row.querySelector(".keeper-height")?.value || "",
    weight: row.querySelector(".keeper-weight")?.value || ""
  }));

  const existingProfile = getProfile();
  const profileKeepers = existingProfile?.keepers || [];

  const fields = $("keepersFields");
  fields.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const data = previous[i] || profileKeepers[i] || { name: "", height: "", weight: "" };
    const row = document.createElement("div");
    row.className = "keeper-row";
    row.innerHTML = `
      <input class="keeper-name" placeholder="Nome ${i + 1}" value="${escapeHtml(data.name || "")}" />
      <input class="keeper-height" type="number" inputmode="numeric" placeholder="cm" value="${escapeHtml(String(data.height || ""))}" />
      <input class="keeper-weight" type="number" inputmode="decimal" placeholder="kg" value="${escapeHtml(String(data.weight || ""))}" />
    `;
    fields.appendChild(row);
  }
}

function loadProfileIntoForm() {
  const profile = getProfile();
  if (!profile) {
    renderKeeperFields();
    return;
  }

  $("keepersCount").value = String(profile.keepersCount || 3);
  $("sportType").value = profile.sportType || "calcio";
  $("level").value = profile.level || "medio";
  $("sessionsPerWeek").value = String(profile.sessionsPerWeek || 2);
  $("sessionDuration").value = String(profile.sessionDuration || 60);
  renderKeeperFields();
}

function saveProfileFromForm(event) {
  event.preventDefault();

  const rows = Array.from(document.querySelectorAll(".keeper-row"));
  const keepers = rows.map((row, index) => ({
    name: row.querySelector(".keeper-name").value.trim() || `Portiere ${index + 1}`,
    height: row.querySelector(".keeper-height").value.trim(),
    weight: row.querySelector(".keeper-weight").value.trim()
  }));

  const profile = {
    keepersCount: Number($("keepersCount").value),
    sportType: $("sportType").value,
    level: $("level").value,
    sessionsPerWeek: Number($("sessionsPerWeek").value),
    sessionDuration: Number($("sessionDuration").value),
    keepers
  };

  setProfile(profile);
  showView("home");
}

function renderProfileSummary() {
  const profile = getProfile();
  if (!profile) return;

  const sportLabel = profile.sportType === "futsal" ? "Futsal" : "Calcio";
  const levelLabel = profile.level.charAt(0).toUpperCase() + profile.level.slice(1);
  $("profileSummaryTitle").textContent = `${sportLabel} · livello ${levelLabel}`;
  $("profileSummaryText").textContent = `${profile.keepersCount} portieri · ${profile.sessionsPerWeek} sedute/settimana · ${profile.sessionDuration} minuti.`;
  $("weekSessions").textContent = getHistory().length;
}

function filteredExercises() {
  const profile = getProfile();
  return exercises.filter(ex => {
    if (activeFilter === "all") {
      return !profile || (ex.sports.includes(profile.sportType) && ex.levels.includes(profile.level));
    }
    if (["calcio", "futsal"].includes(activeFilter)) return ex.sports.includes(activeFilter);
    if (["base", "medio", "pro"].includes(activeFilter)) return ex.levels.includes(activeFilter);
    return true;
  });
}

function renderExercises() {
  const list = $("exerciseList");
  const items = filteredExercises();

  if (!items.length) {
    list.innerHTML = `<div class="history-card"><h3>Nessun esercizio trovato</h3><p class="muted">Cambia filtro o livello.</p></div>`;
    return;
  }

  list.innerHTML = items.map(ex => `
    <button class="exercise-card" data-id="${ex.id}">
      <p class="eyebrow">${ex.category}</p>
      <h3>${ex.name}</h3>
      <p class="muted">${ex.description}</p>
      <div class="exercise-meta">
        <span class="pill">${ex.sports.map(s => s === "futsal" ? "Futsal" : "Calcio").join(" / ")}</span>
        <span class="pill">${ex.levels.join(" / ")}</span>
        <span class="pill">${ex.duration}s lavoro</span>
        <span class="pill">${ex.rest}s recupero</span>
      </div>
      <div class="source-note">${ex.source}</div>
    </button>
  `).join("");

  document.querySelectorAll(".exercise-card").forEach(card => {
    card.addEventListener("click", () => {
      selectedExercise = exercises.find(e => e.id === card.dataset.id);
      renderDetail();
      showView("detail");
    });
  });
}

function renderDetail() {
  const profile = getProfile();
  const suggestedBlocks = profile?.sessionDuration === 120 ? "4-6 blocchi" : "2-3 blocchi";

  $("exerciseDetail").innerHTML = `
    <div class="detail-card">
      <p class="eyebrow">${selectedExercise.category}</p>
      <h2>${selectedExercise.name}</h2>
      <p class="muted" style="margin-top:10px">${selectedExercise.description}</p>

      <div class="detail-grid">
        <div class="mini-metric"><strong>${selectedExercise.duration}s</strong><span>Lavoro</span></div>
        <div class="mini-metric"><strong>${selectedExercise.rest}s</strong><span>Recupero</span></div>
        <div class="mini-metric"><strong>${suggestedBlocks}</strong><span>Volume</span></div>
      </div>

      <p class="source-note">${selectedExercise.source}</p>

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
  clearInterval(timer);
  timer = null;

  updateStats();
  updateTimer();
  $("workoutName").textContent = selectedExercise.name;
  $("workoutCategory").textContent = selectedExercise.category;
  $("phaseLabel").textContent = "Pronto";
  $("startPauseBtn").textContent = "Start";
  $("cueText").textContent = "—";
  renderActiveKeeperSelect();
  showView("workout");
}

function renderActiveKeeperSelect() {
  const profile = getProfile();
  const select = $("activeKeeper");
  const keepers = profile?.keepers || [{ name: "Portiere 1" }];

  select.innerHTML = keepers.map((k, index) => {
    const label = `${k.name || `Portiere ${index + 1}`}${k.height ? ` · ${k.height} cm` : ""}${k.weight ? ` · ${k.weight} kg` : ""}`;
    return `<option value="${escapeHtml(k.name || `Portiere ${index + 1}`)}">${escapeHtml(label)}</option>`;
  }).join("");
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
  if (!selectedExercise) return;

  running = false;
  clearInterval(timer);
  timer = null;

  const profile = getProfile();
  const activeKeeper = $("activeKeeper")?.value || "Portiere";

  const history = getHistory();
  history.unshift({
    date: new Date().toISOString(),
    exerciseName: selectedExercise.name,
    category: selectedExercise.category,
    sport: profile?.sportType || "",
    level: profile?.level || "",
    keeper: activeKeeper,
    saves: stats.saves,
    mistakes: stats.mistakes,
    reactions: stats.reactions,
    duration: selectedExercise.duration
  });

  setHistory(history);
  $("phaseLabel").textContent = "Sessione salvata";
  $("startPauseBtn").textContent = "Start";
  renderProfileSummary();
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
        <p class="eyebrow">${escapeHtml(item.category || "")}</p>
        <h3>${escapeHtml(item.exerciseName)}</h3>
        <p class="muted">${date} · ${escapeHtml(item.keeper || "Portiere")}</p>
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
  const profile = getProfile();
  const base = ["Destra", "Sinistra", "Alto", "Basso", "Uscita", "Resta"];
  const futsal = ["Secondo palo", "Spaccata", "Primo palo", "Ribalta"];
  const calcio = ["Cross", "Bisettrice", "Blocca", "Respinta"];
  const cues = profile?.sportType === "futsal" ? [...base, ...futsal] : [...base, ...calcio];

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  $("keepersCount").addEventListener("change", renderKeeperFields);
  $("setupForm").addEventListener("submit", saveProfileFromForm);

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.tab));
  });

  document.querySelectorAll(".back-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.go === "home") showView("home");
      if (btn.dataset.go === "detail") showView("detail");
    });
  });

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderExercises();
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

  $("settingsBtn").addEventListener("click", () => {
    if (getProfile()) showView("profile");
    else showView("setup");
  });

  $("editSetupBtn").addEventListener("click", () => {
    loadProfileIntoForm();
    showView("setup");
  });

  $("resetBtn").addEventListener("click", () => {
    if (confirm("Vuoi cancellare profilo e storico?")) {
      localStorage.removeItem("gk_profile");
      localStorage.removeItem("gk_history");
      loadProfileIntoForm();
      showView("setup");
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  loadProfileIntoForm();

  if (getProfile()) {
    showView("home");
  } else {
    showView("setup");
  }
});
