(() => {
  // I rapporti partita prima squadra vivono in training_sessions con questa
  // category (stesso valore usato server-side e in calendar-keepers.js), ma
  // non sono allenamenti: esclusi qui, alla fonte, invece che con un filtro
  // sulla risposta fetch applicato altrove.
  const MATCH_CATEGORY = "__match__";
  let cloudUser = null;
  let cloudProfile = null;
  let cloudHistory = [];
  let selectedCalendarDate = todayKey();
  let calendarMonthDate = new Date();

  const q = (id) => document.getElementById(id);
  const esc = (v) => escapeHtml(String(v ?? ""));
  const cleanNum = (v) => v === "" || v === null || v === undefined ? null : Number(v);
  const val = (row, selector) => row.querySelector(selector)?.value?.trim() || "";

  // Europe/Rome esplicito invece dell'ora locale del dispositivo: le date
  // partita (functions/api/health.js, calendar-keepers.js) sono già calcolate
  // così. Con questa funzione ancorata al fuso del dispositivo, un telefono
  // impostato su un fuso diverso vedeva "oggi" e il giorno partita disallineati
  // di un giorno intorno alla mezzanotte.
  function todayKey(d = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function formatDateKey(key) {
    return parseDateKey(key).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }

  function shortDateKey(key) {
    return parseDateKey(key).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
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
    document.body.classList.remove("gk-authenticated");
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    q("authView")?.classList.add("active");
    q("bottomNav")?.classList.add("hidden");
    if (q("screenTitle")) q("screenTitle").textContent = "Accesso";
    if (q("authStatus")) q("authStatus").textContent = message;
  }

  function normalizeProfile(profile) {
    if (!profile) return null;
    const physicalHistory = profile.physicalHistory ?? profile.physical_history;
    const trainingPlans = profile.trainingPlans ?? profile.training_plans;
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
      })),
      // Passthrough: normalizeProfile teneva solo i campi base finché il server
      // scartava questi due (vedi Step 2). Ora vanno mantenuti perché
      // renderTrainingView() e la card "Salva allenamento" li leggono da
      // cloudProfile senza rifare una fetch dedicata.
      physicalHistory: Array.isArray(physicalHistory) ? physicalHistory : [],
      trainingPlans: trainingPlans && typeof trainingPlans === "object" && !Array.isArray(trainingPlans) ? trainingPlans : {}
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
      cloudHistory = (sessionsRes.sessions || []).filter((s) => s.category !== MATCH_CATEGORY).map(normalizeSession);
      if (q("cloudUserLabel")) q("cloudUserLabel").textContent = `Connesso come ${cloudUser.email}`;
      // Unico punto in cui lo stato "autenticato" viene deciso: la topbar, il
      // titolo pagina e la bottom bar dipendono da questa classe via CSS.
      document.body.classList.add("gk-authenticated");
    } catch (e) {
      cloudUser = null;
      cloudProfile = null;
      cloudHistory = [];
      document.body.classList.remove("gk-authenticated");
      if (render) showAuth(e.status === 401 ? "" : e.message);
      return;
    }
    if (!render) return;
    // "home" e non "landing": calendar-keepers.js intercetta la primissima
    // chiamata con view === "home" per mostrare la Home reale al posto della
    // lista esercizi (vedi hookLanding in calendar-keepers.js). Chiamare
    // "landing" direttamente qui salterebbe quel meccanismo one-shot e
    // lascerebbe il flag "pending" attivo, dirottando su Home anche il
    // successivo click sulla tab "Esercizi".
    if (cloudProfile) showView("home");
    else { loadProfileIntoForm(); showView("setup"); }
  }

  // ensurePlannerStyles() è stato rimosso: ogni regola che era ancora viva
  // (non già sovrascritta dalle versioni con !important in style.css) è
  // stata spostata dentro style.css stesso — vedi .planner-list,
  // .planner-item, .planner-toolbar, .planner-summary, .planner-grid label.

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
    await api("/api/logout", { method: "POST" }).catch((e) => console.warn("Logout API non riuscita:", e.message));
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
    const title = q("selectedDateTitle");
    const box = q("selectedDateSessions");
    if (!title || !box) return;

    title.textContent = formatDateKey(selectedCalendarDate);

    // Giorno partita: si mostra la card rapporto al posto del planner, non
    // sopra. Il planner non viene proprio renderizzato, quindi non c'è nulla
    // su cui intervenire in seguito per impedire di inserire allenamenti.
    const match = window.gkCalendarExtras?.matchForDate?.(selectedCalendarDate);
    if (match) {
      window.gkCalendarExtras.renderMatchCard(match);
      if (scroll) box.closest(".calendar-list-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    delete box.dataset.firstTeamMatch;
    delete box.dataset.matchSignature;

    const plan = getDayPlan(selectedCalendarDate);
    const used = planUsedMinutes(plan);
    const total = Number(plan.totalMinutes || cloudProfile?.sessionDuration || 60);
    const remaining = total - used;
    const pool = plannerExercisePool();
    const sessions = sessionsForDate(selectedCalendarDate);

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
        <div class="planner-save-row">
          <button id="saveCalendarPlanBtn" class="primary-btn full" type="button">Salva allenamento</button>
          <p id="calendarSaveStatus" class="muted small-note calendar-save-status">Gli esercizi salvati saranno disponibili su questo account.</p>
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
              <button class="accent-btn" data-plan-start="${index}" type="button">Avvia</button>
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
    window.gkCalendarExtras?.renderKeeperAttendance?.();
    if (scroll) q("selectedDateSessions")?.closest(".calendar-list-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function persistPlannerInputs() {
    const plan = getDayPlan(selectedCalendarDate);
    plan.time = q("dayPlanTime")?.value || plan.time;
    plan.totalMinutes = Number(q("dayPlanTotal")?.value || plan.totalMinutes || cloudProfile?.sessionDuration || 60);
    saveDayPlan(selectedCalendarDate, plan);
  }

  function setSaveButtonState(state, text) {
    const btn = q("saveCalendarPlanBtn");
    const status = q("calendarSaveStatus");
    if (btn) {
      btn.classList.remove("gk-saving", "gk-saved", "gk-error");
      if (state) btn.classList.add(state);
      btn.textContent = text || "Salva allenamento";
      btn.disabled = state === "gk-saving";
    }
    if (status) {
      status.classList.remove("gk-ok", "gk-error");
      if (state === "gk-saved") status.classList.add("gk-ok");
      if (state === "gk-error") status.classList.add("gk-error");
      status.textContent = text || "Gli esercizi salvati saranno disponibili su questo account.";
    }
  }

  function markPlanSaved(plan) {
    const now = new Date().toISOString();
    return {
      ...plan,
      savedAt: now,
      updatedAt: now,
      // "accountSaved" e "saveSource" restano per compatibilità con
      // calendar-keepers.js (isTrainingEligible/isExplicit), non ancora
      // aggiornato in questo step: savedAt è comunque l'unica vera fonte
      // di verità per "allenamento salvato" in questo file.
      accountSaved: true,
      saveSource: "calendar-save"
    };
  }

  async function deleteCalendarPlan(date) {
    if (!confirm("Eliminare l'allenamento salvato per questa data?")) return;
    setSaveButtonState("gk-saving", "Eliminazione...");
    try {
      const nextPlans = { ...readPlans() };
      delete nextPlans[date];
      await api("/api/profile", { method: "PUT", body: { profile: { ...cloudProfile, trainingPlans: nextPlans, training_plans: nextPlans } } });
      writePlans(nextPlans);
      await loadData(false);
      // Anche il pallino nel mese va aggiornato subito: senza questo,
      // il giorno svuotato restava marcato come "programmato" (pallino
      // oro) finché non si usciva e rientrava nel Calendario.
      renderCalendar();
      renderTrainingView();
      window.dispatchEvent(new CustomEvent("gk-training-plans-updated", { detail: { date } }));
      setSaveButtonState("gk-saved", "Eliminato");
    } catch (e) {
      setSaveButtonState("gk-error", `Errore eliminazione: ${e.message}`);
    } finally {
      setTimeout(() => setSaveButtonState("", "Salva allenamento"), 1800);
    }
  }

  async function saveCalendarPlan() {
    persistPlannerInputs();
    const date = selectedCalendarDate;
    const plan = getDayPlan(date);
    if (!plan.items.length) {
      // Svuotare la giornata e premere "Salva allenamento" è il modo per
      // togliere una seduta già salvata (es. programmata per sbaglio nel
      // giorno sbagliato) — non solo un errore da mostrare. Se non c'era
      // nulla di salvato per questa data, resta un errore come prima.
      if (cloudProfile?.trainingPlans?.[date]?.items?.length) {
        await deleteCalendarPlan(date);
      } else {
        setSaveButtonState("gk-error", "Aggiungi almeno un esercizio");
        setTimeout(() => setSaveButtonState("", ""), 1800);
      }
      return;
    }
    setSaveButtonState("gk-saving", "Salvataggio...");
    const saved = markPlanSaved(plan);
    try {
      const nextPlans = { ...readPlans(), [date]: saved };
      await api("/api/profile", { method: "PUT", body: { profile: { ...cloudProfile, trainingPlans: nextPlans, training_plans: nextPlans } } });
      saveDayPlan(date, saved);
      await loadData(false);
      renderTrainingView();
      window.dispatchEvent(new CustomEvent("gk-training-plans-updated", { detail: { date } }));
      setSaveButtonState("gk-saved", "Salvato ✓");
    } catch (e) {
      setSaveButtonState("gk-error", `Errore salvataggio: ${e.message}`);
    } finally {
      setTimeout(() => setSaveButtonState("", "Salva allenamento"), 1800);
    }
  }

  function bindPlannerEvents() {
    q("dayPlanTime")?.addEventListener("change", () => { persistPlannerInputs(); renderCalendar(); });
    q("dayPlanTotal")?.addEventListener("change", () => { persistPlannerInputs(); renderCalendar(); });
    q("addPlanExerciseBtn")?.addEventListener("click", addExerciseToPlan);
    q("autoPlanBtn")?.addEventListener("click", autoBuildPlan);
    q("saveCalendarPlanBtn")?.addEventListener("click", saveCalendarPlan);
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
    // Un ambito assente da "buckets" (es. "Esplorativo") deve finire in fondo
    // all'ordinamento, non in testa: indexOf restituisce -1, che senza questa
    // normalizzazione batte qualunque indice reale (0..4) e mette quell'esercizio
    // sempre per primo in "Auto programma".
    const bucketIndex = (ambito) => { const idx = buckets.indexOf(ambito); return idx === -1 ? Infinity : idx; };
    const ordered = [...pool].sort((a, b) => bucketIndex(a.ambito) - bucketIndex(b.ambito));
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
      const match = window.gkCalendarExtras?.matchForDate?.(key);
      const cls = ["calendar-day", key === today ? "today" : "", key === selectedCalendarDate ? "selected" : "", match ? "first-team-match-day" : ""].filter(Boolean).join(" ");
      const dot = hasSessions || hasPlan ? `<span class="calendar-dot ${hasPlan && !hasSessions ? "planned" : ""}"></span>` : `<span></span>`;
      const badge = match ? `<span class="calendar-match-badge" title="${esc(match.homeTeam)} - ${esc(match.awayTeam)}">1ª</span>` : "";
      cells.push(`<button class="${cls}" type="button" data-date="${key}"><span class="calendar-day-number">${d}</span>${dot}${badge}</button>`);
    }
    grid.innerHTML = cells.join("");
    document.querySelectorAll(".calendar-day[data-date]").forEach((b) => b.addEventListener("click", () => { selectedCalendarDate = b.dataset.date; renderCalendar(); renderDayPlanner(true); }));
    renderDayPlanner();
  }

  // --- Vista Allenamento -----------------------------------------------
  // Fonte dati unica: cloudProfile.trainingPlans, così com'è tornato
  // dall'ultima PUT/GET /api/profile. Nessun merge locale multi-account,
  // nessuna unione tra chiavi diverse: solo i piani dell'account corrente,
  // e solo quelli con savedAt (impostato esclusivamente da "Salva
  // allenamento" in saveCalendarPlan/markPlanSaved). Una bozza in corso di
  // modifica sul Calendario non arriva mai qui, perché non viene mai
  // inviata al server finché non si clicca "Salva allenamento".
  const TRAINING_FILTER_KEY = "gk_training_filter_date";

  function trainingSavedRows() {
    return Object.entries(cloudProfile?.trainingPlans || {})
      .filter(([, plan]) => Array.isArray(plan?.items) && plan.items.length && plan.savedAt)
      .map(([date, plan]) => ({ date, plan }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function trainingPlanSummary(row) {
    const total = row.plan.items.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    const done = row.plan.items.filter((item) => item.done).length;
    return { total, done };
  }

  function appendTrainingExercises(list, row) {
    const summary = trainingPlanSummary(row);
    const meta = document.createElement("div");
    meta.className = "training-session-meta";
    meta.innerHTML = `<h3>${esc(formatDateKey(row.date))}</h3><p class="muted">${esc(row.plan.time || "orario non impostato")} · ${row.plan.items.length} esercizi · ${summary.total} min programmati · ${summary.done}/${row.plan.items.length} fatti</p>`;
    list.appendChild(meta);
    row.plan.items.forEach((item, index) => {
      const ex = exerciseById(item.exerciseId);
      const card = document.createElement("div");
      card.className = "training-item" + (item.done ? " is-done" : "");
      card.innerHTML = `<div class="training-item-top"><div><p class="eyebrow">${esc(ex?.ambito || "Esercizio")} · ${Number(item.minutes || ex?.durationMin || 0)} min</p><h4>${esc(ex?.name || "Esercizio")}</h4></div><button class="accent-btn" type="button" data-training-start="1" data-plan-date="${esc(row.date)}" data-plan-index="${index}">Avvia</button></div><div class="training-item-actions"><label class="training-done"><input type="checkbox" data-training-done="1" data-plan-date="${esc(row.date)}" data-plan-index="${index}"${item.done ? " checked" : ""} /> Fatto</label></div><label class="small-note">Note esercizio<textarea data-training-note="1" data-plan-date="${esc(row.date)}" data-plan-index="${index}" placeholder="Note operative, varianti, focus tecnico...">${esc(item.note || "")}</textarea></label>`;
      list.appendChild(card);
    });
  }

  function appendAllSavedTrainingPlans(list, rows, currentDate) {
    if (!rows.length) return;
    const title = document.createElement("div");
    title.className = "training-all-title";
    title.textContent = "Tutti gli allenamenti salvati";
    list.appendChild(title);
    rows.forEach((row) => {
      const summary = trainingPlanSummary(row);
      const card = document.createElement("div");
      card.className = "training-saved-card" + (row.date === currentDate ? " is-current" : "");
      card.innerHTML = `<h4>${esc(shortDateKey(row.date))}</h4><p class="muted">${esc(row.plan.time || "orario non impostato")} · ${row.plan.items.length} esercizi · ${summary.total} min · ${summary.done}/${row.plan.items.length} fatti</p><button class="dark-btn full" type="button" data-training-open-date="${esc(row.date)}">Apri questa seduta</button>`;
      list.appendChild(card);
    });
  }

  function renderTrainingView() {
    const title = q("trainingTitle"), subtitle = q("trainingSubtitle"), list = q("trainingList"), filterInput = q("trainingDateFilter");
    if (!title || !subtitle || !list) return;
    const filter = localStorage.getItem(TRAINING_FILTER_KEY) || "";
    if (filterInput && filterInput.value !== filter) filterInput.value = filter;
    const allRows = trainingSavedRows();
    const today = todayKey();
    const rows = filter
      ? allRows.filter((row) => row.date === filter).slice(0, 1)
      : (() => { const next = allRows.find((row) => row.date >= today); return next ? [next] : (allRows.length ? [allRows[allRows.length - 1]] : []); })();
    list.innerHTML = "";
    if (!rows.length) {
      if (filter && allRows.length) {
        title.textContent = `Allenamento · ${shortDateKey(filter)}`;
        subtitle.textContent = "Non ci sono sedute salvate per questa data.";
        list.innerHTML = `<div class="training-empty"><strong>Nessun allenamento in questa data.</strong><span>Scegli un’altra data oppure torna alla prossima seduta disponibile.</span><button id="goNextTraining" class="primary-btn full" type="button">Mostra prossimo allenamento</button></div>`;
        q("goNextTraining")?.addEventListener("click", () => { localStorage.removeItem(TRAINING_FILTER_KEY); renderTrainingView(); });
        appendAllSavedTrainingPlans(list, allRows, "");
        return;
      }
      title.textContent = "Nessun allenamento salvato";
      subtitle.textContent = "Prepara una seduta dal calendario e premi Salva allenamento. Dopo la reinstallazione resterà collegata al tuo account.";
      list.innerHTML = `<div class="training-empty"><strong>Aggiungi gli esercizi per il prossimo allenamento.</strong><span>Apri il calendario, scegli il giorno, inserisci gli esercizi e salva la seduta.</span><button id="goCalendarFromTraining" class="primary-btn full" type="button">Vai al calendario</button></div>`;
      q("goCalendarFromTraining")?.addEventListener("click", () => showView("calendar"));
      return;
    }
    const row = rows[0];
    title.textContent = filter ? `Allenamento · ${shortDateKey(row.date)}` : `Prossimo allenamento · ${shortDateKey(row.date)}`;
    subtitle.textContent = filter ? "Seduta salvata per la data selezionata." : "Di default vedi la prossima seduta rispetto a oggi. Sotto trovi anche tutte le sedute salvate.";
    appendTrainingExercises(list, row);
    appendAllSavedTrainingPlans(list, allRows, row.date);
  }

  let trainingSyncTimer = null;
  function queueTrainingSync(plans) {
    clearTimeout(trainingSyncTimer);
    trainingSyncTimer = setTimeout(() => {
      api("/api/profile", { method: "PUT", body: { profile: { ...cloudProfile, trainingPlans: plans, training_plans: plans } } })
        .then(() => loadData(false))
        .catch((e) => console.warn("Sincronizzazione allenamento non riuscita:", e.message));
    }, 650);
  }

  async function updateTrainingItem(date, index, patch, { immediate = true } = {}) {
    const plans = { ...(cloudProfile?.trainingPlans || {}) };
    const plan = plans[date];
    if (!plan?.items?.[index]) return;
    const nextPlan = { ...plan, items: plan.items.map((it, i) => (i === index ? { ...it, ...patch } : it)), updatedAt: new Date().toISOString() };
    plans[date] = nextPlan;
    cloudProfile = { ...cloudProfile, trainingPlans: plans };
    saveDayPlan(date, nextPlan);
    if (immediate) {
      clearTimeout(trainingSyncTimer);
      try {
        await api("/api/profile", { method: "PUT", body: { profile: { ...cloudProfile, trainingPlans: plans, training_plans: plans } } });
        await loadData(false);
      } catch (e) { console.warn("Aggiornamento allenamento non riuscito:", e.message); }
      renderTrainingView();
    } else {
      queueTrainingSync(plans);
    }
  }

  function startTrainingExercise(date, index) {
    const plan = cloudProfile?.trainingPlans?.[date];
    const item = plan?.items?.[index];
    const ex = exerciseById(item?.exerciseId);
    if (!ex) return;
    selectedExercise = { ...ex, durationMin: Number(item.minutes || ex.durationMin || 1) };
    startWorkoutScreen();
    const dateInput = q("sessionDateInput");
    if (dateInput) dateInput.value = date;
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
    // Il submit del form è gestito da calendar-keepers.js (bindPhysicalSubmit),
    // che crea davvero lo storico fisico; questa funzione popola solo i campi.
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

  // Unica mappa titoli per tutte le viste: prima di questo step ne esistevano
  // tre, sparse tra app.js, questo wrapper e lo script inline di index.html,
  // e vinceva sempre l'ultima applicata.
  const VIEW_TITLES = {
    landing: "Home",
    home: "Esercizi",
    detail: "Dettaglio",
    workout: "Allenamento",
    calendar: "Calendario",
    training: "Allenamento",
    progress: "Progressi",
    setup: "Setup allenamento",
    profile: "Profilo"
  };

  const baseShowView = showView;
  showView = function (view) {
    if (!cloudUser && view !== "auth") return showAuth();
    if (view === "auth") return showAuth();
    const target = view === "performance" || view === "history" ? "progress" : view;
    baseShowView(target);
    if (q("screenTitle") && VIEW_TITLES[target]) q("screenTitle").textContent = VIEW_TITLES[target];
    if (target === "calendar") {
      renderCalendar();
      // Le partite arrivano async (fetch + cache in calendar-keepers.js). Il
      // primo render di una sessione può quindi non avere ancora i badge/la
      // card rapporto: un solo re-render mirato quando i dati arrivano, non
      // un polling — se sono già in cache la promise si risolve subito e
      // questo è comunque un solo render extra, non un ciclo.
      window.gkCalendarExtras?.ensureMatchesLoaded?.()?.then(() => {
        if (q("calendarView")?.classList.contains("active")) renderCalendar();
      });
    }
    if (target === "progress") {
      // Il form dei test fisici (campi + valori correnti) è responsabilità di
      // questo file, perché ha bisogno di cloudProfile.keepers. Storico,
      // grafico e submit sono responsabilità di calendar-keepers.js — vedi
      // window.gkCalendarExtras.ensurePhysicalProgressUi.
      renderPerformanceForm();
      window.gkCalendarExtras?.ensurePhysicalProgressUi?.();
    }
    if (target === "home") { renderProfileSummary(); renderExercises(); }
    if (target === "training") renderTrainingView();
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
    // Il timer conta in avanti: la durata pianificata (durationMin) viene
    // sostituita col tempo realmente trascorso, arrotondato per eccesso al
    // minuto, PRIMA di azzerare lo stato del timer.
    const actualSeconds = timerState.elapsed;
    selectedExercise = { ...selectedExercise, durationMin: Math.max(1, Math.ceil(actualSeconds / 60)), actualSeconds };
    resetTimerState();
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
    localStorage.removeItem("gk_profile");
    localStorage.removeItem("gk_history");
    q("keepersCount")?.addEventListener("change", renderKeeperFields);
    q("setupForm")?.addEventListener("submit", saveCloudProfile, true);
    q("authForm")?.addEventListener("submit", (e) => { e.preventDefault(); login(); });
    q("loginBtn")?.addEventListener("click", login);
    q("signupBtn")?.addEventListener("click", signup);
    q("logoutBtn")?.addEventListener("click", logout);
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
    q("homeTopBtn")?.addEventListener("click", () => showView("landing"));
    q("trainingResetFilterBtn")?.addEventListener("click", () => {
      localStorage.removeItem(TRAINING_FILTER_KEY);
      const input = q("trainingDateFilter");
      if (input) input.value = "";
      renderTrainingView();
    });
    document.addEventListener("click", (event) => {
      const quick = event.target.closest?.("[data-quick-go]");
      if (quick) { showView(quick.dataset.quickGo); return; }
      const start = event.target.closest?.("[data-training-start]");
      if (start) { startTrainingExercise(start.dataset.planDate, Number(start.dataset.planIndex)); return; }
      const open = event.target.closest?.("[data-training-open-date]");
      if (open) { localStorage.setItem(TRAINING_FILTER_KEY, open.dataset.trainingOpenDate); renderTrainingView(); }
    });
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (target.matches?.("[data-training-done]")) { updateTrainingItem(target.dataset.planDate, Number(target.dataset.planIndex), { done: target.checked }, { immediate: true }); return; }
      if (target.matches?.("#trainingDateFilter")) {
        if (target.value) localStorage.setItem(TRAINING_FILTER_KEY, target.value);
        else localStorage.removeItem(TRAINING_FILTER_KEY);
        renderTrainingView();
      }
    });
    document.addEventListener("input", (event) => {
      if (event.target.matches?.("[data-training-note]")) updateTrainingItem(event.target.dataset.planDate, Number(event.target.dataset.planIndex), { note: event.target.value }, { immediate: false });
    });
    await loadData(true);
  });
})();
