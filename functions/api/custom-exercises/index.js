import { sanitizeScene } from "../_diagram-scene.js";
import { assertSameOrigin, error, json, mapCustomExercise, readJson, requireAuth, validateCustomExercisePayload } from "../_shared.js";

const HASH_RE = /^[0-9a-f]{64}$/;

export async function onRequestGet({ request, env }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;
  const rows = await env.DB.prepare("select * from custom_exercises where user_id = ? order by updated_at desc").bind(user.id).all();
  return json({ exercises: (rows.results || []).map(mapCustomExercise) });
}

export async function onRequestPost({ request, env }) {
  try {
    return await create(request, env);
  } catch (err) {
    // Stesso pattern di profile.js: senza try/catch un'eccezione qui
    // (es. env.DB non disponibile) torna una pagina d'errore HTML generica
    // invece di JSON.
    console.error("custom-exercises POST failed", err);
    return error(`Errore salvataggio esercizio: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}

async function create(request, env) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const { value, error: validationError } = validateCustomExercisePayload(body);
  if (validationError) return error(validationError, 400);

  // diagramSceneJson arriva (se presente) già come oggetto generato da
  // POST /api/exercise-diagram: viene comunque riconvalidato qui, non ci si
  // fida di un client che scrivesse direttamente su questo endpoint.
  const scene = body.diagramSceneJson ? sanitizeScene(body.diagramSceneJson) : null;
  const diagramSourceHash = scene && HASH_RE.test(String(body.diagramSourceHash || "")) ? body.diagramSourceHash : null;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "insert into custom_exercises (id, user_id, name, objective, description, category, duration_minutes, keepers_count, equipment, notes, diagram_scene_json, diagram_version, diagram_source_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id, user.id, value.name, value.objective, value.description, value.category, value.durationMinutes,
    value.keepersCount, value.equipment, value.notes,
    scene ? JSON.stringify(scene) : null, scene ? scene.version : 1, diagramSourceHash,
    now, now
  ).run();

  const row = await env.DB.prepare("select * from custom_exercises where id = ? and user_id = ?").bind(id, user.id).first();
  return json({ exercise: mapCustomExercise(row) }, 201);
}
