// Importatore ripetibile del catalogo società (backend). Pensato per essere
// chiamato da scripts/import-clubs.mjs con un file CSV/JSON locale, MAI dal
// client durante l'uso dell'app: la ricerca nel wizard (functions/api/clubs.js)
// legge solo D1, non chiama mai questo endpoint né un provider esterno.
import {
  buildClubSearchKey,
  error,
  json,
  normalizeHexColor,
  readJson,
  slugify
} from "../_shared.js";

const TEAM_TYPES = ["prima_squadra", "giovanile", "altra"];
const DISCIPLINES = ["calcio11", "calcio5"];
const GENDERS = ["maschile", "femminile"];
const COLORS_SOURCES = ["official", "documented", "adapted", "unknown"];

function checkAdminToken(request, env) {
  const configured = env?.ADMIN_IMPORT_TOKEN || "";
  if (!configured) return error("Import disattivato: imposta la variabile d'ambiente ADMIN_IMPORT_TOKEN su Cloudflare Pages.", 503);
  const provided = request.headers.get("X-Admin-Token") || "";
  if (provided !== configured) return error("Token amministrativo non valido", 401);
  return null;
}

function teamNaturalKey(team) {
  return [team.teamType, team.discipline, team.gender || "", team.ageGroup || ""].join("|");
}

function defaultTeam() {
  return { teamType: "prima_squadra", discipline: "calcio11", gender: "maschile", ageGroup: null, label: null };
}

async function ensureCalendarSchema(env) {
  await env.DB.prepare(`
    create table if not exists club_matches (
      id text primary key,
      club_team_id text not null references club_teams(id) on delete cascade,
      season text not null,
      competition text not null,
      provider text not null,
      provider_match_id text not null,
      start_timestamp integer not null,
      status text not null default 'notstarted',
      status_description text,
      round_name text,
      home_team text not null,
      away_team text not null,
      home_score real,
      away_score real,
      venue text,
      is_home integer not null default 0,
      data_source text,
      verified_at text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      unique(club_team_id, provider, provider_match_id)
    )
  `).run();
  await env.DB.prepare("create index if not exists club_matches_team_season_idx on club_matches(club_team_id, season, start_timestamp)").run();
}

function normalizeMatch(raw) {
  const season = String(raw?.season || "").trim().slice(0, 20);
  const competition = String(raw?.competition || "").trim().slice(0, 80);
  const provider = String(raw?.provider || "diretta").trim().toLowerCase().slice(0, 40);
  const providerMatchId = String(raw?.providerMatchId || raw?.id || "").trim().slice(0, 160);
  const startTimestamp = Math.floor(Number(raw?.startTimestamp || 0));
  const homeTeam = String(raw?.homeTeam || "").trim().slice(0, 160);
  const awayTeam = String(raw?.awayTeam || "").trim().slice(0, 160);
  if (!season || !competition || !provider || !providerMatchId || !startTimestamp || !homeTeam || !awayTeam) return null;

  const score = value => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return {
    season,
    competition,
    provider,
    providerMatchId,
    startTimestamp,
    status: String(raw?.status || "notstarted").trim().slice(0, 30) || "notstarted",
    statusDescription: raw?.statusDescription ? String(raw.statusDescription).trim().slice(0, 120) : null,
    roundName: raw?.round ? String(raw.round).trim().slice(0, 120) : null,
    homeTeam,
    awayTeam,
    homeScore: score(raw?.homeScore),
    awayScore: score(raw?.awayScore),
    venue: raw?.venue ? String(raw.venue).trim().slice(0, 160) : null,
    isHome: raw?.isHome ? 1 : 0,
    dataSource: raw?.dataSource ? String(raw.dataSource).trim().slice(0, 160) : null,
    verifiedAt: raw?.verifiedAt ? String(raw.verifiedAt).trim().slice(0, 40) : null
  };
}

