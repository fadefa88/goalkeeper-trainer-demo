const textEncoder = new TextEncoder();
export const PASSWORD_ITERATIONS = 100000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request) {
  try { return await request.json(); }
  catch { return {}; }
}

export function assertSameOrigin(request) {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (new URL(origin).host !== new URL(request.url).host) return error("Origine non consentita", 403);
  return null;
}

export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value) {
  const base64 = String(value).replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - String(value).length % 4) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(secret, salt, iterations = PASSWORD_ITERATIONS) {
  const safeIterations = Math.min(Number(iterations) || PASSWORD_ITERATIONS, PASSWORD_ITERATIONS);
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: base64UrlToBytes(salt), iterations: safeIterations, hash: "SHA-256" }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `gk_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return "gk_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.split("=").slice(1).join("=");
}

export async function createSession(env, userId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await env.DB.prepare("insert into auth_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) values (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, now.toISOString(), now.toISOString()).run();
  return token;
}

export async function requireUser(env, request) {
  const rawToken = getCookie(request, "gk_session");
  if (!rawToken) return null;
  const token = decodeURIComponent(rawToken);
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const session = await env.DB.prepare("select s.id as session_id, u.id, u.email from auth_sessions s join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ? limit 1")
    .bind(tokenHash, now).first();
  if (!session) return null;
  await env.DB.prepare("update auth_sessions set last_seen_at = ? where id = ?").bind(now, session.session_id).run();
  return { id: session.id, email: session.email, sessionId: session.session_id, tokenHash };
}

export async function requireAuth(env, request) {
  const user = await requireUser(env, request);
  if (!user) return { response: error("Non autenticato", 401), user: null };
  return { response: null, user };
}

export function mapKeeper(row) {
  return {
    id: row.id,
    name: row.name,
    height: row.height_cm,
    weight: row.weight_kg,
    broadJump: row.standing_broad_jump_cm,
    verticalJump: row.standing_vertical_jump_cm,
    halfHeightJump: row.standing_half_height_jump_cm,
    twoPostsTest: row.two_posts_test_sec
  };
}

// Categorie riservate di training_sessions: non sono vere sedute di allenamento,
// ma righe di storage per dati account che lo schema D1 attuale non prevede come
// tabelle proprie. "__match__" (rapporti partita prima squadra) esiste già;
// "__physical__" e "__plan__" sono introdotte qui per persistere davvero lo
// storico fisico e gli allenamenti salvati dal calendario, che prima venivano
// accettati dalla PUT /api/profile e scartati senza essere mai scritti.
export const MATCH_CATEGORY = "__match__";
export const PHYSICAL_HISTORY_CATEGORY = "__physical__";
export const TRAINING_PLANS_CATEGORY = "__plan__";
export const RESERVED_EXTRAS_CATEGORIES = [PHYSICAL_HISTORY_CATEGORY, TRAINING_PLANS_CATEGORY];

const EXTRAS = {
  physicalHistory: { category: PHYSICAL_HISTORY_CATEGORY, exerciseId: "extras-physical-history", label: "Storico fisico", empty: [] },
  trainingPlans: { category: TRAINING_PLANS_CATEGORY, exerciseId: "extras-training-plans", label: "Allenamenti salvati", empty: {} }
};

async function loadExtra(env, userId, key) {
  const def = EXTRAS[key];
  const row = await env.DB.prepare("select notes from training_sessions where user_id = ? and category = ? and exercise_id = ? limit 1")
    .bind(userId, def.category, def.exerciseId).first();
  if (!row?.notes) return def.empty;
  try {
    const parsed = JSON.parse(row.notes);
    return parsed && typeof parsed === "object" ? parsed : def.empty;
  } catch {
    return def.empty;
  }
}

// Prepara (senza eseguire) l'upsert di una riga "extra". Va sempre incluso in un
// batch insieme alle altre scritture del profilo per restare atomico.
async function extraStatement(env, userId, key, value) {
  const def = EXTRAS[key];
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("select id from training_sessions where user_id = ? and category = ? and exercise_id = ? limit 1")
    .bind(userId, def.category, def.exerciseId).first();
  const notes = JSON.stringify(value);
  if (existing) {
    return env.DB.prepare("update training_sessions set notes = ?, updated_at = ? where id = ?").bind(notes, now, existing.id);
  }
  return env.DB.prepare("insert into training_sessions (id, user_id, exercise_id, exercise_name, session_date, category, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, def.exerciseId, def.label, now.slice(0, 10), def.category, notes, now, now);
}

export async function loadProfileExtras(env, userId) {
  const [physicalHistory, trainingPlans] = await Promise.all([
    loadExtra(env, userId, "physicalHistory"),
    loadExtra(env, userId, "trainingPlans")
  ]);
  return {
    physicalHistory: Array.isArray(physicalHistory) ? physicalHistory : [],
    trainingPlans: trainingPlans && typeof trainingPlans === "object" && !Array.isArray(trainingPlans) ? trainingPlans : {}
  };
}

// Restituisce le statement da aggiungere al batch della PUT /api/profile, una
// per ogni campo "extra" realmente presente nel body. Un campo assente nel body
// non genera nessuna statement: la riga esistente resta intatta, quindi nessuna
// PUT del profilo di base (che non conosce questi campi) può cancellarla.
export async function buildProfileExtraStatements(env, userId, profile) {
  const statements = [];
  const physicalHistory = profile.physicalHistory ?? profile.physical_history;
  if (Array.isArray(physicalHistory)) statements.push(await extraStatement(env, userId, "physicalHistory", physicalHistory));
  const trainingPlans = profile.trainingPlans ?? profile.training_plans;
  if (trainingPlans && typeof trainingPlans === "object" && !Array.isArray(trainingPlans)) {
    statements.push(await extraStatement(env, userId, "trainingPlans", trainingPlans));
  }
  return statements;
}

export async function loadProfile(env, userId) {
  const settings = await env.DB.prepare("select * from user_settings where user_id = ?").bind(userId).first();
  if (!settings) return null;
  const keepers = await env.DB.prepare("select * from keepers where user_id = ? order by display_order asc, created_at asc").bind(userId).all();
  const extras = await loadProfileExtras(env, userId);
  return {
    keepersCount: settings.keepers_count,
    sportType: settings.sport,
    level: settings.level,
    sessionsPerWeek: settings.sessions_per_week,
    sessionDuration: settings.session_duration,
    keepers: (keepers.results || []).map(mapKeeper),
    physicalHistory: extras.physicalHistory,
    trainingPlans: extras.trainingPlans
  };
}

export function mapSession(row) {
  return {
    id: row.id,
    date: row.created_at,
    sessionDate: row.session_date,
    exerciseName: row.exercise_name,
    category: row.category,
    sourcePage: row.source_page,
    sport: row.sport,
    level: row.level,
    keeper: row.keeper_name,
    keeperId: row.keeper_id,
    saves: row.saves,
    mistakes: row.mistakes,
    reactions: row.reactions,
    plannedMinutes: row.planned_minutes,
    notes: row.notes
  };
}

export async function loadSessions(env, userId) {
  // Le righe "__physical__"/"__plan__" sono storage per il profilo (vedi
  // buildProfileExtraStatements), non sedute: non devono mai comparire come
  // sessione in Progressi, Storico o nell'export JSON.
  const rows = await env.DB.prepare("select * from training_sessions where user_id = ? and category not in (?, ?) order by session_date desc, created_at desc")
    .bind(userId, PHYSICAL_HISTORY_CATEGORY, TRAINING_PLANS_CATEGORY).all();
  return (rows.results || []).map(mapSession);
}
