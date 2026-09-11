import { assertSameOrigin, json, requireAuth } from "./_shared.js";

export async function onRequestDelete({ request, env }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  // I video R2 vanno cancellati PRIMA di svuotare la tabella: dopo il delete
  // non avremmo più le video_storage_key per trovarli (nessun file orfano).
  if (env.EXERCISE_VIDEOS) {
    const videos = await env.DB.prepare("select video_storage_key from custom_exercises where user_id = ? and video_storage_key is not null").bind(user.id).all();
    await Promise.all((videos.results || []).map((row) =>
      env.EXERCISE_VIDEOS.delete(row.video_storage_key).catch((err) => console.warn("Cancellazione video R2 non riuscita", row.video_storage_key, err))
    ));
  }

  await env.DB.prepare("delete from training_sessions where user_id = ?").bind(user.id).run();
  await env.DB.prepare("delete from keepers where user_id = ?").bind(user.id).run();
  await env.DB.prepare("delete from user_settings where user_id = ?").bind(user.id).run();
  await env.DB.prepare("delete from custom_exercises where user_id = ?").bind(user.id).run();
  return json({ ok: true });
}
