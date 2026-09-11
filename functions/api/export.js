import { json, loadClubPreference, loadProfile, loadSessions, requireAuth } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;
  return json({
    version: 1,
    mode: "d1",
    exportedAt: new Date().toISOString(),
    profile: await loadProfile(env, user.id),
    history: await loadSessions(env, user.id),
    // Preferenza squadra/tema: passthrough best-effort, vedi import.js.
    // Assente in un export "version: 1" più vecchio -> import.js la lascia
    // semplicemente intatta, non la azzera.
    clubPreference: await loadClubPreference(env, user.id)
  });
}
