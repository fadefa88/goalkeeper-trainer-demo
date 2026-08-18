import { assertSameOrigin, json, requireAuth } from "./_shared.js";

export async function onRequestDelete({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  await env.DB.prepare("delete from training_sessions where user_id = ?").bind(user.id).run();
  await env.DB.prepare("delete from keepers where user_id = ?").bind(user.id).run();
  await env.DB.prepare("delete from user_settings where user_id = ?").bind(user.id).run();
  return json({ ok: true });
}
