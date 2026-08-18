import { assertSameOrigin, error, json, loadProfile, readJson, requireAuth } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;
  return json({ profile: await loadProfile(env, user.id) });
}

export async function onRequestPut({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const profile = body.profile || body;
  if (!profile) return error("Profilo mancante", 400);

  const sport = profile.sportType || "calcio";
  const level = profile.level || "medio";
  const keepers = Array.isArray(profile.keepers) ? profile.keepers : [];
  const now = new Date().toISOString();

  await env.DB.prepare("insert into user_settings (user_id, keepers_count, sport, level, sessions_per_week, session_duration, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(user_id) do update set keepers_count = excluded.keepers_count, sport = excluded.sport, level = excluded.level, sessions_per_week = excluded.sessions_per_week, session_duration = excluded.session_duration, updated_at = excluded.updated_at")
    .bind(user.id, Number(profile.keepersCount || 3), sport, level, Number(profile.sessionsPerWeek || 2), Number(profile.sessionDuration || 60), now, now).run();

  await env.DB.prepare("delete from keepers where user_id = ?").bind(user.id).run();

  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i];
    await env.DB.prepare("insert into keepers (id, user_id, name, height_cm, weight_kg, sport, level, standing_broad_jump_cm, standing_vertical_jump_cm, standing_half_height_jump_cm, two_posts_test_sec, display_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(
        crypto.randomUUID(),
        user.id,
        keeper.name || `Portiere ${i + 1}`,
        keeper.height ?? null,
        keeper.weight ?? null,
        sport,
        level,
        keeper.broadJump ?? null,
        keeper.verticalJump ?? null,
        keeper.halfHeightJump ?? null,
        keeper.twoPostsTest ?? null,
        i,
        now,
        now
      ).run();
  }

  return json({ profile: await loadProfile(env, user.id) });
}
