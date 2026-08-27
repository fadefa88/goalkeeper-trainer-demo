(() => {
  const $ = (id) => document.getElementById(id);
  const txt = (v) => String(v ?? "").replace(/[&<>'\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", "\"": "&quot;" }[c]));
  const num = (v) => v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);
  const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const profile = () => { try { return typeof getProfile === "function" ? getProfile() : null; } catch { return null; } };
  const dateLabel = (key) => {
    const parts = String(key || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return key || "—";
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
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

  function ensureStyles() {
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

      #progressView{padding-bottom:96px}.physical-main-card{display:grid!important;gap:18px!important}.physical-main-card>p.eyebrow,.physical-main-card>h2,.physical-main-card>.muted{margin-left:2px;margin-right:2px}.physical-save-meta{display:grid;gap:12px;margin:2px 0 2px;padding:16px;border-radius:22px;border:1px solid rgba(32,224,108,.20);background:linear-gradient(180deg,rgba(32,224,108,.10),rgba(255,255,255,.035))}.physical-save-meta label{display:grid;gap:8px;font-weight:900}.physical-save-meta input{height:48px;border-radius:16px;font-size:16px}.physical-save-meta .small-note{margin:0;color:var(--muted)}
      .physical-main-card .measure-grid{gap:14px}.physical-main-card .measure-card{padding:15px;border-radius:22px;background:rgba(255,255,255,.045)}.physical-main-card .quality-top{align-items:center}.physical-main-card .quality-score{min-width:58px;border-radius:16px}.physical-main-card .performance-tests{grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.physical-main-card .performance-tests input{min-height:48px;border-radius:16px;padding:12px;font-size:16px}.physical-main-card button[type='submit']{min-height:52px;font-size:16px;border-radius:18px}
      .physical-progress-card{display:grid;gap:16px;margin-top:14px}.physical-progress-card h2{margin-bottom:0}.physical-chart-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px}.physical-chart-controls label{display:grid;gap:8px;font-size:12px}.physical-chart-controls select{height:48px;border-radius:16px;font-size:16px}.physical-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.physical-kpi{padding:13px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.045)}.physical-kpi span{display:block;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase}.physical-kpi strong{display:block;margin-top:5px;font-size:22px;line-height:1.05}.physical-kpi small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.35}
      .physical-chart-box{position:relative;min-height:260px;padding:14px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025));overflow:hidden}.physical-chart-svg{width:100%;height:auto;display:block;overflow:visible}.physical-axis{stroke:rgba(255,255,255,.16);stroke-width:1}.physical-grid{stroke:rgba(255,255,255,.08);stroke-width:1}.physical-chart-line{fill:none;stroke:var(--green);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px rgba(32,224,108,.34))}.physical-chart-fill{fill:rgba(32,224,108,.08)}.physical-chart-dot{fill:var(--green);stroke:#07110b;stroke-width:4}.physical-chart-label{font-size:12px;fill:rgba(239,255,242,.78);font-weight:800}.physical-chart-value{font-size:12px;fill:rgba(239,255,242,.92);font-weight:900}.physical-empty{min-height:210px;display:grid;place-items:center;text-align:center;color:var(--muted);line-height:1.45;padding:18px}
      .physical-history-list{display:grid;gap:10px}.physical-history-item{display:grid;gap:7px;padding:13px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.04)}.physical-history-item h4{margin:0;font-size:15px}.physical-history-item p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}.physical-history-tags{display:flex;flex-wrap:wrap;gap:7px}.physical-history-tags span{border:1px solid var(--line);border-radius:999px;padding:5px 8px;font-size:11px;color:var(--muted);background:rgba(255,255,255,.04)}
      @media(max-width:430px){.landing-card{padding:16px}.landing-copy h2{font-size:26px}.landing-hero{min-height:315px}.landing-stats,.physical-chart-controls,.physical-kpis{grid-template-columns:1fr}.landing-stat{padding:11px}.keeper-attendance-head{display:grid}.keeper-attendance-row{align-items:flex-start}.physical-main-card .performance-tests{grid-template-columns:1fr}.physical-chart-box{min-height:235px;padding:10px}.physical-kpi strong{font-size:20px}}
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
      formCard.classList.add("physical-main-card");
      const eyebrow = formCard.querySelector(".eyebrow"), title = formCard.querySelector("h2"), note = formCard.querySelector(".muted");
      if (eyebrow) eyebrow.textContent = "Parte fisica";
      if (title) title.textContent = "Motore del portiere";
      if (note) note.textContent = "Inserisci la data e aggiorna le misure: ogni salvataggio crea uno storico confrontabile durante l’anno.";
    }
    return formCard;
  }

  function ensureDateInput() {
    const form = $("performanceForm"), fields = $("performanceFields");
    if (!form || !fields || $("physicalSaveDate")) return;
    const meta = document.createElement("div");
    meta.className = "physical-save-meta";
    meta.innerHTML = `<label>Data salvataggio misure<input id="physicalSaveDate" type="date" value="${today()}" /></label><p id="physicalSaveStatus" class="muted small-note">Scegli la data del test. Il salvataggio resta nello storico fisico.</p>`;
    form.insertBefore(meta, fields);
  }

  function ensureGraphCard(formCard) {
    if (!formCard || $("physicalProgressHistoryCard")) return;
    const card = document.createElement("div");
    card.id = "physicalProgressHistoryCard";
    card.className = "progress-card physical-progress-card";
    card.innerHTML = `<p class="eyebrow">Miglioramenti fisici</p><h2>Andamento misure</h2><p class="muted">Grafico basato sui salvataggi fisici registrati durante l’anno.</p><div class="physical-chart-controls"><label>Portiere<select id="physicalChartKeeper"></select></label><label>Misura<select id="physicalChartMetric"></select></label></div><div id="physicalKpis" class="physical-kpis"></div><div id="physicalChartBox" class="physical-chart-box"></div><div id="physicalHistoryList" class="physical-history-list"></div>`;
    formCard.insertAdjacentElement("afterend", card);
    $("physicalChartKeeper")?.addEventListener("change", () => renderPhysicalHistory());
    $("physicalChartMetric")?.addEventListener("change", () => renderPhysicalHistory());
  }

  function normalizedHistory(p) {
    const list = Array.isArray(p?.physicalHistory) ? p.physicalHistory : Array.isArray(p?.physical_history) ? p.physical_history : [];
    return list.filter(Boolean).map((s) => ({ ...s, date: s.date || today(new Date(s.savedAt || Date.now())) }));
  }

  function snapshotRows(p) {
    return (p.keepers || []).map((k, i) => ({
      id: k.id || null,
      key: keeperKey(k, i),
      name: k.name || `Portiere ${i + 1}`,
      broadJump: num(k.broadJump),
      verticalJump: num(k.verticalJump),
      halfHeightJump: num(k.halfHeightJump),
      twoPostsTest: num(k.twoPostsTest)
    }));
  }

  function keepersFromForm(p) {
    const rows = Array.from(document.querySelectorAll(".performance-row"));
    return (p.keepers || []).map((k, i) => {
      const row = rows.find((r) => Number(r.dataset.index) === i);
      if (!row) return k;
      const read = (sel) => num(row.querySelector(sel)?.value);
      return {
        ...k,
        broadJump: read(".perf-broad-jump"),
        verticalJump: read(".perf-vertical-jump"),
        halfHeightJump: read(".perf-half-height-jump"),
        twoPostsTest: read(".perf-two-posts-test")
      };
    });
  }

  function valueFor(snapshot, keeper, metric) {
    const row = (snapshot.keepers || []).find((k) => String(k.key || k.id || k.name) === String(keeper));
    return row ? num(row[metric]) : null;
  }

  function fillSelectors(p) {
    const keeperSelect = $("physicalChartKeeper"), metricSelect = $("physicalChartMetric");
    if (!keeperSelect || !metricSelect) return;
    const keepers = p.keepers || [];
    const oldKeeper = keeperSelect.value;
    const oldMetric = metricSelect.value || "broadJump";
    keeperSelect.innerHTML = keepers.length ? keepers.map((k, i) => `<option value="${txt(keeperKey(k, i))}">${txt(k.name || `Portiere ${i + 1}`)}</option>`).join("") : `<option value="">Nessun portiere</option>`;
    metricSelect.innerHTML = metrics.map((m) => `<option value="${m.key}">${m.label}</option>`).join("");
    if (oldKeeper && Array.from(keeperSelect.options).some((o) => o.value === oldKeeper)) keeperSelect.value = oldKeeper;
    if (oldMetric && Array.from(metricSelect.options).some((o) => o.value === oldMetric)) metricSelect.value = oldMetric;
  }

  function chartSvg(points, metric) {
    if (!points.length) return `<div class="physical-empty">Nessun dato per questa misura. Salva almeno un test fisico.</div>`;
    const width = 360, height = 220, left = 42, right = 18, top = 24, bottom = 42;
    const values = points.map((p) => p.value);
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12;
    min -= pad; max += pad;
    const x = (i) => points.length === 1 ? (left + (width - right)) / 2 : left + i * ((width - left - right) / (points.length - 1));
    const y = (v) => top + (max - v) * ((height - top - bottom) / (max - min));
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
    const area = points.length > 1 ? `${path} L${x(points.length - 1).toFixed(1)} ${height - bottom} L${x(0).toFixed(1)} ${height - bottom} Z` : "";
    const yTicks = [min, (min + max) / 2, max];
    return `<svg class="physical-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico miglioramenti fisici">
      ${yTicks.map((t) => `<line class="physical-grid" x1="${left}" x2="${width - right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"></line><text class="physical-chart-label" x="4" y="${(y(t) + 4).toFixed(1)}">${Number(t).toFixed(metric.key === "twoPostsTest" ? 2 : 0)}</text>`).join("")}
      <line class="physical-axis" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"></line>
      ${area ? `<path class="physical-chart-fill" d="${area}"></path>` : ""}
      <path class="physical-chart-line" d="${path}"></path>
      ${points.map((p, i) => `<circle class="physical-chart-dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="5"></circle><text class="physical-chart-value" x="${x(i).toFixed(1)}" y="${(y(p.value) - 10).toFixed(1)}" text-anchor="middle">${p.value}${metric.suffix}</text>`).join("")}
      ${points.map((p, i) => `<text class="physical-chart-label" x="${x(i).toFixed(1)}" y="${height - 12}" text-anchor="middle">${dateLabel(p.date).replace(/ 20\d\d/, "")}</text>`).join("")}
    </svg>`;
  }

  function renderHistoryList(history, keeper, metric) {
    const box = $("physicalHistoryList");
    if (!box) return;
    const rows = history.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 8);
    if (!rows.length) {
      box.innerHTML = `<div class="physical-history-item"><h4>Nessuno storico fisico</h4><p>Salva le misure almeno una volta per iniziare a costruire lo storico.</p></div>`;
      return;
    }
    box.innerHTML = rows.map((s) => {
      const value = valueFor(s, keeper, metric.key);
      const keeperRow = (s.keepers || []).find((k) => String(k.key || k.id || k.name) === String(keeper));
      const tags = metrics.map((m) => {
        const v = keeperRow ? num(keeperRow[m.key]) : null;
        return `<span>${m.label}: ${v === null ? "—" : `${v}${m.suffix}`}</span>`;
      }).join("");
      return `<div class="physical-history-item"><h4>${dateLabel(s.date)}${value !== null ? ` · ${value}${metric.suffix}` : ""}</h4><p>${txt(keeperRow?.name || "Portiere")}${s.savedAt ? ` · salvato ${new Date(s.savedAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p><div class="physical-history-tags">${tags}</div></div>`;
    }).join("");
  }

  async function renderPhysicalHistory() {
    const box = $("physicalChartBox"), kpis = $("physicalKpis");
    if (!box || !kpis) return;
    let p = profile() || {};
    try { p = { ...p, ...(await rawProfile()) }; } catch {}
    p.keepers = p.keepers || profile()?.keepers || [];
    fillSelectors(p);
    const keeper = $("physicalChartKeeper")?.value;
    const metric = metrics.find((m) => m.key === ($("physicalChartMetric")?.value || "broadJump")) || metrics[0];
    const history = normalizedHistory(p).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
    const points = history.map((s) => ({ date: s.date, value: valueFor(s, keeper, metric.key) })).filter((p) => p.value !== null);
    const first = points[0], last = points[points.length - 1], prev = points[points.length - 2];
    const delta = first && last ? last.value - first.value : null;
    const deltaPrev = prev && last ? last.value - prev.value : null;
    const improvement = delta === null ? null : metric.better === "lower" ? -delta : delta;
    kpis.innerHTML = `<div class="physical-kpi"><span>Ultimo valore</span><strong>${last ? `${last.value}${metric.suffix}` : "—"}</strong><small>${last ? dateLabel(last.date) : "nessun salvataggio"}</small></div><div class="physical-kpi"><span>Miglioramento</span><strong>${improvement === null ? "—" : `${improvement > 0 ? "+" : ""}${Number(improvement.toFixed(2))}${metric.suffix}`}</strong><small>rispetto al primo test</small></div><div class="physical-kpi"><span>Ultima variazione</span><strong>${deltaPrev === null ? "—" : `${deltaPrev > 0 ? "+" : ""}${Number(deltaPrev.toFixed(2))}${metric.suffix}`}</strong><small>rispetto al salvataggio precedente</small></div>`;
    box.innerHTML = chartSvg(points, metric);
    renderHistoryList(history, keeper, metric);
  }

  function bindPhysicalSubmit() {
    const form = $("performanceForm");
    if (!form || form.dataset.physicalHistoryReadableBound === "1") return;
    form.dataset.physicalHistoryReadableBound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const status = $("physicalSaveStatus");
      if (status) status.textContent = "Salvataggio misure in corso...";
      try {
        const apiProfile = await rawProfile();
        const currentProfile = { ...apiProfile, ...(profile() || {}) };
        const keepers = keepersFromForm(currentProfile);
        const date = $("physicalSaveDate")?.value || today();
        const history = normalizedHistory(apiProfile);
        const snapshot = { id: `${date}-${Date.now()}`, date, savedAt: new Date().toISOString(), keepers: snapshotRows({ keepers }) };
        const nextProfile = { ...apiProfile, ...currentProfile, keepers, physicalHistory: [...history, snapshot].slice(-150) };
        await api("/api/profile", { method: "PUT", body: { profile: nextProfile } });
        if (status) status.textContent = `Misure salvate per il ${dateLabel(date)}.`;
        await renderPhysicalHistory();
      } catch (error) {
        if (status) status.textContent = `Errore: ${error.message}`;
        else alert(error.message);
      }
    }, true);
  }

  function ensurePhysicalUi() {
    const view = $("progressView");
    if (!view?.classList.contains("active")) return;
    const formCard = cleanProgressCards();
    if (!formCard) return;
    ensureDateInput();
    ensureGraphCard(formCard);
    bindPhysicalSubmit();
    renderPhysicalHistory();
  }

  function scheduleAll() {
    [0, 80, 250, 700].forEach((delay) => setTimeout(() => {
      ensureStyles();
      renderKeeperAttendance();
      ensurePhysicalUi();
    }, delay));
  }

  function boot() {
    ensureStyles();
    ensureLanding();
    hookLanding();
    document.addEventListener("click", (event) => {
      if (event.target.closest(".calendar-day[data-date]") || event.target.closest("#prevMonthBtn") || event.target.closest("#nextMonthBtn") || event.target.closest("[data-tab='calendar']") || event.target.closest("[data-tab='progress']")) scheduleAll();
    });
    [document.body, $("progressView"), $("calendarView")].filter(Boolean).forEach((target) => {
      if (target.__gkReadableObserved) return;
      target.__gkReadableObserved = true;
      new MutationObserver(() => scheduleAll()).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    scheduleAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
