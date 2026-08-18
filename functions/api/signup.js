import { assertSameOrigin, createSession, error, hashPassword, isValidEmail, json, normalizeEmail, randomToken, readJson, sessionCookie } from "./_shared.js";

function dbGuard(env) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return error("Binding D1 mancante: collega il database gk-trainer-db con nome variabile DB.", 500);
  }
  return null;
}

function exceptionError(err) {
  const message = err?.message || String(err || "errore sconosciuto");
  return error(`Errore signup: ${message}`, 500);
}

export async function onRequestPost({ request, env }) {
  try {
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const dbError = dbGuard(env);
    if (dbError) return dbError;

    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const secret = String(body.password || "");

    if (!isValidEmail(email)) return error("Email non valida", 400);
    if (secret.length < 8) return error("Password minima: 8 caratteri", 400);

    const existing = await env.DB.prepare("select id from users where email = ? limit 1").bind(email).first();
    if (existing) return error("Account già esistente", 409);

    const salt = randomToken(16);
    const iterations = 150000;
    const passwordHash = await hashPassword(secret, salt, iterations);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare("insert into users (id, email, password_hash, salt, iterations, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)")
      .bind(userId, email, passwordHash, salt, iterations, now, now).run();

    const token = await createSession(env, userId);
    return json({ user: { id: userId, email } }, 201, { "Set-Cookie": sessionCookie(token) });
  } catch (err) {
    console.error("signup failed", err);
    return exceptionError(err);
  }
}
