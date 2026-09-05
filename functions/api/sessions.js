import { assertSameOrigin, error, json, loadSessions, MATCH_CATEGORY, readJson, requireAuth, RESERVED_EXTRAS_CATEGORIES } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;
  return json({ sessions: await loadSessions(env, user.id) });
}

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const session = body.session || body;
  if (!session?.exerciseName || !session?.sessionDate) return error("Sessione incompleta", 400);
  // "__physical__"/"__plan__" sono righe di storage riservate al profilo
  // (vedi buildProfileExtraStatements in _shared.js): non possono essere create
  // come sessione qualunque, altrimenti collidono con quelle righe.
  if (RESERVED_EXTRAS_CATEGORIES.includes(session.category)) return error("Categoria non consentita", 400);

  const exerciseId = session.exerciseId || session.exercise_id || "exercise";
  if (session.category === MATCH_CATEGORY) {
    await env.DB.prepare("delete from training_sessions where user_id = ? and exercise_id = ? and category = ?")
      .bind(user.id, exerciseId, MATCH_CATEGORY)
      .run();
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare("insert into training_sessions (id, user_id, keeper_id, keeper_name, exercise_id, exercise_name, session_date, planned_minutes, saves, mistakes, reactions, category, source_page, sport, level, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(
      id,
      user.id,
      session.keeperId || null,
      session.keeperName || session.keeper || null,
      exerciseId,
      session.exerciseName,
      session.sessionDate,
      session.plannedMinutes ?? null,
      Number(session.saves || 0),
      Number(session.mistakes || 0),
      Number(session.reactions || 0),
      session.category || null,
      session.sourcePage ?? null,
      session.sport || null,
      session.level || null,
      session.notes || null,
      now,
      now
    ).run();

  return json({ ok: true, id }, 201);
}
