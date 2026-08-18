import { assertSameOrigin, error, json, loadSessions, readJson, requireAuth } from "./_shared.js";

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

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare("insert into training_sessions (id, user_id, keeper_id, keeper_name, exercise_id, exercise_name, session_date, planned_minutes, saves, mistakes, reactions, category, source_page, sport, level, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(
      id,
      user.id,
      session.keeperId || null,
      session.keeperName || session.keeper || null,
      session.exerciseId || session.exercise_id || "exercise",
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
