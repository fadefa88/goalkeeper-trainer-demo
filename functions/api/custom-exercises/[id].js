import { assertSameOrigin, error, json, mapCustomExercise, readJson, requireAuth, validateCustomExercisePayload } from "../_shared.js";

// user_id sempre nella WHERE: un id di un altro account non produce mai una
// riga, quindi PUT/DELETE rispondono 404 identico sia per "non esiste" sia
// per "non è tuo", senza rivelare quale dei due sia il caso.
function loadOwned(env, userId, id) {
  return env.DB.prepare("select * from custom_exercises where id = ? and user_id = ?").bind(id, userId).first();
}

export async function onRequestPut({ request, env, params }) {
  try {
    return await update(request, env, params);
  } catch (err) {
    console.error("custom-exercises PUT failed", err);
    return error(`Errore salvataggio esercizio: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}

async function update(request, env, params) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const existing = await loadOwned(env, user.id, params.id);
  if (!existing) return error("Esercizio non trovato", 404);

  const body = await readJson(request);
  const { value, error: validationError } = validateCustomExercisePayload(body);
  if (validationError) return error(validationError, 400);

  // I campi video (video_status/video_storage_key/...) non sono toccati qui:
  // li gestisce esclusivamente exercise-video.js. Una modifica testuale non
  // cancella né altera mai lo stato del video esistente.
  const now = new Date().toISOString();
  await env.DB.prepare(
    "update custom_exercises set name = ?, objective = ?, description = ?, category = ?, duration_minutes = ?, keepers_count = ?, equipment = ?, notes = ?, updated_at = ? where id = ? and user_id = ?"
  ).bind(
    value.name, value.objective, value.description, value.category, value.durationMinutes,
    value.keepersCount, value.equipment, value.notes,
    now, params.id, user.id
  ).run();

  const row = await loadOwned(env, user.id, params.id);
  return json({ exercise: mapCustomExercise(row) });
}

export async function onRequestDelete({ request, env, params }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const existing = await loadOwned(env, user.id, params.id);
  if (!existing) return error("Esercizio non trovato", 404);

  await env.DB.prepare("delete from custom_exercises where id = ? and user_id = ?").bind(params.id, user.id).run();
  // Best-effort: se il video R2 non si cancella (bucket non configurato,
  // key già assente, errore di rete) la riga D1 è comunque già stata
  // rimossa, non blocchiamo la risposta per questo.
  if (existing.video_storage_key) {
    try { await env.EXERCISE_VIDEOS?.delete(existing.video_storage_key); }
    catch (err) { console.warn("Cancellazione video R2 non riuscita", existing.video_storage_key, err); }
  }
  return json({ ok: true });
}