async function syncTeamMatches(env, teamId, rawMatches, dryRun, warnings) {
  if (!Array.isArray(rawMatches) || !rawMatches.length) return 0;
  const matches = [];
  for (const raw of rawMatches) {
    const match = normalizeMatch(raw);
    if (!match) {
      warnings.push(`partita incompleta ignorata per team ${teamId}`);
      continue;
    }
    matches.push(match);
  }
  if (!matches.length || dryRun) return matches.length;

  const groups = new Map();
  for (const match of matches) {
    const key = `${match.season}|${match.provider}`;
    if (!groups.has(key)) groups.set(key, { season: match.season, provider: match.provider });
  }

  const statements = [];
  for (const group of groups.values()) {
    statements.push(env.DB.prepare("delete from club_matches where club_team_id = ? and season = ? and provider = ?")
      .bind(teamId, group.season, group.provider));
  }
  const now = new Date().toISOString();
  for (const match of matches) {
    statements.push(env.DB.prepare(`
      insert into club_matches (
        id, club_team_id, season, competition, provider, provider_match_id,
        start_timestamp, status, status_description, round_name, home_team, away_team,
        home_score, away_score, venue, is_home, data_source, verified_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(club_team_id, provider, provider_match_id) do update set
        season=excluded.season, competition=excluded.competition, start_timestamp=excluded.start_timestamp,
        status=excluded.status, status_description=excluded.status_description, round_name=excluded.round_name,
        home_team=excluded.home_team, away_team=excluded.away_team, home_score=excluded.home_score,
        away_score=excluded.away_score, venue=excluded.venue, is_home=excluded.is_home,
        data_source=excluded.data_source, verified_at=excluded.verified_at, updated_at=excluded.updated_at
    `).bind(
      crypto.randomUUID(), teamId, match.season, match.competition, match.provider, match.providerMatchId,
      match.startTimestamp, match.status, match.statusDescription, match.roundName, match.homeTeam, match.awayTeam,
      match.homeScore, match.awayScore, match.venue, match.isHome, match.dataSource, match.verifiedAt, now, now
    ));
  }
  await env.DB.batch(statements);
  return matches.length;
}

