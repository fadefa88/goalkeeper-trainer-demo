import { sanitizeScene } from "../_diagram-scene.js";
import { assertSameOrigin, error, json, mapCustomExercise, readJson, requireAuth, validateCustomExercisePayload } from "../_shared.js";

const HASH_RE = /^[0-9a-f]{64}$/;

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

  // Il campo diagramSceneJson viene toccato solo se il client lo include
  // esplicitamente nel body: un salvataggio che non lo manda (l'utente ha
  // scelto "Mantieni schema", o sta modificando solo un altro campo) lascia
  // lo schema esistente intatto invece di cancellarlo.
  let diagramSceneJson = existing.diagram_scene_json;
  let diagramVersion = existing.diagram_version;
  let diagramSourceHash = existing.diagram_source_hash;
  if (Object.prototype.hasOwnProperty.call(body, "diagramSceneJson")) {
    const scene = body.diagramSceneJson ? sanitizeScene(body.diagramSceneJson) : null;
    diagramSceneJson = scene ? JSON.stringify(scene) : null;
    diagramVersion = scene ? scene.version : existing.diagram_version;
    diagramSourceHash = scene && HASH_RE.test(String(body.diagramSourceHash || "")) ? body.diagramSourceHash : null;
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    "update custom_exercises set name = ?, objective = ?, description = ?, category = ?, duration_minutes = ?, keepers_count = ?, equipment = ?, notes = ?, diagram_scene_json = ?, diagram_version = ?, diagram_source_hash = ?, updated_at = ? where id = ? and user_id = ?"
  ).bind(
    value.name, value.objective, value.description, value.category, value.durationMinutes,
    value.keepersCount, value.equipment, value.notes,
    diagramSceneJson, diagramVersion, diagramSourceHash,
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
  return json({ ok: true });
}
