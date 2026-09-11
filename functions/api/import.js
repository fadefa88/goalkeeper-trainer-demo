import { assertSameOrigin, buildProfileExtraInsertStatements, error, isValidHexColor, json, normalizeHexColor, readJson, requireAuth } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const profile = body.profile;
  const history = Array.isArray(body.history) ? body.history : [];
  if (!profile) return error("JSON senza profilo", 400);

  const sport = profile.sportType || profile.sport || "calcio";
  const level = profile.level || "medio";
  const now = new Date().toISOString();

  // Tutte le scritture in un solo env.DB.batch(): un errore a metà non lascia
  // più l'account con dati cancellati ma non ancora reimportati.
  const statements = [
    env.DB.prepare("delete from training_sessions where user_id = ?").bind(user.id),
    env.DB.prepare("delete from keepers where user_id = ?").bind(user.id),
    env.DB.prepare("delete from user_settings where user_id = ?").bind(user.id),
    env.DB.prepare("insert into user_settings (user_id, keepers_count, sport, level, sessions_per_week, session_duration, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(user.id, Number(profile.keepersCount || 3), sport, level, Number(profile.sessionsPerWeek || 2), Number(profile.sessionDuration || 60), now, now)
  ];

  const keeperNameToId = new Map();
  const keepers = Array.isArray(profile.keepers) ? profile.keepers : [];
  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i];
    const id = crypto.randomUUID();
    const name = keeper.name || `Portiere ${i + 1}`;
    keeperNameToId.set(name, id);
    statements.push(env.DB.prepare("insert into keepers (id, user_id, name, height_cm, weight_kg, sport, level, standing_broad_jump_cm, standing_vertical_jump_cm, standing_half_height_jump_cm, two_posts_test_sec, display_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, user.id, name, keeper.height ?? keeper.height_cm ?? null, keeper.weight ?? keeper.weight_kg ?? null, sport, level, keeper.broadJump ?? keeper.standing_broad_jump_cm ?? null, keeper.verticalJump ?? keeper.standing_vertical_jump_cm ?? null, keeper.halfHeightJump ?? keeper.standing_half_height_jump_cm ?? null, keeper.twoPostsTest ?? keeper.two_posts_test_sec ?? null, i, now, now));
  }

  for (const item of history) {
    statements.push(env.DB.prepare("insert into training_sessions (id, user_id, keeper_id, keeper_name, exercise_id, exercise_name, session_date, planned_minutes, saves, mistakes, reactions, category, source_page, sport, level, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(
        crypto.randomUUID(),
        user.id,
        keeperNameToId.get(item.keeper || item.keeper_name) || null,
        item.keeper || item.keeper_name || null,
        item.exerciseId || item.exercise_id || "exercise",
        item.exerciseName || item.exercise_name || "Esercizio",
        item.sessionDate || item.session_date || new Date().toISOString().slice(0, 10),
        item.plannedMinutes || item.planned_minutes || null,
        Number(item.saves || 0),
        Number(item.mistakes || 0),
        Number(item.reactions || 0),
        item.category || null,
        item.sourcePage || item.source_page || null,
        item.sport || sport,
        item.level || level,
        item.notes || null,
        item.date || item.created_at || now,
        now
      ));
  }

  // Variante sempre-insert (non buildProfileExtraStatements, che farebbe un
  // controllo di esistenza contro lo stato ATTUALE del DB, prima che il
  // delete-all sopra sia stato eseguito dal batch, producendo un UPDATE su
  // una riga che nel frattempo il batch stesso ha cancellato).
  statements.push(...buildProfileExtraInsertStatements(env, user.id, profile));

  // Preferenza squadra/tema: passthrough best-effort da export.js. Assente
  // (JSON esportato prima di questa funzione) -> nessuna statement, la riga
  // esistente (se c'è) resta intatta. clubId/clubTeamId non più presenti nel
  // catalogo (es. import su un ambiente diverso) -> ignorati silenziosamente
  // invece di far fallire l'intero import per una violazione di foreign key.
  const clubPref = body.clubPreference;
  if (clubPref && typeof clubPref === "object") {
    let clubId = clubPref.club?.id || null;
    let clubTeamId = clubPref.clubTeam?.id || null;
    if (clubId) {
      const club = await env.DB.prepare("select id from clubs where id = ?").bind(clubId).first();
      if (!club) { clubId = null; clubTeamId = null; }
    }
    if (clubTeamId) {
      const team = await env.DB.prepare("select id from club_teams where id = ? and club_id = ?").bind(clubTeamId, clubId).first();
      if (!team) clubTeamId = null;
    }
    const colorPrimary = isValidHexColor(clubPref.colorPrimary) ? normalizeHexColor(clubPref.colorPrimary) : null;
    const colorSecondary = isValidHexColor(clubPref.colorSecondary) ? normalizeHexColor(clubPref.colorSecondary) : null;
    const themeMode = ["club", "custom", "neutral"].includes(clubPref.themeMode) ? clubPref.themeMode : "neutral";
    statements.push(env.DB.prepare(`
      insert into user_club_preferences (
        user_id, club_id, club_team_id, custom_club_name, custom_city, custom_team_label,
        color_primary, color_secondary, use_custom_colors, theme_mode, team_step_done, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(user_id) do update set
        club_id = excluded.club_id, club_team_id = excluded.club_team_id,
        custom_club_name = excluded.custom_club_name, custom_city = excluded.custom_city, custom_team_label = excluded.custom_team_label,
        color_primary = excluded.color_primary, color_secondary = excluded.color_secondary, use_custom_colors = excluded.use_custom_colors,
        theme_mode = excluded.theme_mode, team_step_done = excluded.team_step_done, updated_at = excluded.updated_at
    `).bind(
      user.id, clubId, clubTeamId,
      clubPref.customClubName || null, clubPref.customCity || null, clubPref.customTeamLabel || null,
      colorPrimary, colorSecondary, clubPref.useCustomColors ? 1 : 0, themeMode, clubPref.teamStepDone ? 1 : 0, now
    ));
  }

  await env.DB.batch(statements);

  return json({ ok: true });
}
