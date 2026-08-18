import { assertSameOrigin, createSession, error, hashPassword, json, normalizeEmail, readJson, sessionCookie } from "./_shared.js";

function dbGuard(env) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return error("Binding D1 mancante: collega il database gk-trainer-db con nome variabile DB.", 500);
  }
  return null;
}

function exceptionError(err) {
  const message = err?.message || String(err || "errore sconosciuto");
  return error(`Errore login: ${message}`, 500);
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
    const user = await env.DB.prepare("select * from users where email = ? limit 1").bind(email).first();
    if (!user) return error("Credenziali non valide", 401);

    const candidate = await hashPassword(secret, user.salt, user.iterations);
    if (candidate !== user.password_hash) return error("Credenziali non valide", 401);

    const token = await createSession(env, user.id);
    return json({ user: { id: user.id, email: user.email } }, 200, { "Set-Cookie": sessionCookie(token) });
  } catch (err) {
    console.error("login failed", err);
    return exceptionError(err);
  }
}
