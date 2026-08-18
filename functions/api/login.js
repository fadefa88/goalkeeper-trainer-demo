import { assertSameOrigin, createSession, error, hashPassword, json, normalizeEmail, readJson, sessionCookie } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const secret = String(body.password || "");
  const user = await env.DB.prepare("select * from users where email = ? limit 1").bind(email).first();
  if (!user) return error("Credenziali non valide", 401);

  const candidate = await hashPassword(secret, user.salt, user.iterations);
  if (candidate !== user.password_hash) return error("Credenziali non valide", 401);

  const token = await createSession(env, user.id);
  return json({ user: { id: user.id, email: user.email } }, 200, { "Set-Cookie": sessionCookie(token) });
}
