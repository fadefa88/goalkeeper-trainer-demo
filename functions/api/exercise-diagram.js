import { DIAGRAM_JSON_SCHEMA, hashText, sanitizeScene } from "./_diagram-scene.js";
import { assertSameOrigin, error, json, readJson, requireAuth } from "./_shared.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 4000;
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

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const description = String(body?.description || "").trim();
  if (description.length < MIN_DESCRIPTION_LENGTH) return error("Descrizione troppo breve per generare uno schema", 400);
  if (description.length > MAX_DESCRIPTION_LENGTH) return error("Descrizione troppo lunga", 400);

  // env.AI mancante (locale senza binding, quota, provider giù): non è un
  // errore per il chiamante, è uno stato "schema non disponibile" che il
  // client mostra senza bloccare il salvataggio dell'esercizio testuale.
  if (!env.AI) return json({ scene: null, sourceHash: null, reason: "unavailable" });

  const objective = String(body?.objective || "").trim().slice(0, 160);
  const category = String(body?.category || "").trim().slice(0, 40);
  const userPrompt = [
    `Descrizione esercizio: ${description}`,
    objective ? `Obiettivo: ${objective}` : "",
    category ? `Ambito: ${category}` : ""
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
    return json({ scene: null, sourceHash: null, reason: err?.message === "timeout" ? "timeout" : "ai_error" });
  }

  // Non ci si fida del solo JSON Mode: sanitizeScene() rivalida enum, clampa
  // le coordinate, limita gli array e scarta proprietà sconosciute a
  // prescindere da cosa il modello abbia effettivamente restituito.
  const scene = sanitizeScene(extractJson(aiResponse));
  if (!scene) return json({ scene: null, sourceHash: null, reason: "invalid_output" });

  return json({ scene, sourceHash: await hashText(description) });
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
