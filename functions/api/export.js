import { json, loadProfile, loadSessions, requireAuth } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;
  return json({
    version: 1,
    mode: "d1",
    exportedAt: new Date().toISOString(),
    profile: await loadProfile(env, user.id),
    history: await loadSessions(env, user.id)
  });
}
