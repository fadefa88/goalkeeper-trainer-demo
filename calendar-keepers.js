(() => {
  if (window.__gkCalendarKeepersDirect) return;
  window.__gkCalendarKeepersDirect = true;

  const STORAGE_KEY = "gk_keeper_attendance_v2";
  let renderTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function html(value) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(String(value ?? ""));
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;"
    })[char]);
  }

  function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function currentDateKey() {
    const selected = document.querySelector(".calendar-day.selected[data-date]");
    return selected?.dataset?.date || todayKey();
  }

  function getKeepers() {
    try {
      if (typeof window.getProfile === "function") return window.getProfile()?.keepers || [];
      if (typeof getProfile === "function") return getProfile()?.keepers || [];
    } catch {}
    return [];
  }

  function keeperKey(keeper, index) {
    return String(keeper?.id || keeper?.name || `keeper-${index}`);
  }

  function readMap() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function writeMap(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }

  function presentKeys(dateKey, keepers) {
    const stored = readMap()[dateKey];
    if (Array.isArray(stored)) return stored.map(String);
    return keepers.map((keeper, index) => keeperKey(keeper, index));
  }

  function ensureStyles() {
    if (byId("gkCalendarKeepersDirectStyles")) return;
    const style = document.createElement("style");
    style.id = "gkCalendarKeepersDirectStyles";
    style.textContent = `
      .keeper-attendance-card{display:grid;gap:12px;padding:14px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.045);margin-top:2px}
      .keeper-attendance-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .keeper-attendance-head h3{margin:0;font-size:16px}
      .keeper-attendance-list{display:grid;gap:8px}
      .keeper-attendance-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:15px;border:1px solid var(--line);background:rgba(7,17,11,.60)}
      .keeper-attendance-row span{font-weight:850;color:var(--text)}
      .keeper-attendance-row small{display:block;margin-top:2px;color:var(--muted);font-size:11px;font-weight:600}
      .keeper-attendance-row input{width:22px;height:22px;accent-color:var(--green)}
      .keeper-attendance-summary{color:var(--muted);font-size:12px;line-height:1.35}
      @media(max-width:390px){.keeper-attendance-head{display:grid}.keeper-attendance-row{align-items:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function updateSummary(card, dateKey, keepers) {
    const summary = card.querySelector(".keeper-attendance-summary");
    if (!summary) return;
    const present = presentKeys(dateKey, keepers);
    const names = keepers
      .filter((keeper, index) => present.includes(keeperKey(keeper, index)))
      .map((keeper, index) => keeper.name || `Portiere ${index + 1}`);
    summary.textContent = names.length
      ? `${names.length} presenti: ${names.join(", ")}`
      : "Nessun portiere selezionato per questa giornata.";
  }

  function saveFromCard(card, dateKey, keepers) {
    const map = readMap();
    map[dateKey] = Array.from(card.querySelectorAll(".keeper-attendance-check:checked")).map((input) => String(input.value));
    writeMap(map);
    updateSummary(card, dateKey, keepers);
  }

  function render() {
    ensureStyles();
    const calendarView = byId("calendarView");
    if (!calendarView || !calendarView.classList.contains("active")) return;

    const box = byId("selectedDateSessions");
    if (!box) return;

    const planner = box.querySelector(".planner-card") || box;
    if (!planner) return;

    const dateKey = currentDateKey();
    const keepers = getKeepers();
    const signature = `${dateKey}|${keepers.map((keeper, index) => keeperKey(keeper, index)).join("|")}`;
    const existing = planner.querySelector(".keeper-attendance-card");
    if (existing && existing.dataset.signature === signature) return;
    if (existing) existing.remove();

    const present = presentKeys(dateKey, keepers);
    const card = document.createElement("div");
    card.className = "keeper-attendance-card";
    card.dataset.signature = signature;
    card.innerHTML = `
      <div class="keeper-attendance-head">
        <div><p class="eyebrow">Presenze</p><h3>Portieri presenti</h3></div>
        <span class="pill">${keepers.length} in rosa</span>
      </div>
      ${keepers.length ? `<div class="keeper-attendance-list">${keepers.map((keeper, index) => {
        const key = keeperKey(keeper, index);
        const checked = present.includes(key) ? " checked" : "";
        const subtitle = [keeper.height ? `${keeper.height} cm` : "", keeper.weight ? `${keeper.weight} kg` : ""].filter(Boolean).join(" · ");
        return `<label class="keeper-attendance-row"><div><span>${html(keeper.name || `Portiere ${index + 1}`)}</span>${subtitle ? `<small>${html(subtitle)}</small>` : ""}</div><input class="keeper-attendance-check" type="checkbox" value="${html(key)}"${checked} /></label>`;
      }).join("")}</div>` : `<div class="planner-empty">Configura prima i portieri nel profilo.</div>`}
      <div class="keeper-attendance-summary"></div>
    `;

    const grid = planner.querySelector(".planner-grid");
    const summary = planner.querySelector(".planner-summary");
    if (grid) grid.insertAdjacentElement("afterend", card);
    else if (summary) summary.insertAdjacentElement("beforebegin", card);
    else planner.prepend(card);

    card.querySelectorAll(".keeper-attendance-check").forEach((input) => {
      input.addEventListener("change", () => saveFromCard(card, dateKey, keepers));
    });
    updateSummary(card, dateKey, keepers);
  }

  function scheduleRender(delay = 0) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay);
  }

  function hookShowView() {
    if (typeof window.showView !== "function" || window.showView.__keeperAttendanceDirectHook) return;
    const previous = window.showView;
    const hooked = function(view) {
      const result = previous.apply(this, arguments);
      scheduleRender(30);
      scheduleRender(180);
      return result;
    };
    hooked.__keeperAttendanceDirectHook = true;
    window.showView = hooked;
  }

  function boot() {
    ensureStyles();
    hookShowView();
    document.addEventListener("click", (event) => {
      if (event.target.closest(".calendar-day[data-date]") || event.target.closest("#prevMonthBtn") || event.target.closest("#nextMonthBtn") || event.target.closest("[data-tab='calendar']")) {
        scheduleRender(80);
        scheduleRender(260);
      }
    });

    const observe = () => {
      const target = byId("calendarView") || document.body;
      if (!target || target.__keeperAttendanceObserved) return;
      target.__keeperAttendanceObserved = true;
      new MutationObserver(() => scheduleRender(50)).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    };

    observe();
    scheduleRender(200);
    scheduleRender(800);
    setTimeout(observe, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
