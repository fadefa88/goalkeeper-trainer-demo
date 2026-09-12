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

function seasonEndYear(value) {
  const text = String(value || "").trim();
  const years = text.match(/\d{2,4}/g) || [];
  if (!years.length) return null;
  const last = years[years.length - 1];
  if (last.length === 4) return Number(last);
  if (last.length === 2) return 2000 + Number(last);
  return null;
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

async function fetchEspnSchedule(league, name, teamEspnId, season = null) {
  const suffix = season ? `?season=${encodeURIComponent(season)}` : "";
  const response = await fetch(`${ESPN_BASE}/${league}/teams/${teamEspnId}/schedule${suffix}`, {
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
  const response = await fetch(`${ESPN_BASE}/${league}/teams?limit=500`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 86400, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ESPN ${league} teams ${response.status}`);
  const data = await response.json();
  const sports = Array.isArray(data?.sports) ? data.sports : [];
  return sports
    .flatMap((sport) => Array.isArray(sport?.leagues) ? sport.leagues : [])
    .flatMap((leagueRow) => Array.isArray(leagueRow?.teams) ? leagueRow.teams : [])
    .map((row) => row?.team || row)
    .filter((team) => team?.id);
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

function bestTeamMatch(club, teams) {
  let best = null;
  for (const team of teams) {
    const score = matchScore(club, team);
    if (!best || score > best.score) best = { team, score };
  }
  return best && best.score >= 80 ? best : null;
}

async function resolveEspnTeamId(club, league) {
  let best = bestTeamMatch(club, await fetchEspnTeams(league));
  if (!best) {
    try { best = bestTeamMatch(club, await fetchEspnTeams("all")); } catch {}
  }
  if (!best) return null;
  return {
    id: String(best.team.id),
    name: best.team.displayName || best.team.shortDisplayName || best.team.name || club?.shortName || club?.officialName || "Squadra"
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

async function fetchBestSchedule(league, name, teamEspnId, seasonEnd) {
  const candidates = [null, seasonEnd, seasonEnd ? seasonEnd - 1 : null]
    .filter((value, index, rows) => value === null || (Number.isFinite(value) && rows.indexOf(value) === index));
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const matches = await fetchEspnSchedule(league, name, teamEspnId, candidate);
      if (matches.length) return matches;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return [];
}

async function loadEspnMatches(teamEspnId, league, leagueName, seasonEnd) {
  const results = await Promise.allSettled([
    fetchBestSchedule(league, leagueName, teamEspnId, seasonEnd),
    fetchBestSchedule("ita.coppa_italia", "Coppa Italia", teamEspnId, seasonEnd)
  ]);
  const remote = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const matches = dedupeMatches(remote);
  if (!matches.length) {
    const reasons = results
      .map((result) => result.status === "rejected" ? result.reason?.message || String(result.reason) : "")
      .filter(Boolean);
    throw new Error(reasons.join("; ") || "ESPN non ha restituito partite per la squadra selezionata");
  }
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
    providerTeamId,
    teamName: pref.club.shortName || pref.club.officialName || matchedName,
    leagueCode: league.code,
    leagueName: league.name,
    seasonEnd: seasonEndYear(pref.season.season)
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

      const result = await loadEspnMatches(source.providerTeamId, source.leagueCode, source.leagueName, source.seasonEnd);
      return json({
        ok: true,
        available: true,
        team: { espnId: source.providerTeamId, name: source.teamName },
        source: result.source,
        season: source.seasonEnd,
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
    const tables = await env.DB.prepare("select name from sqlite_master where type = 'table' order by name").all();
    return json({ ok: true, db: true, tables: (tables.results || []).map((row) => row.name) });
  } catch (err) {
    return json({ ok: false, db: true, error: err?.message || String(err || "errore sconosciuto") }, 500);
  }
}
