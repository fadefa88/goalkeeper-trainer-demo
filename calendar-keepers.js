(() => {
  const $ = (id) => document.getElementById(id);
  const txt = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const num = (v) => v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
  const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateLabel = (key) => {
    const p = String(key || "").split("-").map(Number);
    return p.length === 3 ? new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : (key || "—");
  };
  const profile = () => {
    try { return typeof getProfile === "function" ? getProfile() : null; } catch { return null; }
  };
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
    if (!response.ok) throw new Error(data?.error || `Errore ${response.status}`);
    return data;
  }
  async function rawProfile() {
    const res = await api("/api/profile");
    return res?.profile || {};
  }

  function ensureSharedStyles() {
    if ($("gkCombinedPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "gkCombinedPatchStyles";
    style.textContent = `
      .landing-card{display:grid;gap:18px;padding:20px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(180deg,rgba(7,17,11,.96),rgba(3,9,6,.98));box-shadow:var(--shadow);overflow:hidden}
      .landing-copy{display:grid;gap:8px}.landing-copy h2{font-size:30px;line-height:1.02;margin:0;letter-spacing:-.04em}
      .landing-hero{position:relative;min-height:365px;border-radius:26px;overflow:hidden;border:1px solid rgba(213,255,222,.14);background:linear-gradient(180deg,rgba(7,17,11,.05),rgba(7,17,11,.78)),url('/gk-home-hero.png') center/cover no-repeat;box-shadow:inset 0 -90px 120px rgba(0,0,0,.50)}
      .landing-hero:after{content:"";position:absolute;left:0;right:0;bottom:0;height:44%;background:linear-gradient(180deg,transparent,rgba(3,9,6,.78));pointer-events:none}
      .landing-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.landing-stat{padding:12px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid var(--line)}
      .landing-stat span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:900}.landing-stat strong{display:block;margin-top:4px;font-size:18px;color:var(--text)}
      .landing-actions{display:grid;grid-template-columns:1fr;gap:10px}.topbar .eyebrow,#screenTitle{cursor:pointer}
      .keeper-attendance-card{display:grid;gap:12px;padding:14px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.045);margin-top:2px}.keeper-attendance-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.keeper-attendance-head h3{margin:0;font-size:16px}.keeper-attendance-list{display:grid;gap:8px}.keeper-attendance-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:15px;border:1px solid var(--line);background:rgba(7,17,11,.60)}.keeper-attendance-row span{font-weight:850;color:var(--text)}.keeper-attendance-row small{display:block;margin-top:2px;color:var(--muted);font-size:11px;font-weight:600}.keeper-attendance-row input{width:22px;height:22px;accent-color:var(--green)}.keeper-attendance-summary{color:var(--muted);font-size:12px;line-height:1.35}
      .physical-save-meta{margin-bottom:12px}.physical-save-meta label{display:grid;gap:7px}.physical-progress-card{margin-top:14px}.physical-chart-controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.physical-chart-box{margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.035)}.physical-chart-svg{width:100%;height:auto;display:block;overflow:visible}.physical-chart-line{fill:none;stroke:var(--green);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.physical-chart-dot{fill:var(--green);stroke:#07110b;stroke-width:3}.physical-history-list{display:grid;gap:9px;margin-top:14px}.physical-history-item{padding:11px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.035)}.physical-history-item h4{margin:0 0 6px;font-size:14px}.physical-history-item p{margin:0;color:var(--muted);font-size:12px;line-height:1.4}
      @media(max-width:390px){.landing-card{padding:16px}.landing-copy h2{font-size:26px}.landing-hero{min-height:315px}.landing-stats,.physical-chart-controls{grid-template-columns:1fr}.landing-stat{padding:11px}.keeper-attendance-head{display:grid}.keeper-attendance-row{align-items:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function ensureLanding() {
    if ($("landingView")) return;
    const main = document.querySelector("main"), home = $("homeView");
    if (!main) return;
    const landing = document.createElement("section");
    landing.id = "landingView";
    landing.className = "view";
    landing.innerHTML = `<div class="landing-card"><div class="landing-copy"><p class="eyebrow">GK Trainer</p><h2>Portieri pronti, seduta sotto controllo.</h2><p class="muted">Organizza esercizi, calendario e progressi da un punto unico. La barra sotto resta sempre disponibile.</p></div><div class="landing-hero" role="img" aria-label="Guanti da portiere"></div><div class="landing-stats"><div class="landing-stat"><span>Area</span><strong>Esercizi</strong></div><div class="landing-stat"><span>Piano</span><strong>Calendario</strong></div><div class="landing-stat"><span>Lettura</span><strong>Progressi</strong></div></div><div class="landing-actions"><button id="goExercisesBtn" class="primary-btn full" type="button">Vai agli esercizi</button></div></div>`;
    main.insertBefore(landing, home || main.firstChild);
    $("goExercisesBtn")?.addEventListener("click", () => { autoLandingPending = false; showView("home"); });
  }
  let autoLandingPending = true;
  function hookLanding() {
    if (typeof showView !== "function" || showView.__gkCombinedLandingHook) return;
    const old = showView;
    showView = function(view) {
      ensureLanding();
      if (view === "home" && autoLandingPending) {
        autoLandingPending = false;
        return old("landing");
      }
      const result = old.apply(this, arguments);
      scheduleAll();
      return result;
    };
    showView.__gkCombinedLandingHook = true;
  }

  const ATTENDANCE_KEY = "gk_keeper_attendance_v2";
  const keeperKey = (k, i) => String(k?.id || k?.name || `keeper-${i}`);
  const attendanceMap = () => { try { return JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || "{}"); } catch { return {}; } };
  const saveAttendanceMap = (map) => localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(map));
  function selectedCalendarDate() {
    return document.querySelector(".calendar-day.selected[data-date]")?.dataset?.date || today();
  }
  function renderKeeperAttendance() {
    const view = $("calendarView");
    if (!view?.classList.contains("active")) return;
    const box = $("selectedDateSessions"), planner = box?.querySelector(".planner-card") || box;
    if (!planner) return;
    const keepers = profile()?.keepers || [];
    const date = selectedCalendarDate();
    const old = planner.querySelector(".keeper-attendance-card");
    if (old) old.remove();
    const map = attendanceMap();
    const present = Array.isArray(map[date]) ? map[date].map(String) : keepers.map(keeperKey);
    const card = document.createElement("div");
    card.className = "keeper-attendance-card";
    card.innerHTML = `<div class="keeper-attendance-head"><div><p class="eyebrow">Presenze</p><h3>Portieri presenti</h3></div><span class="pill">${keepers.length} in rosa</span></div>${keepers.length ? `<div class="keeper-attendance-list">${keepers.map((k, i) => {
      const key = keeperKey(k, i), checked = present.includes(key) ? " checked" : "", sub = [k.height ? `${k.height} cm` : "", k.weight ? `${k.weight} kg` : ""].filter(Boolean).join(" · ");
      return `<label class="keeper-attendance-row"><div><span>${txt(k.name || `Portiere ${i + 1}`)}</span>${sub ? `<small>${txt(sub)}</small>` : ""}</div><input class="keeper-attendance-check" type="checkbox" value="${txt(key)}"${checked} /></label>`;
    }).join("")}</div>` : `<div class="planner-empty">Configura prima i portieri nel profilo.</div>`}<div class="keeper-attendance-summary"></div>`;
    const grid = planner.querySelector(".planner-grid");
    if (grid) grid.insertAdjacentElement("afterend", card); else planner.prepend(card);
    const summary = () => {
      const checked = Array.from(card.querySelectorAll(".keeper-attendance-check:checked")).map((i) => String(i.value));
      const names = keepers.filter((k, i) => checked.includes(keeperKey(k, i))).map((k, i) => k.name || `Portiere ${i + 1}`);
      card.querySelector(".keeper-attendance-summary").textContent = names.length ? `${names.length} presenti: ${names.join(", ")}` : "Nessun portiere selezionato per questa giornata.";
    };
    card.querySelectorAll(".keeper-attendance-check").forEach((input) => input.addEventListener("change", () => {
      const next = attendanceMap();
      next[date] = Array.from(card.querySelectorAll(".keeper-attendance-check:checked")).map((i) => String(i.value));
      saveAttendanceMap(next);
      summary();
    }));
    summary();
  }

  const metrics = [
    { key: "broadJump", label: "Balzo da fermo", suffix: " cm", better: "higher" },
    { key: "verticalJump", label: "Balzo in alto", suffix: " cm", better: "higher" },
    { key: "halfHeightJump", label: "Balzo mezza altezza", suffix: " cm", better: "higher" },
    { key: "twoPostsTest", label: "Test due pali", suffix: " s", better: "lower" }
  ];
  function cleanProgressCards() {
    const progress = $("progressView");
    if (!progress) return null;
    Array.from(progress.querySelectorAll(".progress-card")).forEach((card) => {
      if (card.querySelector("#performanceForm") || card.id === "physicalProgressHistoryCard") return;
      if (card.querySelector("#progressKpis") || card.querySelector("#monthlyChart") || card.querySelector("#keeperMeasures") || card.querySelector("#exerciseQualityList") || card.querySelector("#historyList")) card.remove();
    });
    const form = $("performanceForm"), formCard = form?.closest(".progress-card");
    if (formCard) {
      formCard.querySelector(".eyebrow") && (formCard.querySelector(".eyebrow").textContent = "Parte fisica");
      formCard.querySelector("h2") && (formCard.querySelector("h2").textContent = "Motore del portiere");
      formCard.querySelector(".muted") && (formCard.querySelector(".muted").textContent = "Inserisci data e misure: ogni salvataggio crea uno storico confrontabile nel tempo.");
    }
    return formCard;
  }
  function ensureDateInput() {
    const form = $("performanceForm"), fields = $("performanceFields");
    if (!form || !fields || $("physicalSaveDate")) return;
    const meta = document.createElement("div");
    meta.className = "measure-card physical-save-meta";
    meta.innerHTML = `<label>Data salvataggio misure<input id="physicalSaveDate" type="date" value="${today()}" /></label><p id="physicalSaveStatus" class="muted small-note">Ogni salvataggio viene conservato nello storico fisico.</p>`;
    form.insertBefore(meta, fields);
  }
  function ensureGraphCard(formCard) {
    if (!formCard || $("physicalProgressHistoryCard")) return;
    const card = document.createElement("div");
    card.id = "physicalProgressHistoryCard";
    card.className = "progress-card physical-progress-card";
    card.innerHTML = `<p class="eyebrow">Miglioramenti fisici</p><h2>Andamento misure</h2><p class="muted">Grafico basato sui salvataggi fisici registrati durante l’anno.</p><div class="physical-chart-controls"><label>Portiere<select id="physicalChartKeeper"></select></label><label>Misura<select id="physicalChartMetric"></select></label></div><div id="physicalChartBox" class="physical-chart-box"></div><div id="physicalHistoryList" class="physical-history-list"></div>`;
    formCard.insertAdjacentElement("afterend", card);
    $("physicalChartKeeper")?.addEventListener("change", renderPhysicalHistory);
    $("physicalChartMetric")?.addEventListener("change", renderPhysicalHistory);
  }
  function snapshotRows(p) {
    return (p.keepers || []).map((k, i) => ({ id: k.id || null, key: keeperKey(k, i), name: k.name || `Portiere ${i + 1}`, broadJump: num(k.broadJump), verticalJump: num(k.verticalJump), halfHeightJump: num(k.halfHeightJump), twoPostsTest: num(k.twoPostsTest) }));
  }
  function keepersFromForm(p) {
    const rows = Array.from(document.querySelectorAll(".performance-row"));
    return (p.keepers || []).map((k, i) => {
      const row = rows.find((r) => Number(r.dataset.index) === i);
      if (!row) return k;
      const read = (sel) => num(row.querySelector(sel)?.value);
      return { ...k, broadJump: read(".perf-broad-jump"), verticalJump: read(".perf-vertical-jump"), halfHeightJump: read(".perf-half-height-jump"), twoPostsTest: read(".perf-two-posts-test") };
    });
  }
  function valueFor(snapshot, keeper, metric) {
    const row = (snapshot.keepers || []).find((k) => String(k.key || k.id || k.name) === String(keeper) || String(k.id || "") === String(keeper) || String(k.name || "") === String(keeper));
    return num(row?.[metric]);
  }
  function draw(points, metric) {
    if (points.length < 2) return `<div class="no-data">Servono almeno due salvataggi con questa misura per vedere il trend.</div>`;
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const w = 320, h = 170, l = 34, r = 12, t = 18, b = 34, iw = w - l - r, ih = h - t - b;
    const coords = points.map((p, i) => ({ x: l + iw * i / (points.length - 1), y: t + ih - ((p.value - min) / (max - min)) * ih, p }));
    const delta = points.at(-1).value - points[0].value;
    const good = metric.better === "lower" ? delta < 0 : delta > 0;
    const deltaText = `${delta > 0 ? "+" : ""}${Number(delta.toFixed(2))}${metric.suffix}`;
    return `<div class="quality-top"><div><p class="eyebrow">Delta periodo</p><h3>${txt(deltaText)}</h3><p class="muted small-note">${good ? "Miglioramento rispetto al primo salvataggio." : delta === 0 ? "Stabile rispetto al primo salvataggio." : "Peggioramento rispetto al primo salvataggio."}</p></div><div class="quality-score">${points.length}</div></div><svg class="physical-chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Grafico miglioramenti fisici"><line x1="${l}" y1="${h - b}" x2="${w - r}" y2="${h - b}" stroke="rgba(255,255,255,.18)"/><line x1="${l}" y1="${t}" x2="${l}" y2="${h - b}" stroke="rgba(255,255,255,.18)"/><polyline class="physical-chart-line" points="${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")}"/>${coords.map((c) => `<circle class="physical-chart-dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5"><title>${txt(dateLabel(c.p.date) + ": " + c.p.value + metric.suffix)}</title></circle>`).join("")}<text x="${l}" y="${h - 9}" fill="rgba(255,255,255,.58)" font-size="10">${txt(dateLabel(points[0].date))}</text><text x="${w - r}" y="${h - 9}" fill="rgba(255,255,255,.58)" font-size="10" text-anchor="end">${txt(dateLabel(points.at(-1).date))}</text><text x="8" y="${t + 4}" fill="rgba(255,255,255,.58)" font-size="10">${txt(max.toFixed(1) + metric.suffix)}</text><text x="8" y="${h - b}" fill="rgba(255,255,255,.58)" font-size="10">${txt(min.toFixed(1) + metric.suffix)}</text></svg>`;
  }
  async function renderPhysicalHistory() {
    if (!$("progressView")?.classList.contains("active")) return;
    const card = cleanProgressCards();
    ensureDateInput();
    ensureGraphCard(card);
    const keeperSel = $("physicalChartKeeper"), metricSel = $("physicalChartMetric"), chart = $("physicalChartBox"), list = $("physicalHistoryList");
    if (!keeperSel || !metricSel || !chart || !list) return;
    let p = {};
    try { p = await rawProfile(); } catch {}
    const snapshots = Array.isArray(p.performanceSnapshots) ? p.performanceSnapshots.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))) : [];
    const keeperOptions = (p.keepers || []).map((k, i) => ({ key: keeperKey(k, i), name: k.name || `Portiere ${i + 1}` }));
    if (!keeperOptions.length && snapshots[0]?.keepers) snapshots[0].keepers.forEach((k, i) => keeperOptions.push({ key: String(k.key || k.id || k.name || `keeper-${i}`), name: k.name || `Portiere ${i + 1}` }));
    const oldKeeper = keeperSel.value, oldMetric = metricSel.value || "broadJump";
    keeperSel.innerHTML = keeperOptions.length ? keeperOptions.map((k) => `<option value="${txt(k.key)}">${txt(k.name)}</option>`).join("") : `<option value="">Nessun portiere</option>`;
    if (oldKeeper && Array.from(keeperSel.options).some((o) => o.value === oldKeeper)) keeperSel.value = oldKeeper;
    metricSel.innerHTML = metrics.map((m) => `<option value="${m.key}">${m.label}</option>`).join("");
    metricSel.value = metrics.some((m) => m.key === oldMetric) ? oldMetric : "broadJump";
    const metric = metrics.find((m) => m.key === metricSel.value) || metrics[0];
    const points = snapshots.map((s) => ({ date: s.date, value: valueFor(s, keeperSel.value, metric.key) })).filter((p) => Number.isFinite(p.value));
    chart.innerHTML = draw(points, metric);
    list.innerHTML = snapshots.length ? snapshots.slice(-6).reverse().map((s) => {
      const count = (s.keepers || []).reduce((sum, k) => sum + metrics.filter((m) => Number.isFinite(num(k[m.key]))).length, 0);
      return `<div class="physical-history-item"><h4>${txt(dateLabel(s.date))}</h4><p>${(s.keepers || []).length} portieri · ${count} misure salvate</p></div>`;
    }).join("") : `<div class="no-data">Nessun salvataggio fisico. Imposta la data e premi “Salva test fisici” per creare il primo punto storico.</div>`;
  }
  async function savePhysical(event) {
    if (event.target?.id !== "performanceForm") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const status = $("physicalSaveStatus");
    if (status) status.textContent = "Salvataggio misure in corso...";
    try {
      const p = await rawProfile();
      const date = $("physicalSaveDate")?.value || today();
      const updated = { ...p, keepers: keepersFromForm(p) };
      const snapshots = Array.isArray(p.performanceSnapshots) ? p.performanceSnapshots.slice() : [];
      snapshots.push({ id: String(Date.now()), date, createdAt: new Date().toISOString(), keepers: snapshotRows(updated) });
      updated.performanceSnapshots = snapshots.slice(-100);
      await api("/api/profile", { method: "PUT", body: { profile: updated } });
      if (status) status.textContent = `Misure salvate per il ${dateLabel(date)}.`;
      await renderPhysicalHistory();
    } catch (e) {
      if (status) status.textContent = `Errore salvataggio: ${e.message}`;
    }
  }

  function scheduleAll() {
    [0, 120, 450, 1000].forEach((d) => setTimeout(() => { renderKeeperAttendance(); renderPhysicalHistory(); }, d));
  }
  function boot() {
    ensureSharedStyles();
    ensureLanding();
    hookLanding();
    document.querySelector(".topbar .eyebrow")?.addEventListener("click", () => showView("landing"));
    $("screenTitle")?.addEventListener("click", () => showView("landing"));
    document.addEventListener("submit", savePhysical, true);
    document.addEventListener("click", (event) => {
      if (event.target.closest(".calendar-day[data-date]") || event.target.closest("#prevMonthBtn") || event.target.closest("#nextMonthBtn") || event.target.closest("[data-tab='calendar']") || event.target.closest("[data-tab='progress']")) scheduleAll();
    });
    new MutationObserver(scheduleAll).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    scheduleAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
