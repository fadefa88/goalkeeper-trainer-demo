import { json } from "./_shared.js";

const MANTOVA_TEAM_ID = 2770;
const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";

function pickTeam(event, side) {
  return event?.[`${side}Team`] || event?.[`${side}_team`] || {};
}

function pickScore(event, side) {
  const score = event?.[`${side}Score`] || event?.[`${side}_score`] || {};
  const value = score?.current ?? score?.display ?? null;
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function normalizeMatch(event) {
  const home = pickTeam(event, "home");
  const away = pickTeam(event, "away");
  const tournament = event?.tournament || {};
  const uniqueTournament = tournament?.uniqueTournament || tournament?.unique_tournament || {};
  const roundInfo = event?.roundInfo || event?.round_info || {};
  const venue = event?.venue || {};
  const startTimestamp = Number(event?.startTimestamp ?? event?.start_timestamp ?? 0);
  const status = event?.status || {};

  return {
    id: Number(event?.id),
    startTimestamp,
    status: status?.type || status?.description || "notstarted",
    statusDescription: status?.description || "",
    competition: uniqueTournament?.name || tournament?.name || "Partita",
    round: roundInfo?.round ? `Giornata ${roundInfo.round}` : (roundInfo?.name || ""),
    homeTeam: home?.name || home?.shortName || home?.short_name || "Casa",
    awayTeam: away?.name || away?.shortName || away?.short_name || "Trasferta",
    homeTeamId: Number(home?.id || 0),
    awayTeamId: Number(away?.id || 0),
    homeScore: pickScore(event, "home"),
    awayScore: pickScore(event, "away"),
    venue: venue?.stadium?.name || venue?.name || venue?.city?.name || "",
    isHome: Number(home?.id || 0) === MANTOVA_TEAM_ID
  };
}

async function fetchFixturePage(direction, page) {
  const response = await fetch(`${SOFASCORE_BASE}/team/${MANTOVA_TEAM_ID}/events/${direction}/${page}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "GK-Trainer/1.0"
    },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`Sofascore ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.events) ? data.events : [];
}

async function loadMantovaMatches() {
  const requests = [
    fetchFixturePage("last", 0),
    fetchFixturePage("last", 1),
    fetchFixturePage("next", 0),
    fetchFixturePage("next", 1)
  ];
  const results = await Promise.allSettled(requests);
  const events = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!events.length) throw new Error("Calendario Mantova non disponibile");

  const byId = new Map();
  events.forEach((event) => {
    const match = normalizeMatch(event);
    if (!match.id || !match.startTimestamp) return;
    if (match.homeTeamId !== MANTOVA_TEAM_ID && match.awayTeamId !== MANTOVA_TEAM_ID) return;
    byId.set(match.id, match);
  });

  return Array.from(byId.values()).sort((a, b) => a.startTimestamp - b.startTimestamp);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("matches") === "1") {
    try {
      const matches = await loadMantovaMatches();
      return json({
        ok: true,
        team: { id: MANTOVA_TEAM_ID, name: "Mantova" },
        source: "Sofascore",
        fetchedAt: new Date().toISOString(),
        matches
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
