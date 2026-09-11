// Costruzione deterministica del prompt per il modello video (alibaba/hh1.1-t2v,
// limite 2500 caratteri) e hash dei campi che ne influenzano il contenuto.
// Nessun campo utente può alterare la struttura fissa del prompt: ogni
// placeholder viene ripulito e troncato prima dell'interpolazione.

const PROMPT_MAX_LENGTH = 2500;
const STORYBOARD_MAX_LENGTH = 1200;
const FIELD_MAX_LENGTH = 200;

function cleanField(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || "Not specified";
}

// Usata sia sul testo del modello testuale (storyboard) sia, in fallback,
// sulla descrizione grezza dell'allenatore: stessa ripulitura in entrambi
// i casi, niente code fence/markdown che possano confondere il modello video.
export function sanitizeStoryboard(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, STORYBOARD_MAX_LENGTH);
}

export function buildExerciseVideoPrompt({ storyboard, objective, equipment, keepersCount }) {
  const prompt = `Create a 6-second professional stylized goalkeeper training drill video.

VISUAL STYLE:
Minimal low-poly 3D tactical sports visualization.
Fixed elevated three-quarter camera, 35-45 degrees.
Full relevant training area always visible.
No camera cuts. No zoom. No dramatic camera movement.
No spectators. No stadium atmosphere. No advertisements.
No text. No captions. No logos. No watermark.
Faceless simplified human figures.
Dark desaturated green football pitch.
White pitch markings.
Goalkeeper wears dark red.
Coach wears black or neutral grey.
Other players use neutral contrasting colors.
Football must remain clearly visible.

BEHAVIOR:
Represent only the actions explicitly described below.
Do not invent additional players, balls, goals or movements.
Keep positions and movement easy to understand for a goalkeeper coach.
Actions occur in the same chronological order as listed.

DRILL:
${cleanField(storyboard, STORYBOARD_MAX_LENGTH)}

OBJECTIVE:
${cleanField(objective, FIELD_MAX_LENGTH)}

EQUIPMENT:
${cleanField(equipment, FIELD_MAX_LENGTH)}

NUMBER OF GOALKEEPERS:
${cleanField(keepersCount, 20)}

The final result must prioritize tactical clarity over visual realism.`;

  // Non dovrebbe mai scattare vista STORYBOARD_MAX_LENGTH/FIELD_MAX_LENGTH
  // sopra, ma resta una rete di sicurezza contro il limite reale del
  // modello (2500 caratteri sul campo "prompt").
  return prompt.slice(0, PROMPT_MAX_LENGTH);
}

// Hash dei soli campi che incidono sul contenuto visivo del video. duration_minutes
// e notes non ne fanno parte: non influenzano il prompt. Stesso algoritmo
// duplicato lato client (cloudflare-client.js: hashVideoSource) per il
// confronto "descrizione cambiata" prima del salvataggio — non importabile
// da qui, le Pages Functions sono moduli ESM, gli script pagina no.
export async function hashVideoSource({ description, objective, equipment, keepersCount, category }) {
  const payload = JSON.stringify({
    description: description || "",
    objective: objective || "",
    equipment: equipment || "",
    keepersCount: keepersCount ?? null,
    category: category || ""
  });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
