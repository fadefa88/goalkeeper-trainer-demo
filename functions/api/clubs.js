// Ricerca nel catalogo società (backend), usata dallo step "Scegli la tua
// squadra" del wizard. Nessuna chiamata a provider esterni per carattere
// digitato: il catalogo vive in D1 (clubs/club_teams/...), sincronizzato a
// parte da functions/api/admin/clubs-import.js. Richiede una sessione
// valida (stesso motivo di profile.js/sessions.js: nessuna superficie
// pubblica non necessaria), ma il catalogo stesso è condiviso fra tutti gli
// account, non una risorsa privata del cliente.
import {
  error,
  json,
  mapClub,
  mapClubTeam,
  mapClubTeamSeason,
  normalizeSearchText,
  requireAuth
} from "./_shared.js";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export async function onRequestGet({ request, env }) {
  try {
    const { response, user } = await requireAuth(env, request);
    if (response) return response;
    if (!env?.DB || typeof env.DB.prepare !== "function") {
      return error("Binding D1 mancante: collega il database gk-trainer-db con nome variabile DB.", 500);
    }

    const url = new URL(request.url);
    const q = normalizeSearchText(url.searchParams.get("q") || "");
    const region = String(url.searchParams.get("region") || "").trim();
    const discipline = String(url.searchParams.get("discipline") || "").trim();
    const category = normalizeSearchText(url.searchParams.get("category") || "");
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    // Filtro per categoria: solo le formazioni con una club_team_seasons
    // verificata la soddisfano. Una società senza stagione registrata non
    // sparisce dalla ricerca semplice (query senza filtro categoria), ma
    // non compare quando l'utente filtra esplicitamente per categoria: non
    // possiamo affermare "gioca in questa categoria" senza un dato verificato.
    const clauses = [];
    const binds = [];
    if (q) {
      clauses.push("c.search_key like ?");
      binds.push(`%${q}%`);
    }
    if (region) {
      clauses.push("(c.region = ? or c.province = ?)");
      binds.push(region, region);
    }
    if (discipline) {
      clauses.push("ct.discipline = ?");
      binds.push(discipline);
    }
    if (category) {
      clauses.push("cts.id is not null and lower(cts.competition) like ?");
      binds.push(`%${category}%`);
    }

    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const sql = `
      select
        c.id as club_id, c.official_name, c.short_name, c.aliases, c.city, c.region, c.province,
        c.color_primary, c.color_secondary, c.colors_source, c.colors_note, c.colors_verified_at, c.data_source,
        ct.id as team_id, ct.team_type, ct.discipline, ct.gender, ct.age_group, ct.label,
        cts.season, cts.competition, cts.group_name, cts.territory, cts.data_source as season_source, cts.verified_at as season_verified_at,
        (select count(*) from club_calendar_sources where club_team_id = ct.id and active = 1) as calendar_count
      from clubs c
      join club_teams ct on ct.club_id = c.id
      left join club_team_seasons cts on cts.club_team_id = ct.id and cts.season = (
        select max(season) from club_team_seasons where club_team_id = ct.id
      )
      ${where}
      order by c.official_name asc, ct.team_type asc
      limit ? offset ?
    `;
    const rows = await env.DB.prepare(sql).bind(...binds, limit + 1, offset).all();
    const results = (rows.results || []).slice(0, limit).map((row) => ({
      club: mapClub({
        id: row.club_id, official_name: row.official_name, short_name: row.short_name, aliases: row.aliases,
        city: row.city, region: row.region, province: row.province, color_primary: row.color_primary,
        color_secondary: row.color_secondary, colors_source: row.colors_source, colors_note: row.colors_note,
        colors_verified_at: row.colors_verified_at, data_source: row.data_source
      }),
      team: mapClubTeam({
        id: row.team_id, club_id: row.club_id, team_type: row.team_type, discipline: row.discipline,
        gender: row.gender, age_group: row.age_group, label: row.label
      }),
      season: row.season ? mapClubTeamSeason({
        season: row.season, competition: row.competition, group_name: row.group_name, territory: row.territory,
        data_source: row.season_source, verified_at: row.season_verified_at
      }) : null,
      calendarAvailable: Number(row.calendar_count || 0) > 0
    }));

    return json({
      ok: true,
      results,
      hasMore: (rows.results || []).length > limit,
      nextOffset: offset + limit
    });
  } catch (err) {
    console.error("clubs search failed", err);
    return error(`Errore ricerca società: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}
