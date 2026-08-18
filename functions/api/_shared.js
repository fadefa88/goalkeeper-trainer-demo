const textEncoder = new TextEncoder();

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

export async function hashPassword(secret, salt, iterations = 150000) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: base64UrlToBytes(salt), iterations, hash: "SHA-256" }, key, 256);
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

export async function loadProfile(env, userId) {
  const settings = await env.DB.prepare("select * from user_settings where user_id = ?").bind(userId).first();
  if (!settings) return null;
  const keepers = await env.DB.prepare("select * from keepers where user_id = ? order by display_order asc, created_at asc").bind(userId).all();
  return {
    keepersCount: settings.keepers_count,
    sportType: settings.sport,
    level: settings.level,
    sessionsPerWeek: settings.sessions_per_week,
    sessionDuration: settings.session_duration,
    keepers: (keepers.results || []).map(mapKeeper)
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
  const rows = await env.DB.prepare("select * from training_sessions where user_id = ? order by session_date desc, created_at desc").bind(userId).all();
  return (rows.results || []).map(mapSession);
}
