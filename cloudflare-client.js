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

  function ensurePlannerStyles() {
    if (document.getElementById("calendarPlannerStyles")) return;
    const style = document.createElement("style");
    style.id = "calendarPlannerStyles";
    style.textContent = `
      .bottom-nav{grid-template-columns:repeat(3,1fr)!important}
      .planner-card{display:grid;gap:14px;margin-top:14px}
      .planner-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .planner-grid label{font-size:12px}
      .planner-toolbar{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}
      .planner-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
      .planner-summary .progress-kpi{padding:10px;border-radius:15px}
      .planner-summary .over{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.12)}
      .planner-list{display:grid;gap:10px;margin-top:12px}
      .planner-item{display:grid;grid-template-columns:1fr 92px 64px 44px;gap:8px;align-items:center;padding:12px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.045)}
      .planner-item input{font-size:16px!important}
      .planner-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .planner-empty{padding:14px;border:1px dashed var(--line);border-radius:18px;color:var(--muted);line-height:1.45}
      .planner-session-title{margin-top:18px}
      .calendar-dot.planned{background:#f97316;box-shadow:0 0 14px rgba(249,115,22,.45)}
      @media(max-width:390px){.planner-grid,.planner-toolbar,.planner-summary,.planner-actions{grid-template-columns:1fr}.planner-item{grid-template-columns:1fr}.planner-item .ghost-btn,.planner-item .danger-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function integrateProgressLayout() {
    const progressView = q("progressView");
    const performanceView = q("performanceView");
    const nav = q("bottomNav");
    const perfNav = document.querySelector('[data-tab="performance"]');
    const profileNav = document.querySelector('[data-tab="profile"]');

    if (perfNav) perfNav.remove();
    if (profileNav) profileNav.remove();
    if (nav) nav.style.setProperty("grid-template-columns", "repeat(3,1fr)", "important");

    if (!progressView || !performanceView) return;
    if (progressView.querySelector("#performanceForm")) {
      performanceView.remove();
      return;
    }

    const qualityCard = q("exerciseQualityList")?.closest(".progress-card") || null;
    Array.from(performanceView.children).forEach((card, index) => {
      if (index === 0) {
        card.querySelector(".eyebrow") && (card.querySelector(".eyebrow").textContent = "Performance");
        const title = card.querySelector("h2");
        const note = card.querySelector(".muted");
        if (title) title.textContent = "Motore del portiere";
        if (note) note.textContent = "Aggiorna i test fisici dalla stessa pagina in cui leggi l’andamento tecnico: balzi, rapidità laterale e profilo base restano collegati ai progressi.";
      }
      if (index === 1) {
        card.querySelector(".eyebrow") && (card.querySelector(".eyebrow").textContent = "Dashboard fisica");
        const title = card.querySelector("h2");
        const note = card.querySelector(".muted");
        if (title) title.textContent = "Profilo atletico portieri";
        if (note) note.textContent = "Sintesi di altezza, peso, balzi e test due pali per leggere il portiere come atleta, non solo come seduta.";
      }
      progressView.insertBefore(card, qualityCard);
    });
    performanceView.remove();
  }

  renderKeeperFields = function () {
    const count = Number(q("keepersCount")?.value || 3);
    const previous = Array.from(document.querySelectorAll(".keeper-row")).map((row) => ({
      name: val(row, ".keeper-name"), height: val(row, ".keeper-height"), weight: val(row, ".keeper-weight")
    }));
    const keepers = cloudProfile?.keepers || [];
    const box = q("keepersFields");
    if (!box) return;
    box.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const k = previous[i] || keepers[i] || {};
      const row = document.createElement("div");
      row.className = "keeper-row keeper-card";
      row.innerHTML = `<div class="keeper-main"><input class="keeper-name" placeholder="Nome ${i + 1}" value="${esc(k.name)}" /><input class="keeper-height" type="number" inputmode="numeric" placeholder="Altezza cm" value="${esc(k.height)}" /><input class="keeper-weight" type="number" inputmode="decimal" placeholder="Peso kg" value="${esc(k.weight)}" /></div>`;
      box.appendChild(row);
    }
  };

  async function saveCloudProfile(event) {
    event?.preventDefault();
    event?.stopPropagation();
    event?.stopImmediatePropagation?.();
    const rows = Array.from(document.querySelectorAll(".keeper-row"));
    const profile = {
      keepersCount: Number(q("keepersCount").value),
      sportType: q("sportType").value,
      level: q("level").value,
      sessionsPerWeek: Number(q("sessionsPerWeek").value),
      sessionDuration: Number(q("sessionDuration").value),
      keepers: rows.map((row, i) => {
        const existing = cloudProfile?.keepers?.[i] || {};
        return {
          id: existing.id || null,
          name: val(row, ".keeper-name") || `Portiere ${i + 1}`,
          height: cleanNum(val(row, ".keeper-height")),
          weight: cleanNum(val(row, ".keeper-weight")),
          broadJump: existing.broadJump ?? null,
          verticalJump: existing.verticalJump ?? null,
          halfHeightJump: existing.halfHeightJump ?? null,
          twoPostsTest: existing.twoPostsTest ?? null
        };
      })
    };
    try {
      await api("/api/profile", { method: "PUT", body: { profile } });
      await loadData(false);
      showView("home");
    } catch (e) { alert(e.message); }
  }

  async function login() {
    q("authStatus").textContent = "Accesso in corso...";
    try {
      await api("/api/login", { method: "POST", body: { email: q("authEmail").value.trim(), password: q("authPassword").value } });
      await loadData(true);
    } catch (e) { q("authStatus").textContent = e.message; }
  }

  async function signup() {
    q("authStatus").textContent = "Creazione account...";
    try {
      await api("/api/signup", { method: "POST", body: { email: q("authEmail").value.trim(), password: q("authPassword").value } });
      await loadData(true);
    } catch (e) { q("authStatus").textContent = e.message; }
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
    const key = sessionKey(s);
    const time = s.date ? new Date(s.date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    return `<div class="history-card"><p class="eyebrow">${esc(s.category)} · pag. ${s.sourcePage || "-"}</p><h3>${esc(s.exerciseName || "Esercizio")}</h3><p class="muted">${formatDateKey(key)}${time ? ` · salvata alle ${time}` : ""} · ${esc(s.keeper || "Portiere")}</p><div class="history-row"><span>Parate: ${s.saves}</span><span>Errori: ${s.mistakes}</span><span>Reazioni: ${s.reactions}</span><span>Durata: ${s.plannedMinutes || "-"}'</span></div></div>`;
  }

  function plannerStorageKey() {
    return `gk_day_plans_${cloudUser?.email || cloudUser?.id || "local"}`;
  }

  function readPlans() {
    try { return JSON.parse(localStorage.getItem(plannerStorageKey()) || "{}"); }
    catch { return {}; }
  }

  function writePlans(plans) {
    localStorage.setItem(plannerStorageKey(), JSON.stringify(plans));
  }

  function defaultPlan() {
    return { time: "18:00", totalMinutes: Number(cloudProfile?.sessionDuration || 60), items: [] };
  }

  function getDayPlan(key = selectedCalendarDate) {
    const plans = readPlans();
    return { ...defaultPlan(), ...(plans[key] || {}), items: Array.isArray(plans[key]?.items) ? plans[key].items : [] };
  }

  function saveDayPlan(key, plan) {
    const plans = readPlans();
    plans[key] = { ...plan, items: Array.isArray(plan.items) ? plan.items : [] };
    writePlans(plans);
  }

  function exerciseById(id) {
    return exercises.find((ex) => ex.id === id) || null;
  }

  function plannerExercisePool() {
    const sport = cloudProfile?.sportType || "calcio";
    const level = cloudProfile?.level || "medio";
    const recommended = exercises.filter((ex) => ex.sport === sport && ex.levels.includes(level));
    return recommended.length ? recommended : exercises;
  }

  function planUsedMinutes(plan) {
    return (plan.items || []).reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  }

  function timeToMinutes(time) {
    const [h, m] = String(time || "00:00").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function minutesToTime(total) {
    const day = 24 * 60;
    const value = ((total % day) + day) % day;
    const h = Math.floor(value / 60);
    const m = value % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function planItemWindow(plan, index) {
    const before = plan.items.slice(0, index).reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    const start = timeToMinutes(plan.time) + before;
    const end = start + Number(plan.items[index]?.minutes || 0);
    return `${minutesToTime(start)}-${minutesToTime(end)}`;
  }

  function renderDayPlanner(scroll = false) {
    ensurePlannerStyles();
    const title = q("selectedDateTitle");
    const box = q("selectedDateSessions");
    if (!title || !box) return;

    const plan = getDayPlan(selectedCalendarDate);
    const used = planUsedMinutes(plan);
    const total = Number(plan.totalMinutes || cloudProfile?.sessionDuration || 60);
    const remaining = total - used;
    const pool = plannerExercisePool();
    const sessions = sessionsForDate(selectedCalendarDate);

    title.textContent = formatDateKey(selectedCalendarDate);
    box.innerHTML = `
      <div class="planner-card">
        <div class="planner-grid">
          <label>Orario allenamento
            <input id="dayPlanTime" type="time" value="${esc(plan.time)}" />
          </label>
          <label>Tempo disponibile
            <input id="dayPlanTotal" type="number" inputmode="numeric" min="10" step="5" value="${esc(total)}" />
          </label>
        </div>
        <div class="planner-summary">
          <div class="progress-kpi"><span>Inizio</span><strong>${esc(plan.time)}</strong><small>orario previsto</small></div>
          <div class="progress-kpi"><span>Usati</span><strong>${used}'</strong><small>su ${total}' disponibili</small></div>
          <div class="progress-kpi ${remaining < 0 ? "over" : ""}"><span>${remaining < 0 ? "Sforo" : "Residui"}</span><strong>${Math.abs(remaining)}'</strong><small>${remaining < 0 ? "riduci esercizi o durata" : "ancora programmabili"}</small></div>
        </div>
        <div class="planner-toolbar">
          <label>Aggiungi esercizio
            <select id="dayPlanExercise">
              ${pool.map((ex) => `<option value="${esc(ex.id)}">${esc(ex.name)} · ${ex.durationMin}' · ${esc(ex.ambito)}</option>`).join("")}
            </select>
          </label>
          <button id="addPlanExerciseBtn" class="primary-btn" type="button">Aggiungi</button>
        </div>
        <div class="planner-actions">
          <button id="autoPlanBtn" class="dark-btn" type="button">Auto programma</button>
          <button id="clearPlanBtn" class="danger-btn" type="button">Svuota giornata</button>
        </div>
        <div id="dayPlanItems" class="planner-list">
          ${plan.items.length ? plan.items.map((item, index) => {
            const ex = exerciseById(item.exerciseId);
            return `<div class="planner-item" data-index="${index}">
              <div>
                <p class="eyebrow">${esc(planItemWindow(plan, index))}</p>
                <h3>${esc(ex?.name || "Esercizio")}</h3>
                <p class="muted small-note">${esc(ex?.ambito || "")} · durata consigliata ${ex?.durationMin || item.minutes}'</p>
              </div>
              <input class="plan-item-minutes" type="number" inputmode="numeric" min="1" step="1" value="${esc(item.minutes)}" />
              <button class="ghost-btn" data-plan-start="${index}" type="button">Avvia</button>
              <button class="danger-btn" data-plan-remove="${index}" type="button">×</button>
            </div>`;
          }).join("") : `<div class="planner-empty">Nessun esercizio programmato. Imposta durata, poi aggiungi manualmente o usa Auto programma.</div>`}
        </div>
        <div class="planner-session-title">
          <p class="eyebrow">Sessioni completate</p>
          <div class="history-list compact">${sessions.length ? sessions.map(renderSessionCard).join("") : `<div class="history-card"><h3>Nessuna sessione completata</h3><p class="muted">Quando termini un allenamento in questa data, comparirà qui.</p></div>`}</div>
        </div>
      </div>`;

    bindPlannerEvents();
    if (scroll) q("selectedDateSessions")?.closest(".calendar-list-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function persistPlannerInputs() {
    const plan = getDayPlan(selectedCalendarDate);
    plan.time = q("dayPlanTime")?.value || plan.time;
    plan.totalMinutes = Number(q("dayPlanTotal")?.value || plan.totalMinutes || cloudProfile?.sessionDuration || 60);
    saveDayPlan(selectedCalendarDate, plan);
  }

  function bindPlannerEvents() {
    q("dayPlanTime")?.addEventListener("change", () => { persistPlannerInputs(); renderCalendar(); });
    q("dayPlanTotal")?.addEventListener("change", () => { persistPlannerInputs(); renderCalendar(); });
    q("addPlanExerciseBtn")?.addEventListener("click", addExerciseToPlan);
    q("autoPlanBtn")?.addEventListener("click", autoBuildPlan);
    q("clearPlanBtn")?.addEventListener("click", () => {
      if (!confirm("Svuotare la programmazione di questa giornata?")) return;
      const plan = getDayPlan(selectedCalendarDate);
      plan.items = [];
      saveDayPlan(selectedCalendarDate, plan);
      renderCalendar();
    });
    document.querySelectorAll(".plan-item-minutes").forEach((input) => {
      input.addEventListener("change", () => {
        const row = input.closest(".planner-item");
        const index = Number(row?.dataset.index);
        const plan = getDayPlan(selectedCalendarDate);
        if (plan.items[index]) plan.items[index].minutes = Number(input.value || 0);
        saveDayPlan(selectedCalendarDate, plan);
        renderCalendar();
      });
    });
    document.querySelectorAll("[data-plan-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.planRemove);
        const plan = getDayPlan(selectedCalendarDate);
        plan.items.splice(index, 1);
        saveDayPlan(selectedCalendarDate, plan);
        renderCalendar();
      });
    });
    document.querySelectorAll("[data-plan-start]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.planStart);
        const plan = getDayPlan(selectedCalendarDate);
        const item = plan.items[index];
        const ex = exerciseById(item?.exerciseId);
        if (!ex) return;
        selectedExercise = { ...ex, durationMin: Number(item.minutes || ex.durationMin) };
        startWorkoutScreen();
        const dateInput = q("sessionDateInput");
        if (dateInput) dateInput.value = selectedCalendarDate;
      });
    });
  }

  function addExerciseToPlan() {
    persistPlannerInputs();
    const plan = getDayPlan(selectedCalendarDate);
    const id = q("dayPlanExercise")?.value;
    const ex = exerciseById(id);
    if (!ex) return;
    const remaining = Number(plan.totalMinutes || 0) - planUsedMinutes(plan);
    const minutes = remaining > 0 ? Math.min(ex.durationMin, remaining) : ex.durationMin;
    plan.items.push({ exerciseId: ex.id, minutes: Math.max(1, Number(minutes || ex.durationMin)) });
    saveDayPlan(selectedCalendarDate, plan);
    renderCalendar();
  }

  function autoBuildPlan() {
    persistPlannerInputs();
    const plan = getDayPlan(selectedCalendarDate);
    const total = Number(plan.totalMinutes || cloudProfile?.sessionDuration || 60);
    const pool = plannerExercisePool();
    const chosen = [];
    let remaining = total;

    const buckets = ["Tecnico", "Difesa spazio", "Finalizzazione", "Motorio", "Conoscenza del gioco"];
    const ordered = [...pool].sort((a, b) => buckets.indexOf(a.ambito) - buckets.indexOf(b.ambito));
    for (const ex of ordered) {
      if (remaining <= 0) break;
      if (ex.durationMin <= remaining || chosen.length === 0) {
        chosen.push({ exerciseId: ex.id, minutes: Math.min(ex.durationMin, remaining || ex.durationMin) });
        remaining -= ex.durationMin;
      }
    }
    plan.items = chosen.length ? chosen : pool.slice(0, 1).map((ex) => ({ exerciseId: ex.id, minutes: Math.min(ex.durationMin, total) }));
    saveDayPlan(selectedCalendarDate, plan);
    renderCalendar();
  }

  function renderCalendar() {
    ensurePlannerStyles();
    const grid = q("calendarGrid"), title = q("calendarMonthTitle");
    if (!grid || !title) return;
    const y = calendarMonthDate.getFullYear(), m = calendarMonthDate.getMonth(), first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate(), offset = (first.getDay() + 6) % 7, today = todayKey(), map = sessionsByDate(), plans = readPlans();
    title.textContent = first.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`<button class="calendar-day empty" type="button"></button>`);
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const hasSessions = Boolean(map[key]?.length);
      const hasPlan = Boolean(plans[key]?.items?.length);
      const cls = ["calendar-day", key === today ? "today" : "", key === selectedCalendarDate ? "selected" : ""].filter(Boolean).join(" ");
      const dot = hasSessions || hasPlan ? `<span class="calendar-dot ${hasPlan && !hasSessions ? "planned" : ""}"></span>` : `<span></span>`;
      cells.push(`<button class="${cls}" type="button" data-date="${key}"><span class="calendar-day-number">${d}</span>${dot}</button>`);
    }
    grid.innerHTML = cells.join("");
    document.querySelectorAll(".calendar-day[data-date]").forEach((b) => b.addEventListener("click", () => { selectedCalendarDate = b.dataset.date; renderCalendar(); renderDayPlanner(true); }));
    renderDayPlanner();
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
    const actions = current.saves + current.mistakes + current.reactions;
    box.innerHTML = `
      <div class="progress-kpi"><span>Mese</span><strong>${esc(monthLabel(current.key))}</strong><small>${current.sessions} sedute · ${current.minutes}' totali</small></div>
      <div class="progress-kpi"><span>Qualità</span><strong>${current.quality ?? "—"}</strong><small>${esc(deltaText)}</small></div>
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

  function performanceCompleteness(k) {
    return [k.broadJump, k.verticalJump, k.halfHeightJump, k.twoPostsTest].filter((v) => v !== "" && v !== null && v !== undefined).length;
  }

  function renderPerformanceForm() {
    const box = q("performanceFields");
    const form = q("performanceForm");
    if (!box || !form) return;
    const keepers = cloudProfile?.keepers || [];
    if (!keepers.length) {
      box.innerHTML = `<div class="no-data">Configura prima i portieri nel profilo.</div>`;
      return;
    }
    form.onsubmit = savePerformanceProfile;
    box.innerHTML = keepers.map((k, i) => `
      <div class="measure-card performance-row" data-index="${i}">
        <div class="quality-top">
          <div>
            <p class="eyebrow">Portiere ${i + 1}</p>
            <h3>${esc(k.name || `Portiere ${i + 1}`)}</h3>
            <p class="muted small-note">${k.height ? `${esc(k.height)} cm` : "Altezza n/d"} · ${k.weight ? `${esc(k.weight)} kg` : "Peso n/d"}</p>
          </div>
          <div class="quality-score">${performanceCompleteness(k)}/4</div>
        </div>
        <div class="performance-tests">
          <input class="perf-broad-jump" type="number" inputmode="decimal" placeholder="Balzo da fermo cm" value="${esc(k.broadJump)}" />
          <input class="perf-vertical-jump" type="number" inputmode="decimal" placeholder="Balzo in alto cm" value="${esc(k.verticalJump)}" />
          <input class="perf-half-height-jump" type="number" inputmode="decimal" placeholder="Balzo mezza altezza cm" value="${esc(k.halfHeightJump)}" />
          <input class="perf-two-posts-test" type="number" step="0.01" inputmode="decimal" placeholder="Test due pali sec" value="${esc(k.twoPostsTest)}" />
        </div>
      </div>`).join("");
  }

  async function savePerformanceProfile(event) {
    event?.preventDefault();
    const base = cloudProfile || { keepers: [] };
    const rows = Array.from(document.querySelectorAll(".performance-row"));
    const keepers = (base.keepers || []).map((keeper, i) => {
      const row = rows.find((r) => Number(r.dataset.index) === i);
      return {
        id: keeper.id || null,
        name: keeper.name || `Portiere ${i + 1}`,
        height: cleanNum(keeper.height),
        weight: cleanNum(keeper.weight),
        broadJump: cleanNum(row ? val(row, ".perf-broad-jump") : keeper.broadJump),
        verticalJump: cleanNum(row ? val(row, ".perf-vertical-jump") : keeper.verticalJump),
        halfHeightJump: cleanNum(row ? val(row, ".perf-half-height-jump") : keeper.halfHeightJump),
        twoPostsTest: cleanNum(row ? val(row, ".perf-two-posts-test") : keeper.twoPostsTest)
      };
    });
    const profile = { ...base, keepers };
    try {
      await api("/api/profile", { method: "PUT", body: { profile } });
      await loadData(false);
      renderProgress();
      if (q("backupStatus")) q("backupStatus").textContent = "Test fisici salvati.";
    } catch (e) { alert(e.message); }
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
      const completed = performanceCompleteness(k);
      const focus = completed === 4 ? "Scheda completa" : completed >= 2 ? "Completa i test mancanti" : "Da misurare";
      const tags = [
        k.height ? `Altezza ${k.height} cm` : "Altezza n/d",
        k.weight ? `Peso ${k.weight} kg` : "Peso n/d",
        k.broadJump ? `Balzo fermo ${k.broadJump} cm` : "Balzo fermo n/d",
        k.verticalJump ? `Balzo alto ${k.verticalJump} cm` : "Balzo alto n/d",
        k.halfHeightJump ? `Mezza altezza ${k.halfHeightJump} cm` : "Mezza altezza n/d",
        k.twoPostsTest ? `Due pali ${k.twoPostsTest} s` : "Due pali n/d"
      ];
      return `<div class="measure-card"><div class="quality-top"><div><p class="eyebrow">${esc(focus)}</p><h3>${esc(k.name || `Portiere ${i + 1}`)}</h3></div><div class="quality-score">${completed}/4</div></div><div class="metric-tags">${tags.map((t) => `<span class="metric-tag">${esc(t)}</span>`).join("")}</div></div>`;
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

  function renderHistory() {
    const list = q("historyList");
    if (!list) return;
    list.innerHTML = cloudHistory.length ? cloudHistory.map(renderSessionCard).join("") : `<div class="history-card"><h3>Nessuna sessione</h3><p class="muted">Completa un allenamento per vedere lo storico.</p></div>`;
  }

  function renderProgress() {
    integrateProgressLayout();
    const months = buildMonthlyStats();
    renderProgressKpis(months);
    renderMonthlyChart(months);
    renderPerformanceForm();
    renderKeeperMeasures();
    renderExerciseQuality();
    renderHistory();
  }

  const baseShowView = showView;
  showView = function (view) {
    if (!cloudUser && view !== "auth") return showAuth();
    if (view === "auth") return showAuth();
    const target = view === "performance" || view === "history" ? "progress" : view;
    baseShowView(target);
    integrateProgressLayout();
    if (target === "calendar") { q("screenTitle").textContent = "Calendario"; renderCalendar(); }
    if (target === "progress") { q("screenTitle").textContent = "Progressi"; renderProgress(); }
    if (target === "home") { renderProfileSummary(); renderExercises(); }
  };

  getProfile = () => cloudProfile;
  getHistory = () => cloudHistory;
  setProfile = () => {};
  setHistory = () => {};
  saveProfileFromForm = saveCloudProfile;

  renderActiveKeeperSelect = function () {
    const select = q("activeKeeper"), keepers = cloudProfile?.keepers || [];
    select.innerHTML = keepers.length ? keepers.map((k, i) => {
      const label = `${k.name || `Portiere ${i + 1}`}${k.height ? ` · ${k.height} cm` : ""}${k.weight ? ` · ${k.weight} kg` : ""}`;
      return `<option value="${esc(k.id)}" data-name="${esc(k.name || `Portiere ${i + 1}`)}">${esc(label)}</option>`;
    }).join("") : `<option value="" data-name="Portiere">Portiere</option>`;
  };

  finishWorkout = async function () {
    if (!selectedExercise || !cloudUser) return;
    running = false;
    clearInterval(timer);
    timer = null;
    const opt = q("activeKeeper")?.selectedOptions?.[0], sessionDate = q("sessionDateInput")?.value || todayKey();
    const session = {
      keeperId: opt?.value || null,
      keeperName: opt?.dataset?.name || "Portiere",
      exerciseId: selectedExercise.id,
      exerciseName: selectedExercise.name,
      sessionDate,
      plannedMinutes: selectedExercise.durationMin,
      saves: stats.saves,
      mistakes: stats.mistakes,
      reactions: stats.reactions,
      category: selectedExercise.ambito,
      sourcePage: selectedExercise.sourcePage,
      sport: cloudProfile?.sportType || selectedExercise.sport,
      level: cloudProfile?.level || "medio"
    };
    try {
      await api("/api/sessions", { method: "POST", body: { session } });
      await loadData(false);
      selectedCalendarDate = sessionDate;
      calendarMonthDate = parseDateKey(sessionDate);
      q("phaseLabel").textContent = "Sessione salvata";
      q("startPauseBtn").textContent = "Start";
      renderProfileSummary();
    } catch (e) { q("phaseLabel").textContent = `Errore salvataggio: ${e.message}`; }
  };

  const baseStartWorkoutScreen = startWorkoutScreen;
  startWorkoutScreen = function () {
    baseStartWorkoutScreen();
    const d = q("sessionDateInput");
    if (d) d.value = selectedCalendarDate || todayKey();
  };

  document.addEventListener("DOMContentLoaded", async () => {
    ensurePlannerStyles();
    integrateProgressLayout();
    localStorage.removeItem("gk_profile");
    localStorage.removeItem("gk_history");
    q("keepersCount")?.addEventListener("change", renderKeeperFields);
    q("setupForm")?.addEventListener("submit", saveCloudProfile, true);
    q("authForm")?.addEventListener("submit", (e) => { e.preventDefault(); login(); });
    q("loginBtn")?.addEventListener("click", login);
    q("signupBtn")?.addEventListener("click", signup);
    q("logoutBtn")?.addEventListener("click", logout);
    q("performanceForm")?.addEventListener("submit", savePerformanceProfile);
    q("exportJsonBtn")?.addEventListener("click", async () => {
      const data = await api("/api/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gk-trainer-${todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    q("importJsonBtn")?.addEventListener("click", () => q("importJsonInput")?.click());
    q("importJsonInput")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const data = JSON.parse(await file.text());
      if (!confirm("Importare questo JSON? I dati attuali verranno sostituiti.")) return;
      await api("/api/import", { method: "POST", body: data });
      await loadData(false);
      showView("profile");
      e.target.value = "";
    });
    const oldReset = q("resetBtn");
    if (oldReset) {
      const btn = oldReset.cloneNode(true);
      oldReset.replaceWith(btn);
      btn.addEventListener("click", async () => {
        if (!confirm("Cancellare profilo, portieri e sessioni?")) return;
        await api("/api/all-data", { method: "DELETE" });
        await loadData(false);
        showView("setup");
      });
    }
    q("prevMonthBtn")?.addEventListener("click", () => { calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() - 1, 1); renderCalendar(); });
    q("nextMonthBtn")?.addEventListener("click", () => { calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 1); renderCalendar(); });
    await loadData(true);
  });
})();
