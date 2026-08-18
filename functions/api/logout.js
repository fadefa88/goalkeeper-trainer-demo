import { assertSameOrigin, clearSessionCookie, json, requireUser } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const user = await requireUser(env, request);
  if (user?.sessionId) {
    await env.DB.prepare("delete from auth_sessions where id = ?").bind(user.sessionId).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}
