import { json, requireAuth } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;
  return json({ user: { id: user.id, email: user.email } });
}
