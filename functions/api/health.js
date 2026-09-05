import { json, requireAuth } from "./_shared.js";

const MANTOVA_ESPN_ID = "3991";
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

function toTs(iso) {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? Math.floor(value / 1000) : 0;
}

function fixture(id, iso, homeTeam, awayTeam, competition = "Serie B", homeScore = null, awayScore = null, round = "") {
  const finished = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  return {
    id: String(id),
    startTimestamp: toTs(iso),
    status: finished ? "finished" : "notstarted",
    statusDescription: finished ? "Finale" : "Da giocare",
    competition,
    round,
    homeTeam,
    awayTeam,
    homeTeamId: homeTeam.includes("Mantova") ? MANTOVA_ESPN_ID : "",
    awayTeamId: awayTeam.includes("Mantova") ? MANTOVA_ESPN_ID : "",
    homeScore,
    awayScore,
    venue: "",
    isHome: homeTeam.includes("Mantova")
  };
}

const BUNDLED_MATCHES = [
  fixture("72336422", "2026-08-16T21:15:00+02:00", "Lazio", "Mantova 1911", "Coppa Italia", 0, 2, "Trentaduesimi"),
  fixture("73092856", "2026-08-22T19:00:00+02:00", "Carrarese", "Mantova 1911", "Serie B", 1, 2),
  fixture("73092884", "2026-08-30T19:00:00+02:00", "Mantova 1911", "Empoli", "Serie B", 3, 1),
  fixture("74019310", "2026-09-03T18:00:00+02:00", "Palermo", "Mantova 1911", "Coppa Italia", 5, 2, "Sedicesimi"),
  fixture("73092896", "2026-09-06T15:00:00+02:00", "Cesena", "Mantova 1911"),
  fixture("73092924", "2026-09-13T17:15:00+02:00", "Mantova 1911", "Sampdoria"),
  fixture("73092942", "2026-09-20T17:15:00+02:00", "Mantova 1911", "Pisa"),
  fixture("73092958", "2026-10-10T17:00:00+02:00", "Catanzaro", "Mantova 1911"),
  fixture("73092982", "2026-10-17T17:00:00+02:00", "Mantova 1911", "Palermo"),
  fixture("73093002", "2026-10-24T17:00:00+02:00", "Virtus Entella", "Mantova 1911"),
  fixture("73093026", "2026-10-27T18:00:00+01:00", "Mantova 1911", "Cremonese"),
  fixture("73093042", "2026-10-31T18:00:00+01:00", "Modena", "Mantova 1911"),
  fixture("73093066", "2026-11-07T18:00:00+01:00", "Mantova 1911", "Hellas Verona"),
  fixture("73093076", "2026-11-21T18:00:00+01:00", "Avellino", "Mantova 1911"),
  fixture("73093150", "2026-11-24T18:00:00+01:00", "Mantova 1911", "Arezzo"),
  fixture("73093178", "2026-11-28T18:00:00+01:00", "Sudtirol", "Mantova 1911"),
  fixture("73093190", "2026-12-05T18:00:00+01:00", "Mantova 1911", "Ascoli"),
  fixture("73093214", "2026-12-08T18:00:00+01:00", "Vicenza", "Mantova 1911"),
  fixture("73093228", "2026-12-12T18:00:00+01:00", "Mantova 1911", "Benevento"),
  fixture("73093252", "2026-12-19T18:00:00+01:00", "Juve Stabia", "Mantova 1911"),
  fixture("73093270", "2026-12-27T18:00:00+01:00", "Mantova 1911", "Padova"),
  fixture("73093290", "2027-01-09T18:00:00+01:00", "Mantova 1911", "Carrarese"),
  fixture("73093318", "2027-01-16T18:00:00+01:00", "Sampdoria", "Mantova 1911"),
  fixture("73093328", "2027-01-23T18:00:00+01:00", "Mantova 1911", "Avellino"),
  fixture("73093352", "2027-01-30T18:00:00+01:00", "Empoli", "Mantova 1911"),
  fixture("73093368", "2027-02-06T18:00:00+01:00", "Mantova 1911", "Catanzaro"),
  fixture("73093394", "2027-02-13T18:00:00+01:00", "Palermo", "Mantova 1911"),
  fixture("73093402", "2027-02-20T18:00:00+01:00", "Benevento", "Mantova 1911"),
  fixture("73093430", "2027-02-27T18:00:00+01:00", "Mantova 1911", "Cesena"),
  fixture("73093456", "2027-03-02T18:00:00+01:00", "Padova", "Mantova 1911"),
  fixture("73093550", "2027-03-06T18:00:00+01:00", "Mantova 1911", "Sudtirol"),
  fixture("73093570", "2027-03-13T18:00:00+01:00", "Cremonese", "Mantova 1911"),
  fixture("73093592", "2027-03-20T18:00:00+01:00", "Mantova 1911", "Juve Stabia"),
  fixture("73093612", "2027-04-03T17:00:00+02:00", "Hellas Verona", "Mantova 1911"),
  fixture("73093632", "2027-04-10T17:00:00+02:00", "Mantova 1911", "Modena"),
  fixture("73093642", "2027-04-17T17:00:00+02:00", "Arezzo", "Mantova 1911"),
  fixture("73093662", "2027-04-24T17:00:00+02:00", "Ascoli", "Mantova 1911"),
  fixture("73093692", "2027-05-01T17:00:00+02:00", "Mantova 1911", "Virtus Entella"),
  fixture("73093716", "2027-05-08T17:00:00+02:00", "Pisa", "Mantova 1911"),
  fixture("73093732", "2027-05-14T17:00:00+02:00", "Mantova 1911", "Vicenza")
];