async function importRow(env, row, dryRun) {
  const officialName = String(row.officialName || "").trim().slice(0, 160);
  if (!officialName) return { id: row.id || null, action: "error", message: "officialName mancante" };

  const id = row.id ? slugify(row.id) : slugify(`${officialName}-${row.city || ""}`);
  const aliases = Array.isArray(row.aliases) ? row.aliases.filter((a) => typeof a === "string" && a.trim()).slice(0, 20) : [];
  const shortName = row.shortName ? String(row.shortName).trim().slice(0, 80) : null;
  const city = row.city ? String(row.city).trim().slice(0, 80) : null;
  const region = row.region ? String(row.region).trim().slice(0, 80) : null;
  const province = row.province ? String(row.province).trim().slice(0, 10) : null;
  const colorsSource = COLORS_SOURCES.includes(row.colorsSource) ? row.colorsSource : "unknown";
  const colorPrimary = row.colorPrimary ? normalizeHexColor(row.colorPrimary) : null;
  const colorSecondary = row.colorSecondary ? normalizeHexColor(row.colorSecondary) : null;
  if (row.colorPrimary && !colorPrimary) return { id, action: "error", message: `colorPrimary non valido: ${row.colorPrimary}` };
  if (row.colorSecondary && !colorSecondary) return { id, action: "error", message: `colorSecondary non valido: ${row.colorSecondary}` };
  const colorsNote = row.colorsNote ? String(row.colorsNote).trim().slice(0, 300) : null;
  const colorsVerifiedAt = row.colorsVerifiedAt ? String(row.colorsVerifiedAt).trim().slice(0, 40) : null;
  const dataSource = row.dataSource ? String(row.dataSource).trim().slice(0, 160) : null;
  const lockedFields = Array.isArray(row.lockedFields) ? row.lockedFields.filter((f) => typeof f === "string") : [];
  const searchKey = buildClubSearchKey({ officialName, shortName, aliases, city });
  const now = new Date().toISOString();

  const existing = await env.DB.prepare("select * from clubs where id = ?").bind(id).first();
  const locked = new Set(existing?.locked_fields ? JSON.parse(existing.locked_fields) : []);
  const finalRow = {
    official_name: locked.has("official_name") ? existing.official_name : officialName,
    short_name: locked.has("short_name") ? existing.short_name : shortName,
    aliases: locked.has("aliases") ? existing.aliases : JSON.stringify(aliases),
    city: locked.has("city") ? existing.city : city,
    region: locked.has("region") ? existing.region : region,
    province: locked.has("province") ? existing.province : province,
    color_primary: locked.has("color_primary") ? existing.color_primary : colorPrimary,
    color_secondary: locked.has("color_secondary") ? existing.color_secondary : colorSecondary,
    colors_source: locked.has("colors_source") ? existing.colors_source : colorsSource,
    colors_note: locked.has("colors_note") ? existing.colors_note : colorsNote,
    colors_verified_at: locked.has("colors_verified_at") ? existing.colors_verified_at : colorsVerifiedAt,
    data_source: locked.has("data_source") ? existing.data_source : dataSource,
    locked_fields: JSON.stringify(lockedFields.length ? lockedFields : Array.from(locked))
  };
  finalRow.search_key = locked.has("official_name") || locked.has("aliases") || locked.has("short_name") || locked.has("city")
    ? buildClubSearchKey({ officialName: finalRow.official_name, shortName: finalRow.short_name, aliases: JSON.parse(finalRow.aliases || "[]"), city: finalRow.city })
    : searchKey;

  const warnings = [];
  if (!dryRun) {
    if (existing) {
      await env.DB.prepare(`
        update clubs set official_name=?, short_name=?, aliases=?, city=?, region=?, province=?, search_key=?,
          color_primary=?, color_secondary=?, colors_source=?, colors_note=?, colors_verified_at=?, data_source=?,
          locked_fields=?, updated_at=? where id=?
      `).bind(
        finalRow.official_name, finalRow.short_name, finalRow.aliases, finalRow.city, finalRow.region, finalRow.province,
        finalRow.search_key, finalRow.color_primary, finalRow.color_secondary, finalRow.colors_source, finalRow.colors_note,
        finalRow.colors_verified_at, finalRow.data_source, finalRow.locked_fields, now, id
      ).run();
    } else {
      await env.DB.prepare(`
        insert into clubs (id, official_name, short_name, aliases, city, region, province, search_key,
          color_primary, color_secondary, colors_source, colors_note, colors_verified_at, data_source,
          locked_fields, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, finalRow.official_name, finalRow.short_name, finalRow.aliases, finalRow.city, finalRow.region, finalRow.province,
        finalRow.search_key, finalRow.color_primary, finalRow.color_secondary, finalRow.colors_source, finalRow.colors_note,
        finalRow.colors_verified_at, finalRow.data_source, finalRow.locked_fields, now, now
      ).run();
    }
  }

  const teams = Array.isArray(row.teams) && row.teams.length ? row.teams : [defaultTeam()];
  const teamIds = [];
  let importedMatches = 0;
  for (const rawTeam of teams) {
    const teamType = TEAM_TYPES.includes(rawTeam.teamType) ? rawTeam.teamType : "prima_squadra";
    const discipline = DISCIPLINES.includes(rawTeam.discipline) ? rawTeam.discipline : "calcio11";
    const gender = GENDERS.includes(rawTeam.gender) ? rawTeam.gender : null;
    const ageGroup = rawTeam.ageGroup ? String(rawTeam.ageGroup).trim().slice(0, 40) : null;
    const label = rawTeam.label ? String(rawTeam.label).trim().slice(0, 120) : null;
    const teamId = rawTeam.id ? slugify(rawTeam.id) : slugify(`${id}-${teamNaturalKey({ teamType, discipline, gender, ageGroup })}`);
    teamIds.push({ id: teamId, teamType, discipline, gender, ageGroup, raw: rawTeam });

    if (!dryRun) {
      const existingTeam = await env.DB.prepare("select id from club_teams where id = ?").bind(teamId).first();
      if (existingTeam) {
        await env.DB.prepare("update club_teams set team_type=?, discipline=?, gender=?, age_group=?, label=?, updated_at=? where id=?")
          .bind(teamType, discipline, gender, ageGroup, label, now, teamId).run();
      } else {
        await env.DB.prepare("insert into club_teams (id, club_id, team_type, discipline, gender, age_group, label, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(teamId, id, teamType, discipline, gender, ageGroup, label, now, now).run();
      }
    }

    for (const s of Array.isArray(rawTeam.seasons) ? rawTeam.seasons : []) {
      const season = String(s.season || "").trim();
      if (!season) { warnings.push(`stagione senza campo "season" ignorata per team ${teamId}`); continue; }
      if (!dryRun) {
        await env.DB.prepare(`
          insert into club_team_seasons (id, club_team_id, season, competition, group_name, territory, data_source, verified_at, created_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(club_team_id, season) do update set competition=excluded.competition, group_name=excluded.group_name,
            territory=excluded.territory, data_source=excluded.data_source, verified_at=excluded.verified_at
        `).bind(crypto.randomUUID(), teamId, season, s.competition || null, s.groupName || null, s.territory || null, s.dataSource || null, s.verifiedAt || null, now).run();
      }
    }

    for (const cal of Array.isArray(rawTeam.calendarSources) ? rawTeam.calendarSources : []) {
      if (!cal.provider || !cal.providerTeamId) { warnings.push(`calendarSource incompleto ignorato per team ${teamId}`); continue; }
      if (!dryRun) {
        await env.DB.prepare(`
          insert into club_calendar_sources (id, club_team_id, provider, provider_team_id, active, created_at)
          values (?, ?, ?, ?, ?, ?)
          on conflict(club_team_id, provider) do update set provider_team_id=excluded.provider_team_id, active=excluded.active
        `).bind(crypto.randomUUID(), teamId, cal.provider, String(cal.providerTeamId), cal.active === false ? 0 : 1, now).run();
      }
    }

    importedMatches += await syncTeamMatches(env, teamId, rawTeam.matches, dryRun, warnings);
  }

  for (const p of Array.isArray(row.providerIds) ? row.providerIds : []) {
    if (!p.provider || !p.providerId) { warnings.push("providerId incompleto ignorato"); continue; }
    const conflict = await env.DB.prepare("select club_id from club_provider_ids where provider = ? and provider_id = ?").bind(p.provider, String(p.providerId)).first();
    if (conflict && conflict.club_id !== id) {
      warnings.push(`provider_id ${p.provider}:${p.providerId} è già associato a un'altra società (${conflict.club_id}); non riassegnato automaticamente`);
      continue;
    }
    if (!dryRun && !conflict) {
      await env.DB.prepare("insert into club_provider_ids (id, club_id, provider, provider_id, created_at) values (?, ?, ?, ?, ?")
        .bind(crypto.randomUUID(), id, p.provider, String(p.providerId), now).run();
    }
  }

  return { id, action: existing ? "updated" : "created", teams: teamIds.map((t) => t.id), matches: importedMatches, warnings };
}

export async function onRequestPost({ request, env }) {
  try {
    const tokenError = checkAdminToken(request, env);
    if (tokenError) return tokenError;
    if (!env?.DB || typeof env.DB.prepare !== "function") {
      return error("Binding D1 mancante: collega il database gk-trainer-db con nome variabile DB.", 500);
    }

    const body = await readJson(request);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return error("Nessuna riga da importare (body.rows vuoto)", 400);
    if (rows.length > 500) return error("Troppe righe in un solo import (max 500): dividi il file", 400);
    const dryRun = Boolean(body.dryRun);
    if (!dryRun) await ensureCalendarSchema(env);

    const results = [];
    for (const row of rows) {
      try {
        results.push(await importRow(env, row, dryRun));
      } catch (err) {
        results.push({ id: row.id || row.officialName || null, action: "error", message: err?.message || String(err) });
      }
    }

    const summary = results.reduce((acc, r) => { acc[r.action] = (acc[r.action] || 0) + 1; return acc; }, {});
    summary.matches = results.reduce((sum, r) => sum + Number(r.matches || 0), 0);
    return json({ ok: true, dryRun, summary, results });
  } catch (err) {
    console.error("clubs-import failed", err);
    return error(`Errore import catalogo: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}
