(() => {
  let cloudUser = null;
  let cloudProfile = null;
  let cloudHistory = [];
  let selectedCalendarDate = todayKey();
  let calendarMonthDate = new Date();
  const q = (id) => document.getElementById(id);
  const esc = (v) => escapeHtml(String(v ?? ""));
  const cleanNum = (v) => v === "" || v === null || v === undefined ? null : Number(v);
  const val = (row, selector) => row.querySelector(selector)?.value?.trim() || "";

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function formatDateKey(key) {
    return parseDateKey(key).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }

  async function api(path, options = {}) {
    const init = { method: options.method || "GET", credentials: "same-origin", headers: options.headers || {} };
    if (options.body !== undefined) {
      init.headers = { ...init.headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, init);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text || "Risposta non valida" }; }
    if (!response.ok) {
      const err = new Error(data?.error || `Errore ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function showAuth(message = "") {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    q("authView")?.classList.add("active");
    q("bottomNav")?.classList.add("hidden");
    if (q("screenTitle")) q("screenTitle").textContent = "Accesso";
    if (q("authStatus")) q("authStatus").textContent = message;
  }

  function normalizeProfile(profile) {
    if (!profile) return null;
    return {
      keepersCount: profile.keepersCount ?? profile.keepers_count ?? 3,
      sportType: profile.sportType ?? profile.sport ?? "calcio",
      level: profile.level ?? "medio",
      sessionsPerWeek: profile.sessionsPerWeek ?? profile.sessions_per_week ?? 2,
      sessionDuration: profile.sessionDuration ?? profile.session_duration ?? 60,
      keepers: (profile.keepers || []).map((k, i) => ({
        id: k.id || "",
        name: k.name || `Portiere ${i + 1}`,
        height: k.height ?? k.height_cm ?? "",
        weight: k.weight ?? k.weight_kg ?? "",
        broadJump: k.broadJump ?? k.standing_broad_jump_cm ?? "",
        verticalJump: k.verticalJump ?? k.standing_vertical_jump_cm ?? "",
        halfHeightJump: k.halfHeightJump ?? k.standing_half_height_jump_cm ?? "",
        twoPostsTest: k.twoPostsTest ?? k.two_posts_test_sec ?? ""
      }))
    };
  }

  function normalizeSession(row) {
    return {
      cloudId: row.cloudId || row.id,
      date: row.date || row.created_at,
      sessionDate: row.sessionDate || row.session_date,
      exerciseName: row.exerciseName || row.exercise_name,
      category: row.category || "",
      sourcePage: row.sourcePage ?? row.source_page ?? null,
      sport: row.sport || "",
      level: row.level || "",
      keeper: row.keeper || row.keeper_name || "Portiere",
      keeperId: row.keeperId || row.keeper_id || null,
      saves: Number(row.saves || 0),
      mistakes: Number(row.mistakes || 0),
      reactions: Number(row.reactions || 0),
      plannedMinutes: row.plannedMinutes ?? row.planned_minutes ?? null,
      notes: row.notes || ""
    };
  }

  async function loadData(render = true) {
    localStorage.removeItem("gk_profile");
    localStorage.removeItem("gk_history");
    try {
      const me = await api("/api/me");
      cloudUser = me.user;
      const profileRes = await api("/api/profile");
      const sessionsRes = await api("/api/sessions");
      cloudProfile = normalizeProfile(profileRes.profile);
      cloudHistory = (sessionsRes.sessions || []).map(normalizeSession);
      if (q("cloudUserLabel")) q("cloudUserLabel").textContent = `Connesso come ${cloudUser.email}`;
    } catch (e) {
      cloudUser = null;
      cloudProfile = null;
      cloudHistory = [];
      if (render) showAuth(e.status === 401 ? "" : e.message);
      return;
    }
    if (!render) return;
    if (cloudProfile) showView("home");
    else { loadProfileIntoForm(); showView("setup"); }
  }

  renderKeeperFields = function () {
    const count = Number(q("keepersCount").value);
    const previous = Array.from(document.querySelectorAll(".keeper-row")).map((row) => ({
      name: val(row, ".keeper-name"), height: val(row, ".keeper-height"), weight: val(row, ".keeper-weight"),
      broadJump: val(row, ".keeper-broad-jump"), verticalJump: val(row, ".keeper-vertical-jump"),
      halfHeightJump: val(row, ".keeper-half-height-jump"), twoPostsTest: val(row, ".keeper-two-posts-test")
    }));
    const keepers = cloudProfile?.keepers || [];
    const box = q("keepersFields");
    box.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const k = previous[i] || keepers[i] || {};
      const row = document.createElement("div");
      row.className = "keeper-row keeper-card";
      row.innerHTML = `<div class="keeper-main"><input class="keeper-name" placeholder="Nome ${i + 1}" value="${esc(k.name)}" /><input class="keeper-height" type="number" inputmode="numeric" placeholder="Altezza cm" value="${esc(k.height)}" /><input class="keeper-weight" type="number" inputmode="decimal" placeholder="Peso kg" value="${esc(k.weight)}" /></div><div class="keeper-tests"><input class="keeper-broad-jump" type="number" inputmode="decimal" placeholder="Balzo da fermo cm" value="${esc(k.broadJump)}" /><input class="keeper-vertical-jump" type="number" inputmode="decimal" placeholder="Balzo in alto cm" value="${esc(k.verticalJump)}" /><input class="keeper-half-height-jump" type="number" inputmode="decimal" placeholder="Balzo mezza altezza cm" value="${esc(k.halfHeightJump)}" /><input class="keeper-two-posts-test" type="number" step="0.01" inputmode="decimal" placeholder="Test due pali sec" value="${esc(k.twoPostsTest)}" /></div>`;
      box.appendChild(row);
    }
  };

  async function saveCloudProfile(event) {
    event?.preventDefault(); event?.stopPropagation(); event?.stopImmediatePropagation?.();
    const rows = Array.from(document.querySelectorAll(".keeper-row"));
    const profile = {
      keepersCount: Number(q("keepersCount").value), sportType: q("sportType").value, level: q("level").value,
      sessionsPerWeek: Number(q("sessionsPerWeek").value), sessionDuration: Number(q("sessionDuration").value),
      keepers: rows.map((row, i) => ({
        id: cloudProfile?.keepers?.[i]?.id || null,
        name: val(row, ".keeper-name") || `Portiere ${i + 1}`,
        height: cleanNum(val(row, ".keeper-height")), weight: cleanNum(val(row, ".keeper-weight")),
        broadJump: cleanNum(val(row, ".keeper-broad-jump")), verticalJump: cleanNum(val(row, ".keeper-vertical-jump")),
        halfHeightJump: cleanNum(val(row, ".keeper-half-height-jump")), twoPostsTest: cleanNum(val(row, ".keeper-two-posts-test"))
      }))
    };
    try { await api("/api/profile", { method: "PUT", body: { profile } }); await loadData(false); showView("home"); }
    catch (e) { alert(e.message); }
  }

  async function login() {
    q("authStatus").textContent = "Accesso in corso...";
    try { await api("/api/login", { method: "POST", body: { email: q("authEmail").value.trim(), password: q("authPassword").value } }); await loadData(true); }
    catch (e) { q("authStatus").textContent = e.message; }
  }

  async function signup() {
    q("authStatus").textContent = "Creazione account...";
    try { await api("/api/signup", { method: "POST", body: { email: q("authEmail").value.trim(), password: q("authPassword").value } }); await loadData(true); }
    catch (e) { q("authStatus").textContent = e.message; }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => null);
    cloudUser = null; cloudProfile = null; cloudHistory = [];
    showAuth("Logout effettuato.");
  }

  function sessionKey(s) { return s.sessionDate || todayKey(s.date || new Date()); }
  function sessionsForDate(key) { return cloudHistory.filter((s) => sessionKey(s) === key); }
  function sessionsByDate() { return cloudHistory.reduce((a, s) => { const k = sessionKey(s); (a[k] ||= []).push(s); return a; }, {}); }
  function renderSessionCard(s) {
    const key = sessionKey(s); const time = s.date ? new Date(s.date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    return `<div class="history-card"><p class="eyebrow">${esc(s.category)} · pag. ${s.sourcePage || "-"}</p><h3>${esc(s.exerciseName || "Esercizio")}</h3><p class="muted">${formatDateKey(key)}${time ? ` · salvata alle ${time}` : ""} · ${esc(s.keeper || "Portiere")}</p><div class="history-row"><span>Parate: ${s.saves}</span><span>Errori: ${s.mistakes}</span><span>Reazioni: ${s.reactions}</span><span>Durata: ${s.plannedMinutes || "-"}'</span></div></div>`;
  }

  function renderCalendar() {
    const grid = q("calendarGrid"), title = q("calendarMonthTitle"); if (!grid || !title) return;
    const y = calendarMonthDate.getFullYear(), m = calendarMonthDate.getMonth(), first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate(), offset = (first.getDay() + 6) % 7, today = todayKey(), map = sessionsByDate();
    title.textContent = first.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`<button class="calendar-day empty" type="button"></button>`);
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cls = ["calendar-day", key === today ? "today" : "", key === selectedCalendarDate ? "selected" : ""].filter(Boolean).join(" ");
      cells.push(`<button class="${cls}" type="button" data-date="${key}"><span class="calendar-day-number">${d}</span>${map[key]?.length ? `<span class="calendar-dot"></span>` : `<span></span>`}</button>`);
    }
    grid.innerHTML = cells.join("");
    document.querySelectorAll(".calendar-day[data-date]").forEach((b) => b.addEventListener("click", () => { selectedCalendarDate = b.dataset.date; renderCalendar(); }));
    const list = q("selectedDateSessions"); q("selectedDateTitle").textContent = formatDateKey(selectedCalendarDate);
    const items = sessionsForDate(selectedCalendarDate);
    list.innerHTML = items.length ? items.map(renderSessionCard).join("") : `<div class="history-card"><h3>Nessuna sessione</h3><p class="muted">Le sessioni completate in questa data compariranno qui.</p></div>`;
  }

  function monthKey(value) {
    const d = parseDateKey(value || todayKey());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "2-digit" }).replace(" ", " '");
  }

  function scoreFromTotals(saves, mistakes, reactions) {
    const total = saves + mistakes + reactions;
    if (!total) return null;
    const score = ((saves + reactions * 0.6) / total) * 100;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function buildMonthlyStats() {
    const map = new Map();
    cloudHistory.forEach((s) => {
      const key = monthKey(sessionKey(s));
      if (!map.has(key)) map.set(key, { key, sessions: 0, minutes: 0, saves: 0, mistakes: 0, reactions: 0, exercises: new Set(), keepers: new Set() });
      const row = map.get(key);
      row.sessions += 1;
      row.minutes += Number(s.plannedMinutes || 0);
      row.saves += Number(s.saves || 0);
      row.mistakes += Number(s.mistakes || 0);
      row.reactions += Number(s.reactions || 0);
      if (s.exerciseName) row.exercises.add(s.exerciseName);
      if (s.keeper) row.keepers.add(s.keeper);
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key)).map((row) => ({
      ...row,
      quality: scoreFromTotals(row.saves, row.mistakes, row.reactions),
      exerciseCount: row.exercises.size,
      keeperCount: row.keepers.size
    }));
  }

  function buildExerciseStats() {
    const map = new Map();
    cloudHistory.forEach((s) => {
      const key = s.exerciseName || "Esercizio";
      if (!map.has(key)) map.set(key, { name: key, category: s.category || "", sessions: 0, minutes: 0, saves: 0, mistakes: 0, reactions: 0, months: new Set() });
      const row = map.get(key);
      row.sessions += 1;
      row.minutes += Number(s.plannedMinutes || 0);
      row.saves += Number(s.saves || 0);
      row.mistakes += Number(s.mistakes || 0);
      row.reactions += Number(s.reactions || 0);
      row.months.add(monthKey(sessionKey(s)));
    });
    return Array.from(map.values()).map((row) => ({
      ...row,
      actions: row.saves + row.mistakes + row.reactions,
      quality: scoreFromTotals(row.saves, row.mistakes, row.reactions),
      monthCount: row.months.size
    })).sort((a, b) => (b.sessions - a.sessions) || ((b.quality || 0) - (a.quality || 0)) || a.name.localeCompare(b.name));
  }

  function renderProgressKpis(months) {
    const box = q("progressKpis");
    if (!box) return;
    if (!months.length) {
      box.innerHTML = `<div class="progress-kpi"><span>Stato</span><strong>0</strong><small>Nessuna sessione salvata.</small></div>`;
      return;
    }
    const current = months[months.length - 1];
    const previous = months.length > 1 ? months[months.length - 2] : null;
    const delta = previous && current.quality !== null && previous.quality !== null ? current.quality - previous.quality : null;
    const deltaText = delta === null ? "serve almeno un altro mese" : `${delta >= 0 ? "+" : ""}${delta} punti vs mese precedente`;
    const qualityText = current.quality === null ? "—" : `${current.quality}`;
    const actions = current.saves + current.mistakes + current.reactions;
    box.innerHTML = `
      <div class="progress-kpi"><span>Mese</span><strong>${esc(monthLabel(current.key))}</strong><small>${current.sessions} sedute · ${current.minutes}' totali</small></div>
      <div class="progress-kpi"><span>Qualità</span><strong>${qualityText}</strong><small>${esc(deltaText)}</small></div>
      <div class="progress-kpi"><span>Azioni</span><strong>${actions}</strong><small>${current.saves} parate · ${current.mistakes} errori · ${current.reactions} reazioni</small></div>`;
  }

  function renderMonthlyChart(months) {
    const box = q("monthlyChart");
    if (!box) return;
    if (!months.length) {
      box.innerHTML = `<div class="no-data">Completa almeno una sessione per vedere il grafico mese per mese.</div>`;
      return;
    }
    const recent = months.slice(-6);
    box.innerHTML = recent.map((m) => {
      const quality = m.quality ?? 0;
      const height = Math.max(8, quality);
      return `<div class="month-column"><div class="month-bar-wrap"><div class="month-bar" style="height:${height}%">${m.quality ?? "—"}</div></div><span class="month-label">${esc(monthLabel(m.key))}</span><span class="month-sub">${m.sessions} sed.</span></div>`;
    }).join("");
  }

  function renderKeeperMeasures() {
    const box = q("keeperMeasures");
    if (!box) return;
    const keepers = cloudProfile?.keepers || [];
    if (!keepers.length) {
      box.innerHTML = `<div class="no-data">Inserisci i portieri nel profilo per vedere misure e test fisici.</div>`;
      return;
    }
    box.innerHTML = keepers.map((k, i) => {
      const tags = [
        k.height ? `Altezza ${k.height} cm` : "Altezza n/d",
        k.weight ? `Peso ${k.weight} kg` : "Peso n/d",
        k.broadJump ? `Balzo fermo ${k.broadJump} cm` : "Balzo fermo n/d",
        k.verticalJump ? `Balzo alto ${k.verticalJump} cm` : "Balzo alto n/d",
        k.halfHeightJump ? `Mezza altezza ${k.halfHeightJump} cm` : "Mezza altezza n/d",
        k.twoPostsTest ? `Due pali ${k.twoPostsTest} s` : "Due pali n/d"
      ];
      return `<div class="measure-card"><div class="quality-top"><div><p class="eyebrow">Portiere ${i + 1}</p><h3>${esc(k.name || `Portiere ${i + 1}`)}</h3></div></div><div class="metric-tags">${tags.map((t) => `<span class="metric-tag">${esc(t)}</span>`).join("")}</div></div>`;
    }).join("");
  }

  function renderExerciseQuality() {
    const box = q("exerciseQualityList");
    if (!box) return;
    const rows = buildExerciseStats().slice(0, 8);
    if (!rows.length) {
      box.innerHTML = `<div class="no-data">Completa sessioni diverse per capire quali esercizi stanno producendo più qualità.</div>`;
      return;
    }
    box.innerHTML = rows.map((r) => {
      const score = r.quality === null ? "—" : r.quality;
      const focus = r.quality === null ? "Registra parate, errori e reazioni per valutare meglio." : r.quality >= 80 ? "Molto positivo: mantieni progressione o alza difficoltà." : r.quality >= 60 ? "Buono: continua e cura dettagli tecnici." : "Da lavorare: abbassa complessità o aumenta ripetizioni guidate.";
      return `<div class="quality-item"><div class="quality-top"><div><p class="eyebrow">${esc(r.category || "Esercizio")}</p><h3>${esc(r.name)}</h3></div><div class="quality-score">${score}</div></div><div class="quality-meta">${r.sessions} sedute · ${r.minutes}' · ${r.actions} azioni · ${r.saves} parate / ${r.mistakes} errori / ${r.reactions} reazioni<br>${esc(focus)}</div></div>`;
    }).join("");
  }

  function renderProgress() {
    const months = buildMonthlyStats();
    renderProgressKpis(months);
    renderMonthlyChart(months);
    renderKeeperMeasures();
    renderExerciseQuality();
  }

  const baseShowView = showView;
  showView = function (view) {
    if (!cloudUser && view !== "auth") return showAuth();
    if (view === "auth") return showAuth();
    baseShowView(view);
    if (view === "calendar") { q("screenTitle").textContent = "Calendario"; renderCalendar(); }
    if (view === "history") renderHistory();
    if (view === "progress") { q("screenTitle").textContent = "Progressi"; renderProgress(); }
    if (view === "home") { renderProfileSummary(); renderExercises(); }
  };

  getProfile = () => cloudProfile;
  getHistory = () => cloudHistory;
  setProfile = () => {};
  setHistory = () => {};
  saveProfileFromForm = saveCloudProfile;
  renderHistory = function () {
    const list = q("historyList"); if (!list) return;
    list.innerHTML = cloudHistory.length ? cloudHistory.map(renderSessionCard).join("") : `<div class="history-card"><h3>Nessuna sessione</h3><p class="muted">Completa un allenamento per vedere lo storico.</p></div>`;
  };
  renderActiveKeeperSelect = function () {
    const select = q("activeKeeper"), keepers = cloudProfile?.keepers || [];
    select.innerHTML = keepers.length ? keepers.map((k, i) => {
      const perf = [k.broadJump ? `BF ${k.broadJump}cm` : "", k.verticalJump ? `BI ${k.verticalJump}cm` : "", k.halfHeightJump ? `BMA ${k.halfHeightJump}cm` : "", k.twoPostsTest ? `2P ${k.twoPostsTest}s` : ""].filter(Boolean).join(" · ");
      const label = `${k.name || `Portiere ${i + 1}`}${k.height ? ` · ${k.height} cm` : ""}${k.weight ? ` · ${k.weight} kg` : ""}${perf ? ` · ${perf}` : ""}`;
      return `<option value="${esc(k.id)}" data-name="${esc(k.name || `Portiere ${i + 1}`)}">${esc(label)}</option>`;
    }).join("") : `<option value="" data-name="Portiere">Portiere</option>`;
  };
  finishWorkout = async function () {
    if (!selectedExercise || !cloudUser) return;
    running = false; clearInterval(timer); timer = null;
    const opt = q("activeKeeper")?.selectedOptions?.[0], sessionDate = q("sessionDateInput")?.value || todayKey();
    const session = { keeperId: opt?.value || null, keeperName: opt?.dataset?.name || "Portiere", exerciseId: selectedExercise.id, exerciseName: selectedExercise.name, sessionDate, plannedMinutes: selectedExercise.durationMin, saves: stats.saves, mistakes: stats.mistakes, reactions: stats.reactions, category: selectedExercise.ambito, sourcePage: selectedExercise.sourcePage, sport: cloudProfile?.sportType || selectedExercise.sport, level: cloudProfile?.level || "medio" };
    try { await api("/api/sessions", { method: "POST", body: { session } }); await loadData(false); selectedCalendarDate = sessionDate; calendarMonthDate = parseDateKey(sessionDate); q("phaseLabel").textContent = "Sessione salvata"; q("startPauseBtn").textContent = "Start"; renderProfileSummary(); }
    catch (e) { q("phaseLabel").textContent = `Errore salvataggio: ${e.message}`; }
  };
  const baseStartWorkoutScreen = startWorkoutScreen;
  startWorkoutScreen = function () { baseStartWorkoutScreen(); const d = q("sessionDateInput"); if (d) d.value = todayKey(); };

  document.addEventListener("DOMContentLoaded", async () => {
    localStorage.removeItem("gk_profile"); localStorage.removeItem("gk_history");
    q("keepersCount")?.addEventListener("change", renderKeeperFields);
    q("setupForm")?.addEventListener("submit", saveCloudProfile, true);
    q("authForm")?.addEventListener("submit", (e) => { e.preventDefault(); login(); });
    q("loginBtn")?.addEventListener("click", login);
    q("signupBtn")?.addEventListener("click", signup);
    q("logoutBtn")?.addEventListener("click", logout);
    q("exportJsonBtn")?.addEventListener("click", async () => { const data = await api("/api/export"); const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `gk-trainer-${todayKey()}.json`; a.click(); URL.revokeObjectURL(url); });
    q("importJsonBtn")?.addEventListener("click", () => q("importJsonInput")?.click());
    q("importJsonInput")?.addEventListener("change", async (e) => { const file = e.target.files?.[0]; if (!file) return; const data = JSON.parse(await file.text()); if (!confirm("Importare questo JSON? I dati attuali verranno sostituiti.")) return; await api("/api/import", { method: "POST", body: data }); await loadData(false); showView("profile"); e.target.value = ""; });
    const oldReset = q("resetBtn"); if (oldReset) { const btn = oldReset.cloneNode(true); oldReset.replaceWith(btn); btn.addEventListener("click", async () => { if (!confirm("Cancellare profilo, portieri e sessioni?")) return; await api("/api/all-data", { method: "DELETE" }); await loadData(false); showView("setup"); }); }
    q("prevMonthBtn")?.addEventListener("click", () => { calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() - 1, 1); renderCalendar(); });
    q("nextMonthBtn")?.addEventListener("click", () => { calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 1); renderCalendar(); });
    await loadData(true);
  });
})();
