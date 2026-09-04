import { json } from "./_shared.js";

const MANTOVA_ESPN_ID = "3991";
const MANTOVA_SOFASCORE_ID = 2770;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";

function currentSeasonYear() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

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
  if (!home?.team && !home?.id) return null;
  if (!away?.team && !away?.id) return null;

  const rawDate = competition?.date || event?.date || "";
  const startMs = Date.parse(rawDate);
  if (!Number.isFinite(startMs)) return null;

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

async function fetchEspnSchedule(league, name, season) {
  const response = await fetch(`${ESPN_BASE}/${league}/teams/${MANTOVA_ESPN_ID}/schedule?season=${season}`, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ESPN ${league} ${response.status}`);
  const data = await response.json();
  const events = Array.isArray(data?.events) ? data.events : [];
  return events.map((event) => normalizeEspnMatch(event, name)).filter(Boolean);
}

function pickSofascoreTeam(event, side) {
  return event?.[`${side}Team`] || event?.[`${side}_team`] || {};
}

function pickSofascoreScore(event, side) {
  const score = event?.[`${side}Score`] || event?.[`${side}_score`] || {};
  return numericScore(score?.current ?? score?.display ?? null);
}

function normalizeSofascoreMatch(event) {
  const home = pickSofascoreTeam(event, "home");
  const away = pickSofascoreTeam(event, "away");
  const tournament = event?.tournament || {};
  const uniqueTournament = tournament?.uniqueTournament || tournament?.unique_tournament || {};
  const roundInfo = event?.roundInfo || event?.round_info || {};
  const venue = event?.venue || {};
  const startTimestamp = Number(event?.startTimestamp ?? event?.start_timestamp ?? 0);
  const status = event?.status || {};

  return {
    id: String(event?.id || ""),
    startTimestamp,
    status: status?.type || status?.description || "notstarted",
    statusDescription: status?.description || "",
    competition: uniqueTournament?.name || tournament?.name || "Partita",
    round: roundInfo?.round ? `Giornata ${roundInfo.round}` : (roundInfo?.name || ""),
    homeTeam: home?.name || home?.shortName || home?.short_name || "Casa",
    awayTeam: away?.name || away?.shortName || away?.short_name || "Trasferta",
    homeTeamId: String(home?.id || ""),
    awayTeamId: String(away?.id || ""),
    homeScore: pickSofascoreScore(event, "home"),
    awayScore: pickSofascoreScore(event, "away"),
    venue: venue?.stadium?.name || venue?.name || venue?.city?.name || "",
    isHome: Number(home?.id || 0) === MANTOVA_SOFASCORE_ID
  };
}

async function fetchSofascoreFixturePage(direction, page) {
  const response = await fetch(`${SOFASCORE_BASE}/team/${MANTOVA_SOFASCORE_ID}/events/${direction}/${page}`, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`Sofascore ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.events) ? data.events : [];
}

async function loadSofascoreFallback() {
  const results = await Promise.allSettled([
    fetchSofascoreFixturePage("last", 0),
    fetchSofascoreFixturePage("next", 0)
  ]);
  return results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .map(normalizeSofascoreMatch)
    .filter((match) => match.id && match.startTimestamp && (
      Number(match.homeTeamId) === MANTOVA_SOFASCORE_ID || Number(match.awayTeamId) === MANTOVA_SOFASCORE_ID
    ));
}

async function loadMantovaMatches() {
  const season = currentSeasonYear();
  const espnResults = await Promise.allSettled([
    fetchEspnSchedule("ita.2", "Serie B", season),
    fetchEspnSchedule("ita.coppa_italia", "Coppa Italia", season)
  ]);

  let source = "ESPN";
  let events = espnResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);

  if (!events.length) {
    source = "Sofascore fallback";
    events = await loadSofascoreFallback();
  }

  if (!events.length) {
    const errors = espnResults
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || String(result.reason || ""))
      .filter(Boolean)
      .join("; ");
    throw new Error(errors || "Calendario Mantova non disponibile");
  }

  const byKey = new Map();
  events.forEach((match) => {
    if (!match?.id || !match?.startTimestamp) return;
    const key = `${match.startTimestamp}-${match.homeTeam}-${match.awayTeam}`;
    byKey.set(key, match);
  });

  return {
    source,
    matches: Array.from(byKey.values()).sort((a, b) => a.startTimestamp - b.startTimestamp)
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("matches") === "1") {
    try {
      const result = await loadMantovaMatches();
      return json({
        ok: true,
        team: { espnId: MANTOVA_ESPN_ID, sofascoreId: MANTOVA_SOFASCORE_ID, name: "Mantova" },
        source: result.source,
        fetchedAt: new Date().toISOString(),
        matches: result.matches
      }, 200, { "Cache-Control": "public, max-age=300" });
    } catch (err) {
      return json({
        ok: false,
        matches: [],
        error: err?.message || "Partite prima squadra non disponibili"
      }, 502, { "Cache-Control": "no-store" });
    }
  }

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
