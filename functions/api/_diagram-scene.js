// Validazione/sanificazione della "scena tattica" (diagram_scene_json) di un
// custom exercise. Usato sia da exercise-diagram.js (output grezzo del
// modello Workers AI) sia da custom-exercises/*.js (difesa in profondità su
// qualunque diagram_scene_json arrivi dal client, anche senza passare da AI).
// Il modello produce solo dati: nessun HTML/SVG/JS arriva mai da qui.

export const SCENE_LIMITS = {
  actors: 8,
  objects: 10,
  movements: 10,
  ballPaths: 10,
  zones: 4,
  labels: 6
};

const FIELD_TYPES = ["penalty-area", "goal-area", "half-pitch", "full-pitch"];
const ACTOR_TYPES = ["goalkeeper", "coach", "player"];
const OBJECT_TYPES = ["ball", "cone", "dummy", "obstacle"];
const BALL_PATH_STYLES = ["ground", "air"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampNum(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.min(max, Math.max(min, n)) * 10) / 10;
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function truncStr(value, maxLen) {
  return String(value ?? "").trim().slice(0, maxLen);
}

function sanitizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  return [clampNum(point[0]), clampNum(point[1])];
}

// Restituisce sempre una scena con tutte le chiavi (array eventualmente
// vuoti), oppure null se l'input non è utilizzabile (nessun attore valido:
// senza almeno un attore il diagramma non ha nulla da mostrare).
export function sanitizeScene(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== undefined && raw.version !== 1) return null;

  const fieldType = FIELD_TYPES.includes(raw.field?.type) ? raw.field.type : "penalty-area";

  const actorIds = new Set();
  const actors = (Array.isArray(raw.actors) ? raw.actors : [])
    .filter(isPlainObject)
    .map((item) => {
      const id = truncStr(item.id, 8);
      if (!id || !ACTOR_TYPES.includes(item.type) || actorIds.has(id)) return null;
      actorIds.add(id);
      const actor = { id, type: item.type, x: clampNum(item.x), y: clampNum(item.y) };
      const label = truncStr(item.label, 12);
      if (label) actor.label = label;
      return actor;
    })
    .filter(Boolean)
    .slice(0, SCENE_LIMITS.actors);

  if (!actors.length) return null;

  const objectIds = new Set();
  const objects = (Array.isArray(raw.objects) ? raw.objects : [])
    .filter(isPlainObject)
    .map((item) => {
      const id = truncStr(item.id, 8);
      if (!id || !OBJECT_TYPES.includes(item.type) || objectIds.has(id)) return null;
      objectIds.add(id);
      return { id, type: item.type, x: clampNum(item.x), y: clampNum(item.y) };
    })
    .filter(Boolean)
    .slice(0, SCENE_LIMITS.objects);

  const movements = (Array.isArray(raw.movements) ? raw.movements : [])
    .filter(isPlainObject)
    .map((item) => {
      if (!actorIds.has(truncStr(item.actorId, 8))) return null;
      const from = sanitizePoint(item.from);
      const to = sanitizePoint(item.to);
      if (!from || !to) return null;
      return { actorId: truncStr(item.actorId, 8), from, to, sequence: clampInt(item.sequence, 1, 9) };
    })
    .filter(Boolean)
    .slice(0, SCENE_LIMITS.movements);

  const ballPaths = (Array.isArray(raw.ballPaths) ? raw.ballPaths : [])
    .filter(isPlainObject)
    .map((item) => {
      const from = sanitizePoint(item.from);
      const to = sanitizePoint(item.to);
      if (!from || !to) return null;
      return {
        from,
        to,
        sequence: clampInt(item.sequence, 1, 9),
        style: BALL_PATH_STYLES.includes(item.style) ? item.style : "ground"
      };
    })
    .filter(Boolean)
    .slice(0, SCENE_LIMITS.ballPaths);

  const zones = (Array.isArray(raw.zones) ? raw.zones : [])
    .filter(isPlainObject)
    .map((item) => {
      const zone = { x: clampNum(item.x), y: clampNum(item.y), w: clampNum(item.w), h: clampNum(item.h) };
      const label = truncStr(item.label, 24);
      if (label) zone.label = label;
      return zone;
    })
    .slice(0, SCENE_LIMITS.zones);

  const labels = (Array.isArray(raw.labels) ? raw.labels : [])
    .filter(isPlainObject)
    .map((item) => {
      const text = truncStr(item.text, 40);
      if (!text) return null;
      return { x: clampNum(item.x), y: clampNum(item.y), text };
    })
    .filter(Boolean)
    .slice(0, SCENE_LIMITS.labels);

  return { version: 1, field: { type: fieldType }, actors, objects, movements, ballPaths, zones, labels };
}

// Hash del testo descrizione usato per rilevare "la descrizione è cambiata
// da quando ho generato lo schema" (diagram_source_hash). Controparte
// client-side identica in cloudflare-client.js (hashDescription), non
// importabile qui: le Pages Functions girano come moduli ESM, gli script
// pagina no.
export async function hashText(text) {
  const bytes = new TextEncoder().encode(String(text ?? "").trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidSceneJsonString(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  try { JSON.parse(value); return true; } catch { return false; }
}

// Passato a Workers AI come response_format (JSON Mode). Il modello resta
// comunque non fidato: sanitizeScene() sopra riapplica gli stessi limiti
// dopo la risposta, indipendentemente da quanto lo schema sia stato rispettato.
export const DIAGRAM_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "field", "actors"],
  properties: {
    version: { const: 1 },
    field: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: { type: { enum: FIELD_TYPES } }
    },
    actors: {
      type: "array",
      maxItems: SCENE_LIMITS.actors,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "x", "y"],
        properties: {
          id: { type: "string", maxLength: 8 },
          type: { enum: ACTOR_TYPES },
          x: { type: "number" },
          y: { type: "number" },
          label: { type: "string", maxLength: 12 }
        }
      }
    },
    objects: {
      type: "array",
      maxItems: SCENE_LIMITS.objects,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "x", "y"],
        properties: {
          id: { type: "string", maxLength: 8 },
          type: { enum: OBJECT_TYPES },
          x: { type: "number" },
          y: { type: "number" }
        }
      }
    },
    movements: {
      type: "array",
      maxItems: SCENE_LIMITS.movements,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["actorId", "from", "to", "sequence"],
        properties: {
          actorId: { type: "string", maxLength: 8 },
          from: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          to: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          sequence: { type: "integer", minimum: 1, maximum: 9 }
        }
      }
    },
    ballPaths: {
      type: "array",
      maxItems: SCENE_LIMITS.ballPaths,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "sequence"],
        properties: {
          from: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          to: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          sequence: { type: "integer", minimum: 1, maximum: 9 },
          style: { enum: BALL_PATH_STYLES }
        }
      }
    },
    zones: {
      type: "array",
      maxItems: SCENE_LIMITS.zones,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "w", "h"],
        properties: {
          x: { type: "number" }, y: { type: "number" },
          w: { type: "number" }, h: { type: "number" },
          label: { type: "string", maxLength: 24 }
        }
      }
    },
    labels: {
      type: "array",
      maxItems: SCENE_LIMITS.labels,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "text"],
        properties: {
          x: { type: "number" }, y: { type: "number" },
          text: { type: "string", maxLength: 40 }
        }
      }
    }
  }
};