function numericScore(value) {
  const raw = value && typeof value === "object"
    ? (value.value ?? value.displayValue ?? value.display ?? null)
    : value;
  if (raw === null || raw === undefined || raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function espnTeamName(competitor, fallback) {
  const team = competitor?.team || {};
  return team.displayName || team.shortDisplayName || team.name || team.location || fallback;
}

function normalizeEspnMatch(event, leagueName) {
  const competition = event?.competitions?.[0] || {};
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const home = competitors.find((item) => item?.homeAway === "home") || competitors[0] || {};
  const away = competitors.find((item) => item?.homeAway === "away") || competitors[1] || {};
  const rawDate = competition?.date || event?.date || "";
  const startMs = Date.parse(rawDate);
  if (!Number.isFinite(startMs) || (!home?.team && !home?.id) || (!away?.team && !away?.id)) return null;

  const statusType = competition?.status?.type || event?.status?.type || {};
  const state = String(statusType?.state || "pre").toLowerCase();
  const completed = Boolean(statusType?.completed) || state === "post";
  const started = completed || state === "in";
  const homeId = String(home?.team?.id || home?.id || "");
  const awayId = String(away?.team?.id || away?.id || "");
  const week = event?.week || competition?.week || {};

  return {
    id: String(event?.id || competition?.id || `${startMs}-${homeId}-${awayId}`),
    startTimestamp: Math.floor(startMs / 1000),
    status: completed ? "finished" : (state === "in" ? "inprogress" : "notstarted"),
    statusDescription: statusType?.shortDetail || statusType?.detail || statusType?.description || (completed ? "Finale" : "Da giocare"),
    competition: leagueName,
    round: week?.number ? `Giornata ${week.number}` : (week?.text || ""),
    homeTeam: espnTeamName(home, "Casa"),
    awayTeam: espnTeamName(away, "Trasferta"),
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeScore: started ? numericScore(home?.score) : null,
    awayScore: started ? numericScore(away?.score) : null,
    venue: competition?.venue?.fullName || competition?.venue?.address?.city || "",
    isHome: homeId === MANTOVA_ESPN_ID
  };
}

async function fetchEspnSchedule(league, name, season = 2026) {
  const response = await fetch(`${ESPN_BASE}/${league}/teams/${MANTOVA_ESPN_ID}/schedule?season=${season}`, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ESPN ${league} ${response.status}`);
  const data = await response.json();
  return (Array.isArray(data?.events) ? data.events : []).map((event) => normalizeEspnMatch(event, name)).filter(Boolean);
}

function romeDateKey(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(Number(timestamp || 0) * 1000));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function loadMantovaMatches() {
  const remoteResults = await Promise.allSettled([
    fetchEspnSchedule("ita.2", "Serie B"),
    fetchEspnSchedule("ita.coppa_italia", "Coppa Italia")
  ]);
  const remote = remoteResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);

  // Unione per data E per id partita: un merge per sola data lascia un
  // duplicato (vecchia data dal fixture imbustato + nuova data da ESPN) ogni
  // volta che una partita viene rinviata. Se ESPN restituisce lo stesso id di
  // un fixture imbustato ma in una data diversa, lo slot alla vecchia data
  // viene rimosso prima di scrivere quello nuovo.
  const byId = new Map();
  const byDate = new Map();
  const upsert = (match) => {
    if (!match?.startTimestamp) return;
    const dateKey = romeDateKey(match.startTimestamp);
    const previousDateKey = byId.get(match.id);
    if (previousDateKey && previousDateKey !== dateKey) byDate.delete(previousDateKey);
    byId.set(match.id, dateKey);
    byDate.set(dateKey, match);
  };
  BUNDLED_MATCHES.forEach(upsert);
  remote.forEach(upsert);

  return {
    source: remote.length ? "Calendario 2026/27 + ESPN live" : "Calendario 2026/27 integrato",
    matches: Array.from(byDate.values()).sort((a, b) => a.startTimestamp - b.startTimestamp)
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("matches") === "1") {
    const result = await loadMantovaMatches();
    return json({
      ok: true,
      team: { espnId: MANTOVA_ESPN_ID, name: "Mantova 1911" },
      source: result.source,
      fetchedAt: new Date().toISOString(),
      matches: result.matches
    }, 200, { "Cache-Control": "no-store, max-age=0" });
  }

  // Diagnostica D1 (elenco tabelle): non pubblica, a differenza del feed
  // partite sopra. Richiede una sessione valida.
  const { response } = await requireAuth(env, request);
  if (response) return response;

  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return json({
      ok: false,
      db: false,
      error: "Binding D1 mancante: collega gk-trainer-db con nome variabile DB."
    }, 500);
  }

  try {
    const tables = await env.DB
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all();

    return json({
      ok: true,
      db: true,
      tables: (tables.results || []).map((row) => row.name)
    });
  } catch (err) {
    return json({
      ok: false,
      db: true,
      error: err?.message || String(err || "errore sconosciuto")
    }, 500);
  }
}
