(() => {
if (window.__gkCalendarKeepersMantovaV2) return;
window.__gkCalendarKeepersMantovaV2 = true;
const MATCH_CATEGORY = "__match__";
const MATCH_CACHE_KEY = "gk_mantova_matches_v1";
const MATCH_CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
const MATCH_REFRESH_AGE = 5 * 60 * 1000;
const PHANTOM_ID = "conduzione-palla-uscita-bassa";
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[char]));
const keeperKey = (keeper, index) => String(keeper?.id || keeper?.name || `keeper-${index}`);
const profile = () => { try { return typeof getProfile === "function" ? getProfile() : null; } catch { return null; } };
const rawFetch = window.fetch.bind(window);
let matches = [];
let reports = new Map();
let matchesFetchedAt = 0;
let loadMatchesPromise = null;
let enhanceTimer = null;
let observer = null;
function localDateKey(date = new Date()) {
const parts = new Intl.DateTimeFormat("en-CA", {
timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit"
}).formatToParts(date);
const get = (type) => parts.find((item) => item.type === type)?.value || "";
return `${get("year")}-${get("month")}-${get("day")}`;
}
function selectedDate() {
return document.querySelector(".calendar-day.selected[data-date]")?.dataset?.date || localDateKey();
}
function matchDate(match) {
return localDateKey(new Date(Number(match?.startTimestamp || 0) * 1000));
}
function matchForDate(key) {
return matches.find((match) => matchDate(match) === key) || null;
}
function matchTime(match) {
if (!match?.startTimestamp) return "Orario da definire";
return new Date(match.startTimestamp * 1000).toLocaleString("it-IT", {
timeZone: "Europe/Rome",
weekday: "long",
day: "2-digit",
month: "long",
hour: "2-digit",
minute: "2-digit"
});
}
function isFinished(match) {
const status = String(match?.status || "").toLowerCase();
const description = String(match?.statusDescription || "").toLowerCase();
return status.includes("finish") || status.includes("ended") || description.includes("ended") || description.includes("termin");
}
function resultText(match) {
const hasScore = Number.isFinite(match?.homeScore) && Number.isFinite(match?.awayScore);
if (hasScore) return `${match.homeScore} - ${match.awayScore}`;
const status = String(match?.status || "").toLowerCase();
if (status.includes("progress") || status.includes("live")) return "In corso";
return "Da giocare";
}
function defaultGoalsConceded(match) {
if (!match || !Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return 0;
return match.isHome ? Number(match.awayScore) : Number(match.homeScore);
}
function parseNotes(value) {
try { return JSON.parse(value || "{}"); } catch { return { note: String(value || "") }; }
}
const physicalMetrics = [
{ key: "broadJump", label: "Balzo da fermo", suffix: " cm", better: "higher" },
{ key: "verticalJump", label: "Balzo in alto", suffix: " cm", better: "higher" },
{ key: "halfHeightJump", label: "Balzo mezza altezza", suffix: " cm", better: "higher" },
{ key: "twoPostsTest", label: "Test due pali", suffix: " s", better: "lower" }
];
let physicalRenderRunning = false;
let physicalRenderDone = false;
async function apiJson(path, options = {}) {
const init = { method: options.method || "GET", credentials: "same-origin", headers: options.headers || {} };
if (options.body !== undefined) {
init.headers = { ...init.headers, "Content-Type": "application/json" };
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
const result = await apiJson("/api/profile");
return result?.profile || {};
}
function dateLabel(key) {
const parts = String(key || "").split("-").map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) return key || "—";
return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
function toNumber(value) {
return value === "" || value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);
}
function cleanProgressCards() {
const progress = $("progressView");
if (!progress) return null;
Array.from(progress.querySelectorAll(".progress-card")).forEach((card) => {
if (card.querySelector("#performanceForm") || card.id === "physicalProgressHistoryCard") return;
if (card.querySelector("#progressKpis") || card.querySelector("#monthlyChart") || card.querySelector("#keeperMeasures") || card.querySelector("#exerciseQualityList") || card.querySelector("#historyList")) card.remove();
});
const form = $("performanceForm");
const formCard = form?.closest(".progress-card");
if (!formCard) return null;
formCard.classList.add("physical-main-card");
const eyebrow = formCard.querySelector(".eyebrow");
const title = formCard.querySelector("h2");
const note = formCard.querySelector(".muted");
if (eyebrow) eyebrow.textContent = "Parte fisica";
if (title) title.textContent = "Motore del portiere";
if (note) note.textContent = "Inserisci la data e aggiorna le misure: ogni salvataggio crea uno storico confrontabile durante l’anno.";
return formCard;
}
function ensureDateInput() {
const form = $("performanceForm");
const fields = $("performanceFields");
if (!form || !fields || $("physicalSaveDate")) return;
const meta = document.createElement("div");
meta.className = "physical-save-meta";
meta.innerHTML = `<label>Data salvataggio misure<input id="physicalSaveDate" type="date" value="${localDateKey()}" /></label><p id="physicalSaveStatus" class="muted small-note">Scegli la data del test. Il salvataggio resta nello storico fisico.</p>`;
form.insertBefore(meta, fields);
}
function ensureGraphCard(formCard) {
if (!formCard || $("physicalProgressHistoryCard")) return;
const card = document.createElement("div");
card.id = "physicalProgressHistoryCard";
card.className = "progress-card physical-progress-card";
card.innerHTML = `<p class="eyebrow">Miglioramenti fisici</p><h2>Andamento misure</h2><p class="muted">Grafico basato sui salvataggi fisici registrati durante l’anno.</p><div class="physical-chart-controls"><label>Portiere<select id="physicalChartKeeper"></select></label><label>Misura<select id="physicalChartMetric"></select></label></div><div id="physicalKpis" class="physical-kpis"></div><div id="physicalChartBox" class="physical-chart-box"></div><div id="physicalHistoryList" class="physical-history-list"></div>`;
formCard.insertAdjacentElement("afterend", card);
$("physicalChartKeeper")?.addEventListener("change", () => renderPhysicalHistory(true));
$("physicalChartMetric")?.addEventListener("change", () => renderPhysicalHistory(true));
}
function normalizedHistory(raw) {
const list = Array.isArray(raw?.physicalHistory) ? raw.physicalHistory : Array.isArray(raw?.physical_history) ? raw.physical_history : [];
return list.filter(Boolean).map((item) => ({ ...item, date: item.date || localDateKey(new Date(item.savedAt || Date.now())) }));
}
function snapshotRows(currentKeepers) {
return (currentKeepers || []).map((keeper, index) => ({
id: keeper.id || null,
key: keeperKey(keeper, index),
name: keeper.name || `Portiere ${index + 1}`,
broadJump: toNumber(keeper.broadJump),
verticalJump: toNumber(keeper.verticalJump),
halfHeightJump: toNumber(keeper.halfHeightJump),
twoPostsTest: toNumber(keeper.twoPostsTest)
}));
}
function keepersFromForm(baseKeepers) {
const rows = Array.from(document.querySelectorAll(".performance-row"));
return (baseKeepers || []).map((keeper, index) => {
const row = rows.find((item) => Number(item.dataset.index) === index);
if (!row) return keeper;
const read = (selector) => toNumber(row.querySelector(selector)?.value);
return {
...keeper,
broadJump: read(".perf-broad-jump"),
verticalJump: read(".perf-vertical-jump"),
halfHeightJump: read(".perf-half-height-jump"),
twoPostsTest: read(".perf-two-posts-test")
};
});
}
function valueFor(snapshot, keeperId, metricKey) {
const row = (snapshot.keepers || []).find((item) => String(item.key || item.id || item.name) === String(keeperId));
return row ? toNumber(row[metricKey]) : null;
}
function fillPhysicalSelectors(raw) {
const keeperSelect = $("physicalChartKeeper");
const metricSelect = $("physicalChartMetric");
if (!keeperSelect || !metricSelect) return;
const keepers = raw.keepers || profile()?.keepers || [];
const previousKeeper = keeperSelect.value;
const previousMetric = metricSelect.value || "broadJump";
keeperSelect.innerHTML = keepers.length ? keepers.map((keeper, index) => `<option value="${esc(keeperKey(keeper, index))}">${esc(keeper.name || `Portiere ${index + 1}`)}</option>`).join("") : `<option value="">Nessun portiere</option>`;
metricSelect.innerHTML = physicalMetrics.map((metric) => `<option value="${metric.key}">${metric.label}</option>`).join("");
if (previousKeeper && Array.from(keeperSelect.options).some((option) => option.value === previousKeeper)) keeperSelect.value = previousKeeper;
if (previousMetric && Array.from(metricSelect.options).some((option) => option.value === previousMetric)) metricSelect.value = previousMetric;
}
function physicalChartSvg(points, metric) {
if (!points.length) return `<div class="physical-empty">Nessun dato per questa misura. Salva almeno un test fisico.</div>`;
const width = 360, height = 220, left = 42, right = 18, top = 24, bottom = 42;
const values = points.map((point) => point.value);
let min = Math.min(...values), max = Math.max(...values);
if (min === max) { min -= 1; max += 1; }
const pad = (max - min) * 0.12;
min -= pad;
max += pad;
const x = (index) => points.length === 1 ? (left + (width - right)) / 2 : left + index * ((width - left - right) / (points.length - 1));
const y = (value) => top + (max - value) * ((height - top - bottom) / (max - min));
const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
const area = points.length > 1 ? `${path} L${x(points.length - 1).toFixed(1)} ${height - bottom} L${x(0).toFixed(1)} ${height - bottom} Z` : "";
const ticks = [min, (min + max) / 2, max];
const decimals = metric.key === "twoPostsTest" ? 2 : 0;
return `<svg class="physical-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico miglioramenti fisici">
${ticks.map((tick) => `<line class="physical-grid-line" x1="${left}" x2="${width - right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}"></line><text class="physical-chart-label" x="4" y="${(y(tick) + 4).toFixed(1)}">${Number(tick).toFixed(decimals)}</text>`).join("")}
<line class="physical-axis" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"></line>
${area ? `<path class="physical-chart-fill" d="${area}"></path>` : ""}
<path class="physical-chart-line" d="${path}"></path>
${points.map((point, index) => `<circle class="physical-chart-dot" cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="5"></circle><text class="physical-chart-value" x="${x(index).toFixed(1)}" y="${(y(point.value) - 10).toFixed(1)}" text-anchor="middle">${point.value}${metric.suffix}</text>`).join("")}
${points.map((point, index) => `<text class="physical-chart-label" x="${x(index).toFixed(1)}" y="${height - 12}" text-anchor="middle">${dateLabel(point.date).replace(/ 20\d\d/, "")}</text>`).join("")}
</svg>`;
}
function renderPhysicalHistoryList(history, keeperId, metric) {
const box = $("physicalHistoryList");
if (!box) return;
const rows = history.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 8);
if (!rows.length) {
box.innerHTML = `<div class="physical-history-item"><h4>Nessuno storico fisico</h4><p>Salva le misure almeno una volta per iniziare a costruire lo storico.</p></div>`;
return;
}
box.innerHTML = rows.map((snapshot) => {
const row = (snapshot.keepers || []).find((item) => String(item.key || item.id || item.name) === String(keeperId));
const value = row ? toNumber(row[metric.key]) : null;
const tags = physicalMetrics.map((item) => {
const v = row ? toNumber(row[item.key]) : null;
return `<span>${item.label}: ${v === null ? "—" : `${v}${item.suffix}`}</span>`;
}).join("");
return `<div class="physical-history-item"><h4>${dateLabel(snapshot.date)}${value !== null ? ` · ${value}${metric.suffix}` : ""}</h4><p>${esc(row?.name || "Portiere")}</p><div class="physical-history-tags">${tags}</div></div>`;
}).join("");
}
async function renderPhysicalHistory(force = false) {
const chart = $("physicalChartBox");
const kpis = $("physicalKpis");
if (!chart || !kpis || physicalRenderRunning || (physicalRenderDone && !force)) return;
physicalRenderRunning = true;
try {
const raw = await rawProfile();
raw.keepers = raw.keepers || profile()?.keepers || [];
fillPhysicalSelectors(raw);
const keeperId = $("physicalChartKeeper")?.value;
const metric = physicalMetrics.find((item) => item.key === ($("physicalChartMetric")?.value || "broadJump")) || physicalMetrics[0];
const history = normalizedHistory(raw).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
const points = history.map((item) => ({ date: item.date, value: valueFor(item, keeperId, metric.key) })).filter((item) => item.value !== null);
const first = points[0], last = points[points.length - 1], previous = points[points.length - 2];
const totalDelta = first && last ? last.value - first.value : null;
const previousDelta = previous && last ? last.value - previous.value : null;
const improvement = totalDelta === null ? null : metric.better === "lower" ? -totalDelta : totalDelta;
kpis.innerHTML = `<div class="physical-kpi"><span>Ultimo valore</span><strong>${last ? `${last.value}${metric.suffix}` : "—"}</strong><small>${last ? dateLabel(last.date) : "nessun salvataggio"}</small></div><div class="physical-kpi"><span>Miglioramento</span><strong>${improvement === null ? "—" : `${improvement > 0 ? "+" : ""}${Number(improvement.toFixed(2))}${metric.suffix}`}</strong><small>rispetto al primo test</small></div><div class="physical-kpi"><span>Ultima variazione</span><strong>${previousDelta === null ? "—" : `${previousDelta > 0 ? "+" : ""}${Number(previousDelta.toFixed(2))}${metric.suffix}`}</strong><small>rispetto al salvataggio precedente</small></div>`;
chart.innerHTML = physicalChartSvg(points, metric);
renderPhysicalHistoryList(history, keeperId, metric);
physicalRenderDone = true;
} catch (error) {
chart.innerHTML = `<div class="physical-empty">Errore caricamento storico: ${esc(error.message)}</div>`;
} finally {
physicalRenderRunning = false;
}
}
function bindPhysicalSubmit() {
const form = $("performanceForm");
if (!form || form.dataset.physicalHistoryStableBound === "1") return;
form.dataset.physicalHistoryStableBound = "1";
form.addEventListener("submit", async (event) => {
event.preventDefault();
event.stopPropagation();
event.stopImmediatePropagation();
const status = $("physicalSaveStatus");
if (status) status.textContent = "Salvataggio misure in corso...";
try {
const raw = await rawProfile();
const keepers = keepersFromForm(raw.keepers || profile()?.keepers || []);
const date = $("physicalSaveDate")?.value || localDateKey();
const history = normalizedHistory(raw);
const snapshot = { id: `${date}-${Date.now()}`, date, savedAt: new Date().toISOString(), keepers: snapshotRows(keepers) };
await apiJson("/api/profile", { method: "PUT", body: { profile: { ...raw, keepers, physicalHistory: [...history, snapshot].slice(-150) } } });
if (status) status.textContent = `Misure salvate per il ${dateLabel(date)}.`;
physicalRenderDone = false;
await renderPhysicalHistory(true);
} catch (error) {
if (status) status.textContent = `Errore: ${error.message}`;
}
}, true);
}
function ensurePhysicalUi() {
if (!$("progressView")?.classList.contains("active")) return;
const formCard = cleanProgressCards();
if (!formCard) return;
ensureDateInput();
ensureGraphCard(formCard);
bindPhysicalSubmit();
renderPhysicalHistory(false);
}
function ensureStyles() {
if ($("gkFirstTeamCalendarStyles")) return;
const style = document.createElement("style");
style.id = "gkFirstTeamCalendarStyles";
style.textContent = `
.physical-main-card{display:grid!important;gap:18px!important}.physical-save-meta{display:grid;gap:12px;padding:16px;border-radius:22px;border:1px solid rgba(220,6,25,.24);background:rgba(220,6,25,.08)}.physical-save-meta label{display:grid;gap:8px;font-weight:900}.physical-save-meta .small-note{margin:0}
.physical-progress-card{display:grid;gap:16px;margin-top:14px}.physical-chart-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px}.physical-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.physical-kpi{padding:13px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.045)}.physical-kpi span{display:block;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase}.physical-kpi strong{display:block;margin-top:5px;font-size:22px}.physical-kpi small{display:block;margin-top:4px;color:var(--muted);font-size:11px}
.physical-chart-box{min-height:260px;padding:14px;border:1px solid var(--line);border-radius:22px;background:rgba(255,255,255,.035);overflow:hidden}.physical-chart-svg{width:100%;height:auto;display:block}.physical-axis{stroke:rgba(255,255,255,.16);stroke-width:1}.physical-grid-line{stroke:rgba(255,255,255,.08);stroke-width:1}.physical-chart-line{fill:none;stroke:var(--mantova-red,var(--green));stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.physical-chart-fill{fill:rgba(220,6,25,.10)}.physical-chart-dot{fill:#fff;stroke:var(--mantova-red,var(--green));stroke-width:4}.physical-chart-label{font-size:12px;fill:rgba(255,245,245,.78);font-weight:800}.physical-chart-value{font-size:12px;fill:#fff;font-weight:900}.physical-empty{min-height:210px;display:grid;place-items:center;text-align:center;color:var(--muted);padding:18px}
.physical-history-list{display:grid;gap:10px}.physical-history-item{display:grid;gap:7px;padding:13px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.04)}.physical-history-item h4{margin:0}.physical-history-item p{margin:0;color:var(--muted);font-size:12px}.physical-history-tags{display:flex;flex-wrap:wrap;gap:7px}.physical-history-tags span{border:1px solid var(--line);border-radius:999px;padding:5px 8px;font-size:11px;color:var(--muted)}
.keeper-attendance-card{display:grid;gap:12px;padding:14px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.045);margin-top:12px}
.keeper-attendance-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.keeper-attendance-head h3{margin:0;font-size:16px}
.keeper-attendance-list{display:grid;gap:8px}.keeper-attendance-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:15px;border:1px solid var(--line);background:rgba(255,255,255,.04)}
.keeper-attendance-row span{font-weight:850;color:var(--text)}.keeper-attendance-row small{display:block;margin-top:2px;color:var(--muted);font-size:11px}.keeper-attendance-row input{width:22px!important;height:22px!important;accent-color:var(--mantova-red,var(--green));padding:0!important}.keeper-attendance-summary{color:var(--muted);font-size:12px;line-height:1.35}
.calendar-day{position:relative}.calendar-day.first-team-match-day{border-color:rgba(255,255,255,.72)!important;background:linear-gradient(155deg,rgba(220,6,25,.28),rgba(255,255,255,.07))!important}
.calendar-day.first-team-match-day.selected{background:linear-gradient(180deg,#f0182b,var(--mantova-red,#dc0619))!important}
.calendar-match-badge{position:absolute;top:3px;right:3px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;display:grid;place-items:center;background:#fff;color:var(--mantova-red,#dc0619);border:1px solid rgba(220,6,25,.35);font-size:8px;font-weight:950;line-height:1;box-shadow:0 4px 10px rgba(0,0,0,.26)}
.first-team-match-card{display:grid;gap:16px;padding:18px;border-radius:24px;border:1px solid rgba(255,255,255,.22);background:linear-gradient(165deg,rgba(80,5,13,.96),rgba(18,1,4,.96));box-shadow:var(--shadow);overflow:hidden;position:relative}
.first-team-match-card::after{content:"";position:absolute;right:-20px;top:-18px;width:106px;height:126px;background:var(--mantova-logo) center/contain no-repeat;opacity:.10;pointer-events:none}
.match-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:relative;z-index:1}.match-card-head h3{font-size:20px;margin:0}.match-card-head .pill{color:#fff!important}
.match-scoreboard{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;align-items:center;padding:16px 12px;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:rgba(255,255,255,.055)}
.match-team{font-size:16px;font-weight:950;line-height:1.15}.match-team.away{text-align:right}.match-score{font-size:30px;font-weight:950;letter-spacing:-.06em;white-space:nowrap}
.match-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.match-meta{padding:11px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.04)}.match-meta span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:900}.match-meta strong{display:block;margin-top:4px;font-size:13px}
.match-day-lock{padding:12px 13px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);font-size:12px;line-height:1.4;color:#fff}
.match-report{display:grid;gap:12px;padding-top:4px}.match-report-grid{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px}.match-report textarea{min-height:92px;resize:vertical}.match-save-status{min-height:20px;color:var(--muted);font-size:12px;font-weight:800}
.match-save-status.ok{color:#fff}.match-save-status.error{color:#ffd5d5}
#selectedDateSessions[data-first-team-match="1"] .keeper-attendance-card,#selectedDateSessions[data-first-team-match="1"] .planner-card,#selectedDateSessions[data-first-team-match="1"] .planner-save-row{display:none!important}
@media(max-width:430px){.match-meta-grid,.match-report-grid{grid-template-columns:1fr}.match-scoreboard{grid-template-columns:1fr auto 1fr;gap:8px}.match-team{font-size:14px}.match-score{font-size:26px}}
`;
document.head.appendChild(style);
}
function hookLanding() {
if (typeof showView !== "function" || showView.__gkStableLandingHook) return;
window.__gkLandingPending = true;
const previous = showView;
showView = function(view) {
if (view === "home" && window.__gkLandingPending) {
window.__gkLandingPending = false;
return previous("landing");
}
return previous.apply(this, arguments);
};
showView.__gkStableLandingHook = true;
}
function planKeys() {
const keys = [];
try {
for (let i = 0; i < localStorage.length; i += 1) {
const key = localStorage.key(i);
if (key?.startsWith("gk_day_plans_")) keys.push(key);
}
} catch {}
return keys;
}
function readJson(key) {
try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}
function writeJson(key, value) {
try { localStorage.setItem(key, JSON.stringify(value || {})); } catch {}
}
function hasItems(plan) {
return Array.isArray(plan?.items) && plan.items.length > 0;
}
function isExplicit(plan) {
return Boolean(
plan?.explicitlySaved === true ||
plan?.savedFromCalendar === true ||
plan?.savedByUser === true ||
plan?.saveSource === "calendar-save" ||
plan?.source === "calendar-save"
);
}
function isLikelyPhantom(plan) {
if (isExplicit(plan)) return false;
const items = Array.isArray(plan?.items) ? plan.items : [];
if (items.length !== 1) return false;
const item = items[0] || {};
const id = item.exerciseId || item.id || item.exercise_id;
return id === PHANTOM_ID && !item.done && !item.note;
}
function isTrainingEligible(plan) {
return hasItems(plan) && (isExplicit(plan) || Boolean(plan?.savedAt && plan?.accountSaved && !isLikelyPhantom(plan)));
}
function savedOnly(plans) {
const out = {};
Object.entries(plans || {}).forEach(([date, plan]) => {
if (isTrainingEligible(plan)) out[date] = plan;
});
return out;
}
function removePhantoms(plans) {
const out = {};
Object.entries(plans || {}).forEach(([date, plan]) => {
if (!isLikelyPhantom(plan)) out[date] = plan;
});
return out;
}
function purgeLocalPhantoms() {
planKeys().forEach((key) => {
const plans = readJson(key);
const clean = removePhantoms(plans);
if (JSON.stringify(clean) !== JSON.stringify(plans)) writeJson(key, clean);
});
}
function markSelectedPlanExplicit() {
if (matchForDate(selectedDate())) return;
const date = selectedDate();
const now = new Date().toISOString();
let changed = false;
planKeys().forEach((key) => {
const plans = readJson(key);
if (!hasItems(plans[date])) return;
plans[date] = {
...plans[date],
savedAt: plans[date].savedAt || now,
updatedAt: now,
accountSaved: true,
explicitlySaved: true,
savedFromCalendar: true,
savedByUser: true,
saveSource: "calendar-save",
source: "calendar-save"
};
writeJson(key, plans);
changed = true;
});
if (changed) window.dispatchEvent(new CustomEvent("gk-training-plans-updated", { detail: { date } }));
}
async function purgeTrainingOnMatchDates() {
const matchDates = new Set(matches.map(matchDate));
if (!matchDates.size) return;
let localChanged = false;
planKeys().forEach((key) => {
const plans = readJson(key);
let changed = false;
matchDates.forEach((date) => {
if (plans[date]) {
delete plans[date];
changed = true;
localChanged = true;
}
});
if (changed) writeJson(key, plans);
});
if (localChanged) window.dispatchEvent(new CustomEvent("gk-training-plans-updated"));
try {
const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
if (!response.ok) return;
const data = await response.json();
const p = data?.profile || {};
const current = p.trainingPlans || p.training_plans;
if (!current || typeof current !== "object") return;
const clean = { ...current };
let changed = false;
matchDates.forEach((date) => {
if (clean[date]) {
delete clean[date];
changed = true;
}
});
if (changed) {
await fetch("/api/profile", {
method: "PUT",
credentials: "same-origin",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ profile: { ...p, trainingPlans: clean, training_plans: clean } })
});
}
} catch {}
}
function localEligibleRows() {
const merged = {};
planKeys().forEach((key) => Object.assign(merged, readJson(key)));
return Object.entries(savedOnly(merged)).sort((a, b) => a[0].localeCompare(b[0]));
}
function renderTrainingEmptyIfNeeded() {
const view = $("trainingView");
if (!view?.classList.contains("active")) return;
purgeLocalPhantoms();
if (localEligibleRows().length) return;
const title = $("trainingTitle");
const subtitle = $("trainingSubtitle");
const list = $("trainingList");
const filter = $("trainingDateFilter");
if (filter) filter.value = "";
try { localStorage.removeItem("gk_training_filter_date"); } catch {}
if (title) title.textContent = "Nessun allenamento salvato";
if (subtitle) subtitle.textContent = "La scheda resta vuota finché non salvi una seduta dal Calendario con il bottone Salva allenamento.";
if (list) {
list.innerHTML = `<div class="training-empty"><strong>Nessun allenamento salvato.</strong><span>Vai nel Calendario, prepara la giornata e premi Salva allenamento. Le bozze del calendario non compaiono qui.</span><button id="goCalendarFromTraining" class="primary-btn full" type="button">Vai al calendario</button></div>`;
$("goCalendarFromTraining")?.addEventListener("click", () => { if (typeof showView === "function") showView("calendar"); });
}
}
function installFetchGuards() {
if (window.fetch.__gkMantovaCalendarGuard) return;
const previous = window.fetch.bind(window);
const guarded = async (input, init = {}) => {
let url = "";
try { url = typeof input === "string" ? input : input?.url || ""; } catch {}
const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();
if (url.includes("/api/profile") && method === "PUT" && init?.body) {
try {
const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
if (body?.profile && ("trainingPlans" in body.profile || "training_plans" in body.profile)) {
const explicit = savedOnly(removePhantoms(body.profile.trainingPlans || body.profile.training_plans || {}));
body.profile.trainingPlans = explicit;
body.profile.training_plans = explicit;
init = { ...init, body: JSON.stringify(body) };
}
} catch {}
}
const response = await previous(input, init);
if (url.includes("/api/profile") && method === "GET" && response?.ok) {
try {
const data = await response.clone().json();
if (data?.profile && ("trainingPlans" in data.profile || "training_plans" in data.profile)) {
const explicit = savedOnly(removePhantoms(data.profile.trainingPlans || data.profile.training_plans || {}));
data.profile.trainingPlans = explicit;
data.profile.training_plans = explicit;
return new Response(JSON.stringify(data), {
status: response.status,
statusText: response.statusText,
headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
}
} catch {}
}
if (url.includes("/api/sessions") && method === "GET" && response?.ok) {
try {
const data = await response.clone().json();
if (Array.isArray(data?.sessions)) {
data.sessions = data.sessions.filter((session) => session?.category !== MATCH_CATEGORY);
return new Response(JSON.stringify(data), {
status: response.status,
statusText: response.statusText,
headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
}
} catch {}
}
return response;
};
guarded.__gkMantovaCalendarGuard = true;
window.fetch = guarded;
}
async function loadMatchReports() {
try {
const response = await rawFetch("/api/sessions", { credentials: "same-origin", cache: "no-store" });
if (!response.ok) return;
const data = await response.json();
const next = new Map();
(data?.sessions || []).filter((session) => session?.category === MATCH_CATEGORY).forEach((session) => {
const meta = parseNotes(session.notes);
const matchId = String(meta.matchId || "");
if (!matchId) return;
const old = next.get(matchId);
if (!old || String(session.date || "") >= String(old.date || "")) next.set(matchId, { ...session, meta });
});
reports = next;
} catch {}
}
function cachedMatches() {
try {
const cache = JSON.parse(localStorage.getItem(MATCH_CACHE_KEY) || "{}");
if (!Array.isArray(cache.matches) || !cache.matches.length) return null;
return cache;
} catch { return null; }
}
async function loadMatches(force = false) {
if (loadMatchesPromise) return loadMatchesPromise;
if (!force && matches.length && Date.now() - matchesFetchedAt < MATCH_REFRESH_AGE) return matches;
loadMatchesPromise = (async () => {
try {
const response = await fetch("/api/health?matches=1", { credentials: "same-origin", cache: "no-store" });
if (!response.ok) throw new Error(`Partite non disponibili (${response.status})`);
const data = await response.json();
if (!Array.isArray(data?.matches)) throw new Error("Calendario partite non valido");
matches = data.matches.filter((match) => match?.id && match?.startTimestamp);
matchesFetchedAt = Date.now();
localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify({ fetchedAt: matchesFetchedAt, matches }));
} catch (error) {
const cache = cachedMatches();
if (cache && Date.now() - Number(cache.fetchedAt || 0) <= MATCH_CACHE_MAX_AGE) {
matches = cache.matches;
matchesFetchedAt = Number(cache.fetchedAt || 0);
} else {
matches = [];
console.warn("[GK Trainer] Calendario prima squadra non disponibile:", error);
}
}
await loadMatchReports();
await purgeTrainingOnMatchDates();
enhanceCalendar();
return matches;
})().finally(() => { loadMatchesPromise = null; });
return loadMatchesPromise;
}
function reportSignature(match, report) {
return [
match?.id,
match?.status,
match?.homeScore,
match?.awayScore,
report?.id || "",
report?.keeperId || "",
report?.mistakes ?? "",
report?.notes || ""
].join("|");
}
function keeperOptions(savedKeeperId) {
const keepers = profile()?.keepers || [];
if (!keepers.length) return `<option value="">Nessun portiere configurato</option>`;
return `<option value="">Seleziona portiere</option>${keepers.map((keeper, index) => {
const key = keeperKey(keeper, index);
return `<option value="${esc(key)}" data-name="${esc(keeper.name || `Portiere ${index + 1}`)}"${String(savedKeeperId || "") === key ? " selected" : ""}>${esc(keeper.name || `Portiere ${index + 1}`)}</option>`;
}).join("")}`;
}
function renderMatchCard(match) {
const box = $("selectedDateSessions");
if (!box || !match) return;
const report = reports.get(String(match.id));
const signature = reportSignature(match, report);
box.dataset.firstTeamMatch = "1";
box.querySelectorAll(".keeper-attendance-card,.planner-save-row").forEach((node) => node.remove());
if (box.dataset.matchSignature === signature && box.querySelector(".first-team-match-card")) return;
const meta = report?.meta || {};
const savedGoals = report ? Number(report.mistakes || 0) : defaultGoalsConceded(match);
const savedNote = meta.note || "";
const competition = match.competition || "Prima squadra";
const statusText = resultText(match);
const round = match.round || "Turno da definire";
const venue = match.venue || "Stadio da definire";
box.dataset.matchSignature = signature;
box.innerHTML = `
<div class="first-team-match-card" data-match-id="${esc(match.id)}">
<div class="match-card-head">
<div><p class="eyebrow">Prima squadra · ${esc(competition)}</p><h3>${esc(match.homeTeam)} vs ${esc(match.awayTeam)}</h3></div>
<span class="pill">${esc(isFinished(match) ? "Finale" : match.statusDescription || "Partita")}</span>
</div>
<div class="match-scoreboard">
<div class="match-team">${esc(match.homeTeam)}</div>
<div class="match-score">${esc(statusText)}</div>
<div class="match-team away">${esc(match.awayTeam)}</div>
</div>
<div class="match-meta-grid">
<div class="match-meta"><span>Calcio d'inizio</span><strong>${esc(matchTime(match))}</strong></div>
<div class="match-meta"><span>Turno</span><strong>${esc(round)}</strong></div>
<div class="match-meta"><span>Campo</span><strong>${esc(venue)}</strong></div>
<div class="match-meta"><span>Mantova</span><strong>${match.isHome ? "Casa" : "Trasferta"}</strong></div>
</div>
<div class="match-day-lock"><strong>Giorno partita.</strong> In questa data la programmazione degli allenamenti è disabilitata.</div>
<div class="match-report">
<p class="eyebrow">Rapporto portiere</p>
<div class="match-report-grid">
<label>Portiere titolare<select id="matchStartingKeeper">${keeperOptions(report?.keeperId)}</select></label>
<label>Gol subiti<input id="matchGoalsConceded" type="number" inputmode="numeric" min="0" step="1" value="${esc(savedGoals)}" /></label>
</div>
<label>Note<textarea id="matchKeeperNotes" placeholder="Prestazione, episodi, indicazioni tecniche...">${esc(savedNote)}</textarea></label>
<button id="saveMatchReportBtn" class="primary-btn full" type="button">Salva rapporto partita</button>
<p id="matchSaveStatus" class="match-save-status">${report ? "Rapporto partita salvato." : "Seleziona il portiere titolare e salva i dati della partita."}</p>
</div>
</div>`;
}
async function saveMatchReport(button) {
const match = matchForDate(selectedDate());
if (!match) return;
const keeperSelect = $("matchStartingKeeper");
const goalsInput = $("matchGoalsConceded");
const notesInput = $("matchKeeperNotes");
const status = $("matchSaveStatus");
const keeperId = keeperSelect?.value || "";
if (!keeperId) {
if (status) { status.textContent = "Seleziona il portiere titolare."; status.className = "match-save-status error"; }
return;
}
const option = keeperSelect.selectedOptions?.[0];
const keeperName = option?.dataset?.name || option?.textContent || "Portiere";
const goals = Math.max(0, Number(goalsInput?.value || 0));
const note = String(notesInput?.value || "").trim();
if (button) { button.disabled = true; button.textContent = "Salvataggio..."; }
if (status) { status.textContent = "Salvataggio rapporto partita..."; status.className = "match-save-status"; }
const session = {
keeperId,
keeperName,
exerciseId: `match-${match.id}`,
exerciseName: `${match.homeTeam} - ${match.awayTeam}`,
sessionDate: matchDate(match),
plannedMinutes: 90,
saves: 0,
mistakes: goals,
reactions: 0,
category: MATCH_CATEGORY,
sport: "calcio",
level: "prima-squadra",
notes: JSON.stringify({
type: "first-team-match",
matchId: String(match.id),
note,
homeTeam: match.homeTeam,
awayTeam: match.awayTeam,
result: resultText(match),
competition: match.competition || "",
startTimestamp: match.startTimestamp
})
};
try {
const response = await rawFetch("/api/sessions", {
method: "POST",
credentials: "same-origin",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ session })
});
if (!response.ok) {
const data = await response.json().catch(() => ({}));
throw new Error(data?.error || `Errore ${response.status}`);
}
await loadMatchReports();
renderMatchCard(match);
const nextStatus = $("matchSaveStatus");
if (nextStatus) { nextStatus.textContent = "Rapporto partita salvato ✓"; nextStatus.className = "match-save-status ok"; }
const nextButton = $("saveMatchReportBtn");
if (nextButton) nextButton.textContent = "Salvato ✓";
setTimeout(() => { if ($("saveMatchReportBtn")) $("saveMatchReportBtn").textContent = "Salva rapporto partita"; }, 1400);
} catch (error) {
if (button) { button.disabled = false; button.textContent = "Salva rapporto partita"; }
if (status) { status.textContent = `Errore: ${error.message}`; status.className = "match-save-status error"; }
}
}
function renderKeeperAttendance() {
const view = $("calendarView");
if (!view?.classList.contains("active")) return;
const date = selectedDate();
if (matchForDate(date)) {
$("selectedDateSessions")?.querySelectorAll(".keeper-attendance-card").forEach((node) => node.remove());
return;
}
const box = $("selectedDateSessions");
const planner = box?.querySelector(".planner-card");
if (!planner) return;
const keepers = profile()?.keepers || [];
const signature = `${date}|${keepers.map(keeperKey).join("|")}`;
const existing = planner.querySelector(".keeper-attendance-card");
if (existing?.dataset.signature === signature) return;
existing?.remove();
let stored = {};
try { stored = JSON.parse(localStorage.getItem("gk_keeper_attendance_v3") || "{}"); } catch {}
const present = Array.isArray(stored[date]) ? stored[date].map(String) : keepers.map(keeperKey);
const card = document.createElement("div");
card.className = "keeper-attendance-card";
card.dataset.signature = signature;
card.innerHTML = `<div class="keeper-attendance-head"><div><p class="eyebrow">Presenze</p><h3>Portieri presenti</h3></div><span class="pill">${keepers.length} in rosa</span></div>${keepers.length ? `<div class="keeper-attendance-list">${keepers.map((keeper, index) => {
const key = keeperKey(keeper, index);
const checked = present.includes(key) ? " checked" : "";
const subtitle = [keeper.height ? `${keeper.height} cm` : "", keeper.weight ? `${keeper.weight} kg` : ""].filter(Boolean).join(" · ");
return `<label class="keeper-attendance-row"><div><span>${esc(keeper.name || `Portiere ${index + 1}`)}</span>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</div><input class="keeper-attendance-check" type="checkbox" value="${esc(key)}"${checked} /></label>`;
}).join("")}</div>` : `<div class="planner-empty">Configura prima i portieri nel profilo.</div>`}<div class="keeper-attendance-summary"></div>`;
const grid = planner.querySelector(".planner-grid");
if (grid) grid.insertAdjacentElement("afterend", card);
else planner.prepend(card);
const update = () => {
const checked = Array.from(card.querySelectorAll(".keeper-attendance-check:checked")).map((input) => String(input.value));
const names = keepers.filter((keeper, index) => checked.includes(keeperKey(keeper, index))).map((keeper, index) => keeper.name || `Portiere ${index + 1}`);
const summary = card.querySelector(".keeper-attendance-summary");
if (summary) summary.textContent = names.length ? `${names.length} presenti: ${names.join(", ")}` : "Nessun portiere selezionato per questa giornata.";
try {
const next = JSON.parse(localStorage.getItem("gk_keeper_attendance_v3") || "{}");
next[date] = checked;
localStorage.setItem("gk_keeper_attendance_v3", JSON.stringify(next));
} catch {}
};
card.querySelectorAll(".keeper-attendance-check").forEach((input) => input.addEventListener("change", update));
const summary = card.querySelector(".keeper-attendance-summary");
if (summary) {
const names = keepers.filter((keeper, index) => present.includes(keeperKey(keeper, index))).map((keeper, index) => keeper.name || `Portiere ${index + 1}`);
summary.textContent = names.length ? `${names.length} presenti: ${names.join(", ")}` : "Nessun portiere selezionato per questa giornata.";
}
}
function enhanceCalendar() {
if (!$("calendarView")?.classList.contains("active")) return;
ensureStyles();
document.querySelectorAll(".calendar-day[data-date]").forEach((day) => {
const match = matchForDate(day.dataset.date);
day.classList.toggle("first-team-match-day", Boolean(match));
day.querySelector(".calendar-match-badge")?.remove();
if (match) {
const badge = document.createElement("span");
badge.className = "calendar-match-badge";
badge.textContent = "1ª";
badge.title = `${match.homeTeam} - ${match.awayTeam}`;
day.appendChild(badge);
}
});
const match = matchForDate(selectedDate());
const box = $("selectedDateSessions");
if (match) {
renderMatchCard(match);
box?.querySelectorAll(".keeper-attendance-card,.planner-save-row").forEach((node) => node.remove());
} else {
if (box) {
delete box.dataset.firstTeamMatch;
delete box.dataset.matchSignature;
}
renderKeeperAttendance();
}
}
function scheduleEnhance(delay = 80) {
clearTimeout(enhanceTimer);
enhanceTimer = setTimeout(() => {
enhanceCalendar();
renderTrainingEmptyIfNeeded();
}, delay);
}
function observeCalendar() {
if (observer) return;
const grid = $("calendarGrid");
const sessions = $("selectedDateSessions");
if (!grid && !sessions) return;
observer = new MutationObserver(() => scheduleEnhance(35));
if (grid) observer.observe(grid, { childList: true });
if (sessions) observer.observe(sessions, { childList: true, subtree: true });
}
function blockTrainingOnMatchDay(event) {
if (!matchForDate(selectedDate())) return false;
const target = event.target?.closest?.("#addPlanExerciseBtn,#autoPlanBtn,#clearPlanBtn,[data-plan-remove],#saveCalendarPlanBtn,.plan-item-minutes,#dayPlanExercise,#dayPlanTime,#dayPlanTotal");
if (!target) return false;
event.preventDefault();
event.stopPropagation();
event.stopImmediatePropagation();
renderMatchCard(matchForDate(selectedDate()));
return true;
}
document.addEventListener("click", (event) => {
if (blockTrainingOnMatchDay(event)) return;
const target = event.target?.closest ? event.target : event.target?.parentElement;
if (!target) return;
const saveReport = target.closest("#saveMatchReportBtn");
if (saveReport) {
event.preventDefault();
event.stopPropagation();
event.stopImmediatePropagation();
saveMatchReport(saveReport);
return;
}
if (target.closest("#saveCalendarPlanBtn")) {
markSelectedPlanExplicit();
setTimeout(markSelectedPlanExplicit, 120);
setTimeout(renderTrainingEmptyIfNeeded, 700);
}
if (target.closest(".calendar-day[data-date],#prevMonthBtn,#nextMonthBtn,[data-tab='calendar']")) {
scheduleEnhance(40);
setTimeout(() => enhanceCalendar(), 140);
setTimeout(() => enhanceCalendar(), 420);
if (target.closest("[data-tab='calendar']")) loadMatches(false);
}
if (target.closest("[data-tab='progress']")) {
physicalRenderDone = false;
setTimeout(() => ensurePhysicalUi(), 120);
setTimeout(() => ensurePhysicalUi(), 500);
}
if (target.closest("[data-tab='training'],[data-quick-go='training']")) {
setTimeout(renderTrainingEmptyIfNeeded, 120);
setTimeout(renderTrainingEmptyIfNeeded, 600);
}
}, true);
document.addEventListener("change", (event) => {
if (blockTrainingOnMatchDay(event)) return;
if (event.target?.closest?.("#dayPlanTime,#dayPlanTotal,.plan-item-minutes")) {
scheduleEnhance(100);
setTimeout(renderKeeperAttendance, 280);
}
}, true);
window.addEventListener("gk-training-plans-updated", () => {
purgeLocalPhantoms();
setTimeout(renderTrainingEmptyIfNeeded, 140);
});
function boot() {
ensureStyles();
hookLanding();
purgeLocalPhantoms();
observeCalendar();
loadMatches(false);
renderTrainingEmptyIfNeeded();
ensurePhysicalUi();
scheduleEnhance(120);
}
installFetchGuards();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
[300, 900, 1800, 3200].forEach((delay) => setTimeout(boot, delay));
})();
