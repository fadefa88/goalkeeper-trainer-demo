import { DIAGRAM_JSON_SCHEMA, hashText, sanitizeScene } from "./_diagram-scene.js";
import { assertSameOrigin, error, json, readJson, requireAuth } from "./_shared.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const AI_TIMEOUT_MS = 15000;

const SYSTEM_PROMPT = `Sei un interprete di diagrammi per esercizi di allenamento portieri di calcio.

Il tuo unico compito è convertire la descrizione testuale di un esercizio,
scritta da un allenatore, in una scena tattica strutturata in formato JSON.

REGOLE VINCOLANTI:
- Non inventare un nuovo esercizio. Non aggiungere azioni, giocatori,
  oggetti o movimenti che non siano esplicitamente descritti nel testo,
  salvo il minimo indispensabile per rendere leggibile lo schema
  (es. la porta se l'esercizio la richiede implicitamente).
- Usa "GK"/"P1" per il portiere, "C1" per l'allenatore, "X1"/"X2"... per
  altri giocatori, mantenendo gli identificatori brevi usati nel testo se
  presenti.
- Le coordinate x e y vanno da 0 a 100 e rappresentano la posizione
  relativa sul campo (0,0 = angolo in alto a sinistra dell'area
  rappresentata).
- Rispetta rigorosamente lo schema JSON fornito: non aggiungere proprietà,
  non omettere quelle richieste, non superare i limiti numerici di
  ciascun array.
- Se il testo è ambiguo su una posizione esatta, scegli una posizione
  ragionevole e coerente con la disposizione tipica di un campo da calcio,
  senza inventare dettagli narrativi.
- Restituisci esclusivamente l'oggetto JSON richiesto. Nessun testo
  aggiuntivo, nessuna spiegazione, nessun markdown, nessun commento.`;

function loadOwned(env, userId, id) {
  return env.DB.prepare("select * from custom_exercises where id = ? and user_id = ?").bind(id, userId).first();
}

export async function onRequestPost({ request, env }) {
  try {
    return await handlePost(request, env);
  } catch (err) {
    console.error("exercise-diagram POST failed", err);
    return error(`Errore generazione schema: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}

async function handlePost(request, env) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const exerciseId = String(body?.customExerciseId || "");
  if (!exerciseId) return error("customExerciseId mancante", 400);

  const existing = await loadOwned(env, user.id, exerciseId);
  if (!existing) return error("Esercizio non trovato", 404);

  // env.AI mancante/quota/timeout/output non valido: mai un errore che
  // impedisca di usare l'esercizio, solo "schema non disponibile". Lo
  // schema esistente (se c'era) resta intatto: non viene mai svuotato da
  // un tentativo fallito.
  if (!env.AI) return json({ diagramSceneJson: null, reason: "unavailable" });

  const userPrompt = [
    `Descrizione esercizio: ${existing.description}`,
    existing.objective ? `Obiettivo: ${existing.objective}` : "",
    existing.category ? `Ambito: ${existing.category}` : ""
  ].filter(Boolean).join("\n");

  let aiResponse;
  try {
    aiResponse = await Promise.race([
      env.AI.run(MODEL, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_schema", json_schema: DIAGRAM_JSON_SCHEMA },
        temperature: 0.2,
        max_tokens: 900
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), AI_TIMEOUT_MS))
    ]);
  } catch (err) {
    console.error("exercise-diagram AI call failed", err);
    return json({ diagramSceneJson: null, reason: err?.message === "timeout" ? "timeout" : "ai_error" });
  }

  // Non ci si fida del solo JSON Mode: sanitizeScene() rivalida enum, clampa
  // le coordinate, limita gli array e scarta proprietà sconosciute a
  // prescindere da cosa il modello abbia effettivamente restituito.
  const scene = sanitizeScene(extractJson(aiResponse));
  if (!scene) return json({ diagramSceneJson: null, reason: "invalid_output" });

  const sourceHash = await hashText(existing.description);
  await env.DB.prepare("update custom_exercises set diagram_scene_json = ?, diagram_source_hash = ? where id = ? and user_id = ?")
    .bind(JSON.stringify(scene), sourceHash, exerciseId, user.id).run();

  return json({ diagramSceneJson: scene, diagramSourceHash: sourceHash });
}

function extractJson(aiResponse) {
  const payload = aiResponse?.response;
  if (payload && typeof payload === "object") return payload;
  if (typeof payload === "string") {
    try { return JSON.parse(payload); } catch { /* fall through */ }
    const match = payload.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { /* ignore */ } }
  }
  return null;
}
