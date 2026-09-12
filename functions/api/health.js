import { json, loadClubPreference, requireAuth } from "./_shared.js";

function normalizeCompetition(value) {
  return String(value || "").trim().toLowerCase();
}

function calendarSupported(pref) {
  const competition = normalizeCompetition(pref?.season?.competition);
  return competition === "serie a" || competition === "serie b" || competition === "serie c";
}

function mapMatch(row) {
  return {
    id: String(row.provider_match_id || row.id),
    startTimestamp: Number(row.start_timestamp || 0),
    status: row.status || "notstarted",
    statusDescription: row.status_description || (row.status === "finished" ? "Finale" : "Da giocare"),
    competition: row.competition || "Prima squadra",
    round: row.round_name || "",
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeTeamId: "",
    awayTeamId: "",
    homeScore: row.home_score === null || row.home_score === undefined ? null : Number(row.home_score),
    awayScore: row.away_score === null || row.away_score === undefined ? null : Number(row.away_score),
    venue: row.venue || "",
    isHome: Boolean(row.is_home)
  };
}

async function loadStoredMatches(env, userId) {
  const pref = await loadClubPreference(env, userId);
  if (!pref?.club || !pref?.clubTeam || !pref?.season || !calendarSupported(pref)) {
    return {
      available: false,
      reason: "Calendario automatico disponibile al momento per squadre di Serie A, Serie B e Serie C.",
      preference: pref,
      matches: []
    };
  }

  try {
    const rows = await env.DB.prepare(`
      select * from club_matches
      where club_team_id = ? and season = ?
      order by start_timestamp asc
    `).bind(pref.clubTeam.id, pref.season.season).all();

    const matches = (rows.results || []).map(mapMatch).filter(match => match.startTimestamp > 0);
    if (!matches.length) {
      return {
        available: false,
        reason: "Calendario non ancora sincronizzato per questa squadra. Esegui la Action di aggiornamento club con import D1 abilitato.",
        preference: pref,
        matches: []
      };
    }

    return { available: true, preference: pref, matches };
  } catch (err) {
    if (/no such table:\s*club_matches/i.test(String(err?.message || err))) {
      return {
        available: false,
        reason: "Calendario D1 non ancora inizializzato. Esegui una volta la Action di aggiornamento club con import D1 abilitato.",
        preference: pref,
        matches: []
      };
    }
    throw err;
  }
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
      const result = await loadStoredMatches(env, user.id);
      const pref = result.preference;
      return json({
        ok: true,
        available: result.available,
        reason: result.available ? null : result.reason,
        team: pref?.club ? { id: pref.club.id, name: pref.club.shortName || pref.club.officialName || "Squadra" } : null,
        source: result.available ? "Fonti ufficiali + Diretta.it · sincronizzato in D1" : null,
        season: pref?.season?.season || null,
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
