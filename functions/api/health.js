import { json, loadClubPreference, requireAuth } from "./_shared.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LEAGUES = {
  "serie a": { code: "ita.1", name: "Serie A" },
  "serie b": { code: "ita.2", name: "Serie B" }
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club|1907|1908|1909|1911|1913|1914|1920)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function leagueForCompetition(value) {
  return LEAGUES[normalizeName(value)] || null;
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

function normalizeEspnMatch(event, leagueName, teamEspnId) {
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
    isHome: homeId === String(teamEspnId)
  };
}

async function fetchEspnSchedule(league, name, teamEspnId, season) {
  const response = await fetch(`${ESPN_BASE}/${league}/teams/${teamEspnId}/schedule?season=${season}`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ESPN ${league} ${response.status}`);
  const data = await response.json();
  return (Array.isArray(data?.events) ? data.events : [])
    .map((event) => normalizeEspnMatch(event, name, teamEspnId))
    .filter(Boolean);
}

async function fetchEspnTeams(league) {
  const response = await fetch(`${ESPN_BASE}/${league}/teams?limit=100`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 86400, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ESPN ${league} teams ${response.status}`);
  const data = await response.json();
  const sports = Array.isArray(data?.sports) ? data.sports : [];
  const rows = sports.flatMap((sport) => Array.isArray(sport?.leagues) ? sport.leagues : [])
    .flatMap((leagueRow) => Array.isArray(leagueRow?.teams) ? leagueRow.teams : [])
    .map((row) => row?.team || row)
    .filter((team) => team?.id);
  return rows;
}

function clubNames(club) {
  return [...new Set([
    club?.officialName,
    club?.shortName,
    ...(Array.isArray(club?.aliases) ? club.aliases : [])
  ].map(normalizeName).filter(Boolean))];
}

function espnNames(team) {
  return [...new Set([
    team?.displayName,
    team?.shortDisplayName,
    team?.name,
    team?.location,
    team?.slug,
    team?.abbreviation
  ].map(normalizeName).filter(Boolean))];
}

function matchScore(club, team) {
  let best = 0;
  for (const target of clubNames(club)) {
    for (const candidate of espnNames(team)) {
      if (target === candidate) best = Math.max(best, 120);
      else if (target.includes(candidate) || candidate.includes(target)) best = Math.max(best, 88);
      else {
        const a = new Set(target.split(" ").filter((x) => x.length > 2));
        const b = new Set(candidate.split(" ").filter((x) => x.length > 2));
        const shared = [...a].filter((x) => b.has(x)).length;
        const denom = Math.max(1, Math.min(a.size, b.size));
        best = Math.max(best, Math.round((shared / denom) * 80));
      }
    }
  }
  return best;
}

async function resolveEspnTeamId(club, league) {
  const teams = await fetchEspnTeams(league);
  let best = null;
  for (const team of teams) {
    const score = matchScore(club, team);
    if (!best || score > best.score) best = { team, score };
  }
  if (!best || best.score < 80) return null;
  return {
    id: String(best.team.id),
    name: best.team.displayName || best.team.shortDisplayName || best.team.name || club?.shortName || club?.officialName || "Squadra",
    score: best.score
  };
}

function dedupeMatches(rows) {
  const byId = new Map();
  for (const match of rows) {
    if (!match?.id || !match?.startTimestamp) continue;
    byId.set(String(match.id), match);
  }
  return [...byId.values()].sort((a, b) => a.startTimestamp - b.startTimestamp);
}

async function loadEspnMatches(teamEspnId, league, leagueName, season) {
  const results = await Promise.allSettled([
    fetchEspnSchedule(league, leagueName, teamEspnId, season),
    fetchEspnSchedule("ita.coppa_italia", "Coppa Italia", teamEspnId, season)
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  if (!fulfilled.length) {
    const reasons = results.map((result) => result.status === "rejected" ? result.reason?.message || String(result.reason) : "").filter(Boolean);
    throw new Error(reasons.join("; ") || "ESPN non disponibile");
  }
  const matches = dedupeMatches(fulfilled.flatMap((result) => result.value || []));
  return { source: "ESPN live", matches };
}

async function explicitEspnSource(env, clubTeamId) {
  if (!clubTeamId) return null;
  const row = await env.DB.prepare(
    "select provider, provider_team_id from club_calendar_sources where club_team_id = ? and active = 1 limit 1"
  ).bind(clubTeamId).first();
  if (!row || row.provider !== "espn" || !row.provider_team_id) return null;
  return String(row.provider_team_id);
}

// Per Serie A e Serie B il calendario è risolto automaticamente dalla
// formazione scelta: categoria -> lega ESPN -> squadra ESPN. Un mapping
// esplicito già presente in club_calendar_sources viene usato solo come ID
// verificato, ma non è più necessario per abilitare il calendario.
async function resolveCalendarSource(env, userId) {
  const pref = await loadClubPreference(env, userId);
  if (!pref?.club || !pref?.clubTeam || !pref?.season) return null;

  const league = leagueForCompetition(pref.season.competition);
  if (!league) return null;

  let providerTeamId = await explicitEspnSource(env, pref.clubTeam.id);
  let matchedName = pref.club.shortName || pref.club.officialName;

  if (!providerTeamId) {
    const resolved = await resolveEspnTeamId(pref.club, league.code);
    if (!resolved) return null;
    providerTeamId = resolved.id;
    matchedName = resolved.name || matchedName;
  }

  return {
    provider: "espn",
    providerTeamId,
    teamName: pref.club.shortName || pref.club.officialName || matchedName,
    leagueCode: league.code,
    leagueName: league.name
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  if (url.searchParams.get("matches") === "1") {
    const { response, user } = await requireAuth(env, request);
    if (response) return response;

    if (!env?.DB || typeof env.DB.prepare !== "function") {
      return json({ ok: true, available: false, matches: [], reason: "Database non disponibile." }, 200, { "Cache-Control": "no-store, max-age=0" });
    }

    try {
      const source = await resolveCalendarSource(env, user.id);
      if (!source) {
        return json({
          ok: true,
          available: false,
          matches: [],
          reason: "Calendario automatico disponibile al momento solo per squadre di Serie A e Serie B."
        }, 200, { "Cache-Control": "no-store, max-age=0" });
      }

      const now = new Date();
      const season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const result = await loadEspnMatches(source.providerTeamId, source.leagueCode, source.leagueName, season);

      return json({
        ok: true,
        available: true,
        team: { espnId: source.providerTeamId, name: source.teamName },
        source: result.source,
        fetchedAt: new Date().toISOString(),
        matches: result.matches
      }, 200, { "Cache-Control": "no-store, max-age=0" });
    } catch (err) {
      return json({
        ok: true,
        available: false,
        matches: [],
        reason: `Calendario momentaneamente non disponibile: ${err?.message || err}`
      }, 200, { "Cache-Control": "no-store, max-age=0" });
    }
  }

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
