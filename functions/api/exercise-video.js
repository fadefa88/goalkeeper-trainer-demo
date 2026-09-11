import { buildExerciseVideoPrompt, hashVideoSource, sanitizeStoryboard } from "./_video-prompt.js";
import { assertSameOrigin, error, json, readJson, requireAuth } from "./_shared.js";

const TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const VIDEO_MODEL = "alibaba/hh1.1-t2v";
const TEXT_TIMEOUT_MS = 15000;
// Non documentato pubblicamente quanto impieghi in pratica una generazione
// video di questo provider: valore volutamente generoso, da ricalibrare
// empiricamente dopo i primi utilizzi reali.
const VIDEO_TIMEOUT_MS = 280000;
const DOWNLOAD_TIMEOUT_MS = 60000;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const COOLDOWN_MS = 60000;

const STORYBOARD_SYSTEM_PROMPT = `Sei un assistente che trasforma la descrizione di un esercizio per
portieri in uno storyboard cronologico in INGLESE, pensato per generare
un breve video.

REGOLE VINCOLANTI:
- Non inventare azioni, giocatori, palloni o movimenti non presenti nel
  testo originale.
- Non aggiungere un finale, una valutazione o un commento.
- Numera le azioni in ordine cronologico, una per riga, frasi brevi e
  concrete (soggetto + azione + oggetto).
- Usa "GK" per il portiere, "Coach" per l'allenatore, "P2"/"P3"... per
  altri giocatori se citati esplicitamente.
- Se un dettaglio non è specificato (es. lato esatto, distanza precisa),
  non inventarlo: resta generico invece di aggiungere un dato inesistente.
- Massimo 8 righe.
- Scrivi esclusivamente in inglese, anche se il testo originale è in
  italiano.
- Restituisci solo l'elenco numerato, nessun'altra frase.`;

function loadOwned(env, userId, id) {
  return env.DB.prepare("select * from custom_exercises where id = ? and user_id = ?").bind(id, userId).first();
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const exerciseId = String(body?.customExerciseId || "");
  if (!exerciseId) return error("customExerciseId mancante", 400);

  const existing = await loadOwned(env, user.id, exerciseId);
  if (!existing) return error("Esercizio non trovato", 404);

  if (existing.video_status === "generating") return error("Generazione video già in corso per questo esercizio", 409);
  if (existing.video_created_at) {
    const elapsed = Date.now() - new Date(existing.video_created_at).getTime();
    if (Number.isFinite(elapsed) && elapsed < COOLDOWN_MS) return error("Attendi qualche secondo prima di riprovare", 429);
  }
  // Una sola generazione concorrente per utente: il costo di una generazione
  // video è significativamente più alto di quella del testo/JSON.
  const inFlight = await env.DB.prepare("select count(*) as n from custom_exercises where user_id = ? and video_status = 'generating'")
    .bind(user.id).first();
  if ((inFlight?.n || 0) > 0) return error("Hai già una generazione video in corso, attendi che finisca", 409);

  const now = new Date().toISOString();
  await env.DB.prepare("update custom_exercises set video_status = 'generating', video_error = null, video_created_at = ? where id = ? and user_id = ?")
    .bind(now, exerciseId, user.id).run();

  const task = runVideoGeneration(env, user.id, { ...existing, video_status: "generating" });
  if (typeof waitUntil === "function") waitUntil(task);
  else task.catch((err) => console.error("exercise-video background task failed", err));

  return json({ status: "generating" }, 202);
}

async function setFailed(env, userId, exerciseId, message) {
  await env.DB.prepare("update custom_exercises set video_status = 'failed', video_error = ? where id = ? and user_id = ?")
    .bind(String(message || "Errore sconosciuto").slice(0, 500), exerciseId, userId).run()
    .catch((err) => console.error("exercise-video: impossibile marcare failed", err));
}

