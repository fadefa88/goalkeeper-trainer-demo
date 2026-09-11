// Preferenza squadra/tema dell'account: GET legge, PUT salva per intero
// (stesso pattern di profile.js: il client manda lo stato desiderato
// completo, il server lo valida e risponde con lo stato salvato davvero,
// mai un "ok" ottimistico prima di sapere se la scrittura è riuscita).
import {
  assertSameOrigin,
  error,
  isValidHexColor,
  json,
  loadClubPreference,
  normalizeHexColor,
  readJson,
  requireAuth
} from "./_shared.js";

export async function onRequestGet({ request, env }) {
  try {
    const { response, user } = await requireAuth(env, request);
    if (response) return response;
    return json({ preference: await loadClubPreference(env, user.id) });
  } catch (err) {
    console.error("club-preference GET failed", err);
    return error(`Errore lettura preferenza squadra: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const { response, user } = await requireAuth(env, request);
    if (response) return response;

    if (!env?.DB || typeof env.DB.prepare !== "function") {
      return error("Binding D1 mancante: collega il database gk-trainer-db con nome variabile DB.", 500);
    }

    const body = await readJson(request);
    const themeMode = ["club", "custom", "neutral"].includes(body.themeMode) ? body.themeMode : "neutral";

    let clubId = null;
    let clubTeamId = null;
    if (themeMode === "club") {
      clubId = String(body.clubId || "").trim() || null;
      clubTeamId = String(body.clubTeamId || "").trim() || null;
      if (!clubId) return error("Seleziona una società dal catalogo", 400);
      const club = await env.DB.prepare("select id from clubs where id = ?").bind(clubId).first();
      if (!club) return error("Società non trovata nel catalogo", 404);
      if (clubTeamId) {
        const team = await env.DB.prepare("select id from club_teams where id = ? and club_id = ?").bind(clubTeamId, clubId).first();
        if (!team) return error("Formazione non trovata per questa società", 404);
      }
    }

    let customClubName = null;
    let customCity = null;
    let customTeamLabel = null;
    if (themeMode === "custom") {
      customClubName = String(body.customClubName || "").trim().slice(0, 120);
      if (!customClubName) return error("Inserisci il nome della squadra", 400);
      customCity = String(body.customCity || "").trim().slice(0, 120) || null;
      customTeamLabel = String(body.customTeamLabel || "").trim().slice(0, 120) || null;
    }

    let colorPrimary = null;
    let colorSecondary = null;
    const useCustomColors = Boolean(body.useCustomColors) || themeMode === "custom";
    if (useCustomColors) {
      if (body.colorPrimary !== null && body.colorPrimary !== undefined && body.colorPrimary !== "") {
        if (!isValidHexColor(body.colorPrimary)) return error("Colore primario non valido (usa un esadecimale #rrggbb)", 400);
        colorPrimary = normalizeHexColor(body.colorPrimary);
      }
      if (body.colorSecondary !== null && body.colorSecondary !== undefined && body.colorSecondary !== "") {
        if (!isValidHexColor(body.colorSecondary)) return error("Colore secondario non valido (usa un esadecimale #rrggbb)", 400);
        colorSecondary = normalizeHexColor(body.colorSecondary);
      }
      // Un cliente in modalità "custom" senza aver ancora scelto colori non
      // deve bloccare il salvataggio: userà il tema neutro finché non ne
      // sceglie due (vedi wizard, "non trovo la mia squadra").
    }

    const teamStepDone = Boolean(body.teamStepDone);
    const now = new Date().toISOString();

    await env.DB.prepare(`
      insert into user_club_preferences (
        user_id, club_id, club_team_id, custom_club_name, custom_city, custom_team_label,
        color_primary, color_secondary, use_custom_colors, theme_mode, team_step_done, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(user_id) do update set
        club_id = excluded.club_id,
        club_team_id = excluded.club_team_id,
        custom_club_name = excluded.custom_club_name,
        custom_city = excluded.custom_city,
        custom_team_label = excluded.custom_team_label,
        color_primary = excluded.color_primary,
        color_secondary = excluded.color_secondary,
        use_custom_colors = excluded.use_custom_colors,
        theme_mode = excluded.theme_mode,
        team_step_done = excluded.team_step_done,
        updated_at = excluded.updated_at
    `).bind(
      user.id, clubId, clubTeamId, customClubName, customCity, customTeamLabel,
      colorPrimary, colorSecondary, useCustomColors ? 1 : 0, themeMode, teamStepDone ? 1 : 0, now
    ).run();

    return json({ preference: await loadClubPreference(env, user.id) });
  } catch (err) {
    console.error("club-preference PUT failed", err);
    return error(`Errore salvataggio preferenza squadra: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}
