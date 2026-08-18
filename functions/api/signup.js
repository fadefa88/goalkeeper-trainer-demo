import { assertSameOrigin, createSession, error, hashPassword, isValidEmail, json, normalizeEmail, randomToken, readJson, sessionCookie } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

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
}
