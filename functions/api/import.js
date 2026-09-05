import { assertSameOrigin, buildProfileExtraStatements, error, json, readJson, requireAuth } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const profile = body.profile;
  const history = Array.isArray(body.history) ? body.history : [];
  if (!profile) return error("JSON senza profilo", 400);

  await env.DB.prepare("delete from training_sessions where user_id = ?").bind(user.id).run();
  await env.DB.prepare("delete from keepers where user_id = ?").bind(user.id).run();
  await env.DB.prepare("delete from user_settings where user_id = ?").bind(user.id).run();

  const sport = profile.sportType || profile.sport || "calcio";
  const level = profile.level || "medio";
  const now = new Date().toISOString();

  await env.DB.prepare("insert into user_settings (user_id, keepers_count, sport, level, sessions_per_week, session_duration, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(user.id, Number(profile.keepersCount || 3), sport, level, Number(profile.sessionsPerWeek || 2), Number(profile.sessionDuration || 60), now, now).run();

  const keeperNameToId = new Map();
  const keepers = Array.isArray(profile.keepers) ? profile.keepers : [];
  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i];
    const id = crypto.randomUUID();
    const name = keeper.name || `Portiere ${i + 1}`;
    keeperNameToId.set(name, id);
    await env.DB.prepare("insert into keepers (id, user_id, name, height_cm, weight_kg, sport, level, standing_broad_jump_cm, standing_vertical_jump_cm, standing_half_height_jump_cm, two_posts_test_sec, display_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, user.id, name, keeper.height ?? keeper.height_cm ?? null, keeper.weight ?? keeper.weight_kg ?? null, sport, level, keeper.broadJump ?? keeper.standing_broad_jump_cm ?? null, keeper.verticalJump ?? keeper.standing_vertical_jump_cm ?? null, keeper.halfHeightJump ?? keeper.standing_half_height_jump_cm ?? null, keeper.twoPostsTest ?? keeper.two_posts_test_sec ?? null, i, now, now).run();
  }

  for (const item of history) {
    await env.DB.prepare("insert into training_sessions (id, user_id, keeper_id, keeper_name, exercise_id, exercise_name, session_date, planned_minutes, saves, mistakes, reactions, category, source_page, sport, level, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
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
      ).run();
  }

  // Il delete-all di training_sessions sopra cancella anche le righe "extra"
  // (storico fisico, allenamenti salvati). Il JSON esportato da questa stessa
  // app le include già dentro "profile": vanno riscritte oppure vengono perse
  // a ogni importazione.
  const extraStatements = await buildProfileExtraStatements(env, user.id, profile);
  for (const statement of extraStatements) await statement.run();

  return json({ ok: true });
}