async function runVideoGeneration(env, userId, exercise) {
  const exerciseId = exercise.id;
  try {
    if (!env.AI) throw new Error("Workers AI non disponibile (env.AI mancante)");

    const storyboard = await buildStoryboard(env, exercise);
    const prompt = buildExerciseVideoPrompt({
      storyboard,
      objective: exercise.objective,
      equipment: exercise.equipment,
      keepersCount: exercise.keepers_count
    });

    const aiResponse = await withTimeout(
      env.AI.run(VIDEO_MODEL, { prompt, resolution: "720P", ratio: "16:9", duration: 6, watermark: false }, { gateway: { id: env.AI_GATEWAY_ID } }),
      VIDEO_TIMEOUT_MS,
      "video model"
    );
    const videoUrl = aiResponse?.result?.video;
    if (!videoUrl || typeof videoUrl !== "string") throw new Error("Nessun video restituito dal provider");

    const downloadResponse = await withTimeout(fetch(videoUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }), DOWNLOAD_TIMEOUT_MS, "download video");
    if (!downloadResponse.ok) throw new Error(`Download video fallito (${downloadResponse.status})`);
    const contentType = downloadResponse.headers.get("Content-Type") || "";
    if (!contentType.startsWith("video/")) throw new Error(`Content-Type inatteso dal provider: ${contentType || "assente"}`);
    const contentLength = Number(downloadResponse.headers.get("Content-Length") || 0);
    if (contentLength > MAX_VIDEO_BYTES) throw new Error(`Video troppo grande (${contentLength} byte)`);
    if (!downloadResponse.body) throw new Error("Risposta senza corpo dal provider video");

    if (!env.EXERCISE_VIDEOS) throw new Error("Bucket R2 non disponibile (env.EXERCISE_VIDEOS mancante)");
    const storageKey = `custom-exercises/${userId}/${exerciseId}/${crypto.randomUUID()}.mp4`;
    await env.EXERCISE_VIDEOS.put(storageKey, downloadResponse.body, { httpMetadata: { contentType: "video/mp4" } });

    const sourceHash = await hashVideoSource({
      description: exercise.description, objective: exercise.objective, equipment: exercise.equipment,
      keepersCount: exercise.keepers_count, category: exercise.category
    });
    const readyAt = new Date().toISOString();
    await env.DB.prepare(
      "update custom_exercises set video_status = 'ready', video_storage_key = ?, video_model = ?, video_source_hash = ?, video_created_at = ?, video_error = null where id = ? and user_id = ?"
    ).bind(storageKey, VIDEO_MODEL, sourceHash, readyAt, exerciseId, userId).run();

    // Il vecchio oggetto R2 va cancellato SOLO ora che il nuovo è confermato
    // scritto e il D1 aggiornato: mai prima, altrimenti un fallimento a metà
    // lascerebbe l'esercizio senza alcun video.
    const previousKey = exercise.video_storage_key;
    if (previousKey && previousKey !== storageKey) {
      await env.EXERCISE_VIDEOS.delete(previousKey).catch((err) => console.warn("Cancellazione vecchio video R2 non riuscita", previousKey, err));
    }
  } catch (err) {
    console.error("exercise-video generation failed", exerciseId, err);
    await setFailed(env, userId, exerciseId, err?.message || String(err));
  }
}

async function buildStoryboard(env, exercise) {
  try {
    const aiResponse = await withTimeout(
      env.AI.run(TEXT_MODEL, {
        messages: [
          { role: "system", content: STORYBOARD_SYSTEM_PROMPT },
          { role: "user", content: `Descrizione esercizio: ${exercise.description}` }
        ],
        temperature: 0.2,
        max_tokens: 400
      }),
      TEXT_TIMEOUT_MS,
      "storyboard"
    );
    const text = sanitizeStoryboard(aiResponse?.response);
    if (text) return text;
  } catch (err) {
    console.warn("exercise-video: storyboard fallback su descrizione grezza", err?.message || err);
  }
  // Fallback: descrizione grezza (ripulita) al posto dello storyboard. La
  // generazione video prosegue comunque, solo con un input meno raffinato.
  return sanitizeStoryboard(exercise.description);
}
