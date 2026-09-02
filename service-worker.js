const CACHE_NAME = "gk-trainer-account-training-v1";
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

const HTML_COMPAT_PATCH = String.raw`
<style id="gkAccountTrainingStyleV1">
  body:has(#landingView.active) #bottomNav,
  body:has(#landingView.active) #bottomNav.hidden { display:grid!important; }
  .training-card { display:grid!important; gap:14px!important; }
  .training-card > .eyebrow { display:none!important; }
  .training-filter { margin:10px 0 2px!important; }
  .training-list { display:grid!important; gap:11px!important; margin-top:10px!important; }
  .training-session-meta { display:grid; gap:5px; padding:12px 0 4px; border:0; background:transparent; }
  .training-session-meta h3 { margin:0; font-size:20px; letter-spacing:-.04em; }
  .training-session-meta p { margin:0; }
  .training-item { position:relative; display:grid!important; gap:11px!important; padding:14px!important; border-radius:20px!important; border:1px solid var(--line)!important; background:rgba(255,255,255,.045)!important; box-shadow:none!important; }
  .training-item.is-done { opacity:.72; }
  .training-item.is-done h4 { text-decoration:line-through; text-decoration-thickness:2px; text-decoration-color:rgba(32,224,108,.72); }
  .training-item-top { display:grid!important; grid-template-columns:minmax(0,1fr) auto!important; gap:10px!important; align-items:start!important; }
  .training-item h4 { margin:0; font-size:17px; line-height:1.18; }
  .training-item-actions { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .training-done { display:flex!important; grid-template-columns:none!important; align-items:center; gap:9px; color:var(--text); font-size:13px; font-weight:900; }
  .training-done input { width:22px!important; height:22px!important; min-height:22px!important; accent-color:var(--green); padding:0!important; }
  .training-item textarea { min-height:52px!important; max-height:96px!important; resize:vertical; }
  @media(max-width:430px){ .training-item-top,.training-item-actions{grid-template-columns:1fr!important;display:grid!important}.training-item-actions .primary-btn{width:100%}.training-done{justify-content:flex-start}.training-filter{grid-template-columns:1fr!important} }
</style>
<script id="gkAccountTrainingV1">
(() => {
  if (window.__gkAccountTrainingV1) return;
  window.__gkAccountTrainingV1 = true;

  const FILTER_KEY = "gk_training_filter_date";
  const SYNC_STATUS_ID = "trainingCloudStatus";
  const $ = (id) => document.getElementById(id);
  const norm = (value) => String(value || "").trim().toLowerCase();
  const esc = (value) => String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", "\"":"&quot;" }[char]));
  const todayKey = (date = new Date()) => String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  const parseDate = (key) => { const parts = String(key || todayKey()).split("-").map(Number); return new Date(parts[0] || 2000, (parts[1] || 1) - 1, parts[2] || 1); };
  const shortDate = (key) => parseDate(key).toLocaleDateString("it-IT", { day:"2-digit", month:"short", year:"numeric" });
  const longDate = (key) => parseDate(key).toLocaleDateString("it-IT", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });

  async function api(path, options = {}) {
    const init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, init);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text || "Risposta non valida" }; }
    if (!response.ok) throw new Error(data?.error || "Errore " + response.status);
    return data;
  }

  function planKeys() {
    return Object.keys(localStorage).filter((key) => key.startsWith("gk_day_plans_"));
  }

  function readKey(key) {
    try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
  }

  function writeKey(key, plans) {
    localStorage.setItem(key, JSON.stringify(plans || {}));
  }

  async function accountPlanKey() {
    try {
      const me = await api("/api/me");
      const user = me?.user || {};
      return "gk_day_plans_" + String(user.email || user.id || "local");
    } catch {
      return planKeys()[0] || "gk_day_plans_local";
    }
  }

  function readAllLocalPlans() {
    const merged = {};
    planKeys().forEach((key) => Object.assign(merged, readKey(key)));
    return merged;
  }

  function cleanPlans(plans) {
    const out = {};
    Object.entries(plans || {}).forEach(([date, plan]) => {
      const items = Array.isArray(plan?.items) ? plan.items.filter(Boolean) : [];
      if (!items.length) return;
      out[date] = {
        ...plan,
        time: plan.time || "18:00",
        totalMinutes: Number(plan.totalMinutes || 60),
        items
      };
    });
    return out;
  }

  async function rawProfile() {
    const result = await api("/api/profile");
    return result?.profile || {};
  }

  function setStatus(text) {
    const el = $(SYNC_STATUS_ID);
    if (el) el.textContent = text || "";
  }

  let syncTimer = null;
  async function persistPlansToAccount(plans, quiet = true) {
    try {
      const profile = await rawProfile();
      const nextPlans = cleanPlans(plans);
      const nextProfile = { ...profile, trainingPlans: nextPlans, training_plans: nextPlans };
      await api("/api/profile", { method: "PUT", body: { profile: nextProfile } });
      if (!quiet) setStatus("Allenamento salvato sul tuo account.");
      return true;
    } catch (error) {
      if (!quiet) setStatus("Salvato sul dispositivo, ma non sul cloud: " + error.message);
      return false;
    }
  }

  function queueAccountSync(plans) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => persistPlansToAccount(plans, true), 600);
  }

  async function hydratePlansFromAccount() {
    if (window.__gkPlansHydrating) return window.__gkPlansHydrating;
    window.__gkPlansHydrating = (async () => {
      try {
        const key = await accountPlanKey();
        const profile = await rawProfile();
        const cloudPlans = cleanPlans(profile.trainingPlans || profile.training_plans || profile.dayPlans || {});
        const localPlans = cleanPlans(readAllLocalPlans());
        const merged = cleanPlans({ ...cloudPlans, ...localPlans });
        writeKey(key, merged);
        window.__gkAccountPlanKey = key;
        if (Object.keys(localPlans).length && JSON.stringify(merged) !== JSON.stringify(cloudPlans)) queueAccountSync(merged);
        renderTrainingSection();
        return merged;
      } catch {
        return readAllLocalPlans();
      } finally {
        window.__gkPlansHydrating = null;
      }
    })();
    return window.__gkPlansHydrating;
  }

  function writeMergedPlans(plans) {
    const key = window.__gkAccountPlanKey || planKeys()[0] || "gk_day_plans_local";
    const next = cleanPlans(plans);
    writeKey(key, next);
    queueAccountSync(next);
    return next;
  }

  function exerciseByIdSafe(id) {
    try {
      if (typeof exerciseById === "function") return exerciseById(id);
      if (Array.isArray(exercises)) return exercises.find((item) => item.id === id) || null;
    } catch {}
    return null;
  }

  function savedRows() {
    const plans = cleanPlans(readAllLocalPlans());
    return Object.entries(plans).map(([date, plan]) => ({ date, plan })).sort((a, b) => a.date.localeCompare(b.date));
  }

  function nearestRow(rows) {
    if (!rows.length) return null;
    const today = todayKey();
    return rows.find((row) => row.date >= today) || rows[rows.length - 1];
  }

  function rowsForTraining() {
    const rows = savedRows();
    const filter = localStorage.getItem(FILTER_KEY) || "";
    if (filter) return rows.filter((row) => row.date === filter);
    const next = nearestRow(rows);
    return next ? [next] : [];
  }

  function ensureTrainingStatus() {
    const filter = $("trainingDateFilter")?.closest(".training-filter");
    if (!filter || $(SYNC_STATUS_ID)) return;
    const p = document.createElement("p");
    p.id = SYNC_STATUS_ID;
    p.className = "muted small-note";
    p.textContent = "Le sedute salvate vengono collegate al tuo account.";
    filter.insertAdjacentElement("afterend", p);
  }

  function renderTrainingSection() {
    const view = $("trainingView");
    const title = $("trainingTitle");
    const subtitle = $("trainingSubtitle");
    const list = $("trainingList");
    const filterInput = $("trainingDateFilter");
    const reset = $("trainingResetFilterBtn");
    if (!view || !title || !subtitle || !list) return;

    ensureTrainingStatus();
    const filter = localStorage.getItem(FILTER_KEY) || "";
    if (filterInput && filterInput.value !== filter) filterInput.value = filter;

    const rows = rowsForTraining();
    const allRows = savedRows();
    if (!rows.length) {
      if (filter && allRows.length) {
        title.textContent = "Allenamento · " + shortDate(filter);
        subtitle.textContent = "Nessuna seduta salvata per la data selezionata.";
        list.innerHTML = '<div class="training-empty"><strong>Nessun allenamento in questa data.</strong><span>Scegli un’altra data oppure torna alla prossima seduta disponibile.</span><button id="goNextTraining" class="primary-btn full" type="button">Mostra prossimo allenamento</button></div>';
        $("goNextTraining")?.addEventListener("click", () => { localStorage.removeItem(FILTER_KEY); renderTrainingSection(); });
        return;
      }
      title.textContent = "Nessun allenamento salvato";
      subtitle.textContent = "Prepara una seduta dal calendario, aggiungi esercizi e premi Salva allenamento.";
      list.innerHTML = '<div class="training-empty"><strong>Aggiungi gli esercizi per il prossimo allenamento.</strong><span>Vai nel calendario, scegli il giorno e salva la seduta. Dopo la reinstallazione resterà collegata al tuo account.</span><button id="goCalendarFromTraining" class="primary-btn full" type="button">Vai al calendario</button></div>';
      $("goCalendarFromTraining")?.addEventListener("click", () => { if (typeof showView === "function") showView("calendar"); });
      return;
    }

    const row = rows[0];
    const total = row.plan.items.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    const done = row.plan.items.filter((item) => item.done).length;
    title.textContent = filter ? "Allenamento · " + shortDate(row.date) : "Prossimo allenamento · " + shortDate(row.date);
    subtitle.textContent = filter ? "Seduta salvata per la data selezionata." : "Di default vedi la prossima seduta rispetto a oggi. Usa il filtro per aprire un’altra data.";

    const meta = '<div class="training-session-meta"><h3>' + esc(longDate(row.date)) + '</h3><p class="muted">' + esc(row.plan.time || "orario non impostato") + ' · ' + row.plan.items.length + ' esercizi · ' + total + '\' programmati · ' + done + '/' + row.plan.items.length + ' fatti</p></div>';
    const cards = row.plan.items.map((item, index) => {
      const ex = exerciseByIdSafe(item.exerciseId);
      const name = ex?.name || "Esercizio";
      const ambito = ex?.ambito || "Esercizio";
      const minutes = Number(item.minutes || ex?.durationMin || 0);
      const checked = item.done ? " checked" : "";
      const doneClass = item.done ? " is-done" : "";
      return '<div class="training-item' + doneClass + '"><div class="training-item-top"><div><p class="eyebrow">' + esc(ambito) + ' · ' + minutes + '\'</p><h4>' + esc(name) + '</h4></div><button class="primary-btn" type="button" data-account-training-start="1" data-plan-date="' + esc(row.date) + '" data-plan-index="' + index + '">Avvia</button></div><div class="training-item-actions"><label class="training-done"><input type="checkbox" data-training-done="1" data-plan-date="' + esc(row.date) + '" data-plan-index="' + index + '"' + checked + ' /> Fatto</label></div><label class="small-note">Note esercizio<textarea data-training-note="1" data-plan-date="' + esc(row.date) + '" data-plan-index="' + index + '" placeholder="Note operative, varianti, focus tecnico...">' + esc(item.note || "") + '</textarea></label></div>';
    }).join("");
    list.innerHTML = meta + cards;

    if (filterInput && filterInput.dataset.gkAccountBound !== "1") {
      filterInput.dataset.gkAccountBound = "1";
      filterInput.addEventListener("change", () => {
        if (filterInput.value) localStorage.setItem(FILTER_KEY, filterInput.value);
        else localStorage.removeItem(FILTER_KEY);
        renderTrainingSection();
      });
    }
    if (reset && reset.dataset.gkAccountBound !== "1") {
      reset.dataset.gkAccountBound = "1";
      reset.addEventListener("click", () => {
        localStorage.removeItem(FILTER_KEY);
        if (filterInput) filterInput.value = "";
        renderTrainingSection();
      });
    }
  }

  function updatePlanItem(date, index, patch) {
    const plans = cleanPlans(readAllLocalPlans());
    const item = plans?.[date]?.items?.[index];
    if (!item) return;
    Object.assign(item, patch);
    plans[date].savedAt = plans[date].savedAt || new Date().toISOString();
    writeMergedPlans(plans);
    renderTrainingSection();
  }

  function selectedCalendarDate() {
    return document.querySelector(".calendar-day.selected[data-date]")?.dataset?.date || todayKey();
  }

  function syncAfterCalendarSave() {
    setStatus("Salvataggio sul tuo account...");
    setTimeout(async () => {
      const plans = cleanPlans(readAllLocalPlans());
      const date = selectedCalendarDate();
      if (plans[date]) plans[date].savedAt = plans[date].savedAt || new Date().toISOString();
      const key = window.__gkAccountPlanKey || await accountPlanKey();
      window.__gkAccountPlanKey = key;
      writeKey(key, plans);
      const ok = await persistPlansToAccount(plans, false);
      if (ok) {
        renderTrainingSection();
        setTimeout(() => setStatus("Le sedute salvate vengono collegate al tuo account."), 1800);
      }
    }, 260);
  }

  function forceBottomNav() {
    const nav = $("bottomNav");
    if (!nav) return;
    nav.classList.remove("hidden");
    nav.hidden = false;
    nav.removeAttribute("hidden");
    nav.style.setProperty("display", "grid", "important");
    nav.style.setProperty("grid-template-columns", "repeat(4,minmax(0,1fr))", "important");
    nav.querySelectorAll('[data-tab="performance"],[data-tab="profile"]').forEach((button) => button.remove());
  }

  function showRealHome() {
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    const landing = $("landingView");
    if (landing) landing.classList.add("active");
    const title = $("screenTitle");
    if (title) title.textContent = "Home";
    document.querySelectorAll("#bottomNav .nav-btn").forEach((btn) => btn.classList.remove("active"));
    forceBottomNav();
    setTimeout(forceBottomNav, 60);
    setTimeout(forceBottomNav, 240);
    setTimeout(forceBottomNav, 700);
  }

  const timerState = { running:false, elapsed:0, interval:null };
  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
  }
  function syncTimerGlobals() {
    try { timeRemaining = timerState.elapsed; } catch {}
    try { running = timerState.running; } catch {}
    try { timer = timerState.interval; } catch {}
  }
  function paintTimer() {
    const display = $("timerDisplay");
    if (display) display.textContent = formatTime(timerState.elapsed);
    const phase = $("phaseLabel");
    if (phase) phase.textContent = timerState.running ? "Timer attivo" : timerState.elapsed ? "In pausa" : "Pronto";
    const start = $("startPauseBtn");
    if (start) start.textContent = timerState.running ? "Pausa" : "Start";
    syncTimerGlobals();
  }
  function resetTimer() {
    if (timerState.interval) clearInterval(timerState.interval);
    timerState.interval = null;
    timerState.elapsed = 0;
    timerState.running = false;
    paintTimer();
  }
  function toggleTrueTimer() {
    if (timerState.running) {
      timerState.running = false;
      if (timerState.interval) clearInterval(timerState.interval);
      timerState.interval = null;
      paintTimer();
      return;
    }
    timerState.running = true;
    if (!timerState.interval) {
      timerState.interval = setInterval(() => {
        if (!timerState.running) return;
        timerState.elapsed += 1;
        paintTimer();
      }, 1000);
    }
    paintTimer();
  }
  function bindTimerButtons() {
    const start = $("startPauseBtn");
    if (start && start.dataset.gkTrueTimer !== "account-v1") {
      const next = start.cloneNode(true);
      next.dataset.gkTrueTimer = "account-v1";
      start.replaceWith(next);
      next.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        toggleTrueTimer();
      }, true);
    }
    const finish = $("finishBtn");
    if (finish && finish.dataset.gkTrueTimer !== "account-v1") {
      const next = finish.cloneNode(true);
      next.dataset.gkTrueTimer = "account-v1";
      finish.replaceWith(next);
      next.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        timerState.running = false;
        if (timerState.interval) clearInterval(timerState.interval);
        timerState.interval = null;
        syncTimerGlobals();
        try {
          if (selectedExercise) selectedExercise = { ...selectedExercise, durationMin: Math.max(1, Math.ceil(timerState.elapsed / 60)), actualSeconds: timerState.elapsed };
        } catch {}
        if (typeof finishWorkout === "function") finishWorkout();
        setTimeout(() => { forceBottomNav(); renderTrainingSection(); }, 160);
      }, true);
    }
  }
  function patchTimer() {
    try {
      updateTimer = function() { paintTimer(); };
      if (typeof startWorkoutScreen === "function" && !startWorkoutScreen.__gkAccountTimer) {
        const previous = startWorkoutScreen;
        startWorkoutScreen = function() {
          const result = previous.apply(this, arguments);
          resetTimer();
          bindTimerButtons();
          return result;
        };
        startWorkoutScreen.__gkAccountTimer = true;
      }
      bindTimerButtons();
      paintTimer();
    } catch {}
  }

  function startTrainingExercise(date, index) {
    const plans = cleanPlans(readAllLocalPlans());
    const item = plans?.[date]?.items?.[index];
    const ex = exerciseByIdSafe(item?.exerciseId);
    if (!ex || typeof startWorkoutScreen !== "function") return;
    try { selectedExercise = { ...ex, durationMin: Number(item.minutes || ex.durationMin || 1) }; } catch {}
    startWorkoutScreen();
    const dateInput = $("sessionDateInput");
    if (dateInput) dateInput.value = date;
    resetTimer();
  }

  function patchShowView() {
    if (typeof showView !== "function" || showView.__gkAccountTraining) return;
    const previous = showView;
    showView = function(view) {
      const result = previous.apply(this, arguments);
      forceBottomNav();
      patchTimer();
      if (view === "training") {
        hydratePlansFromAccount().then(renderTrainingSection);
      }
      return result;
    };
    showView.__gkAccountTraining = true;
  }

  function boot() {
    forceBottomNav();
    patchShowView();
    patchTimer();
    hydratePlansFromAccount().then(renderTrainingSection);
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest ? event.target : event.target?.parentElement;
    const home = target?.closest?.("#homeTopBtn");
    if (home) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      showRealHome();
      return;
    }

    const startTraining = target?.closest?.("[data-account-training-start]");
    if (startTraining) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      startTrainingExercise(startTraining.dataset.planDate, Number(startTraining.dataset.planIndex));
      return;
    }

    if (target?.closest?.("#saveCalendarPlanBtn")) syncAfterCalendarSave();
    if (target?.closest?.("[data-tab='training'],[data-tab=\"training\"]")) setTimeout(() => hydratePlansFromAccount().then(renderTrainingSection), 120);
    if (target?.closest?.("#clearPlanBtn,[data-plan-remove],#addPlanExerciseBtn,#autoPlanBtn,.calendar-day[data-date],#prevMonthBtn,#nextMonthBtn")) setTimeout(() => { forceBottomNav(); renderTrainingSection(); }, 350);
  }, true);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target?.matches?.("#trainingDateFilter")) {
      if (target.value) localStorage.setItem(FILTER_KEY, target.value);
      else localStorage.removeItem(FILTER_KEY);
      renderTrainingSection();
      return;
    }
    if (target?.matches?.("[data-training-done]")) {
      updatePlanItem(target.dataset.planDate, Number(target.dataset.planIndex), { done: Boolean(target.checked) });
      return;
    }
    if (target?.matches?.("#dayPlanTime,#dayPlanTotal,.plan-item-minutes")) {
      setTimeout(() => queueAccountSync(readAllLocalPlans()), 420);
    }
  }, true);

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target?.matches?.("[data-training-note]")) {
      updatePlanItem(target.dataset.planDate, Number(target.dataset.planIndex), { note: target.value });
    }
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  [80, 250, 800, 1600, 2600].forEach((delay) => setTimeout(boot, delay));
})();
</script>`;

function patchHtml(source) {
  if (source.includes("gkAccountTrainingV1")) return source;
  if (source.includes("</body>")) return source.replace("</body>", `${HTML_COMPAT_PATCH}\n</body>`);
  return `${source}\n${HTML_COMPAT_PATCH}`;
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

  const isHtml = event.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html");
  const isFreshAsset = url.pathname.endsWith("/style.css") || url.pathname.endsWith("/app.js") || url.pathname.endsWith("/cloudflare-client.js") || url.pathname.endsWith("/calendar-keepers.js");

  if (isHtml) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request))
        .then(async response => {
          if (!response) return response;
          const html = await response.text();
          return new Response(patchHtml(html), {
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

  if (isFreshAsset) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
