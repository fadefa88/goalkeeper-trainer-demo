import { assertSameOrigin, buildProfileExtraStatements, error, json, loadProfile, readJson, requireAuth } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;
  return json({ profile: await loadProfile(env, user.id) });
}

export async function onRequestPut({ request, env }) {
  try {
    return await savePut(request, env);
  } catch (err) {
    // Senza questo try/catch, un'eccezione qui (es. un mismatch tra
    // placeholder SQL e valori bindati) risale non gestita e Cloudflare
    // restituisce una pagina HTML di errore generica invece di JSON: il
    // client la interpreta come testo d'errore e la mostra per intero.
    console.error("profile PUT failed", err);
    return error(`Errore salvataggio profilo: ${err?.message || String(err || "errore sconosciuto")}`, 500);
  }
}

async function savePut(request, env) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const body = await readJson(request);
  const profile = body.profile || body;
  if (!profile) return error("Profilo mancante", 400);

  const sport = profile.sportType || "calcio";
  const level = profile.level || "medio";
  const keepers = Array.isArray(profile.keepers) ? profile.keepers : [];
  const now = new Date().toISOString();

  const statements = [];

  statements.push(env.DB.prepare("insert into user_settings (user_id, keepers_count, sport, level, sessions_per_week, session_duration, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(user_id) do update set keepers_count = excluded.keepers_count, sport = excluded.sport, level = excluded.level, sessions_per_week = excluded.sessions_per_week, session_duration = excluded.session_duration, updated_at = excluded.updated_at")
    .bind(user.id, Number(profile.keepersCount || 3), sport, level, Number(profile.sessionsPerWeek || 2), Number(profile.sessionDuration || 60), now, now));

  // Upsert per id invece di "delete all + reinsert": preserva l'identità di ogni
  // portiere (keeper_id resta valido su training_sessions / presenze / storico
  // fisico) anche quando il profilo viene salvato più volte di seguito.
  const existingRows = await env.DB.prepare("select id from keepers where user_id = ?").bind(user.id).all();
  const existingIds = new Set((existingRows.results || []).map((row) => row.id));
  const keptIds = new Set();

  keepers.forEach((keeper, i) => {
    const reuseId = Boolean(keeper.id) && existingIds.has(keeper.id);
    const id = reuseId ? keeper.id : crypto.randomUUID();
    keptIds.add(id);
    const name = keeper.name || `Portiere ${i + 1}`;
    const height = keeper.height ?? null;
    const weight = keeper.weight ?? null;
    const broadJump = keeper.broadJump ?? null;
    const verticalJump = keeper.verticalJump ?? null;
    const halfHeightJump = keeper.halfHeightJump ?? null;
    const twoPostsTest = keeper.twoPostsTest ?? null;

    if (reuseId) {
      statements.push(env.DB.prepare("update keepers set name = ?, height_cm = ?, weight_kg = ?, sport = ?, level = ?, standing_broad_jump_cm = ?, standing_vertical_jump_cm = ?, standing_half_height_jump_cm = ?, two_posts_test_sec = ?, display_order = ?, updated_at = ? where id = ? and user_id = ?")
        .bind(name, height, weight, sport, level, broadJump, verticalJump, halfHeightJump, twoPostsTest, i, now, id, user.id));
    } else {
      statements.push(env.DB.prepare("insert into keepers (id, user_id, name, height_cm, weight_kg, sport, level, standing_broad_jump_cm, standing_vertical_jump_cm, standing_half_height_jump_cm, two_posts_test_sec, display_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, user.id, name, height, weight, sport, level, broadJump, verticalJump, halfHeightJump, twoPostsTest, i, now, now));
    }
  });

  // Cancella solo i portieri che il client ha effettivamente rimosso dalla lista.
  existingIds.forEach((id) => {
    if (!keptIds.has(id)) statements.push(env.DB.prepare("delete from keepers where id = ? and user_id = ?").bind(id, user.id));
  });

  // Storico fisico e allenamenti salvati: aggiornati SOLO se il body li contiene
  // davvero. Un salvataggio del profilo base (che non li conosce) non genera
  // nessuna statement per loro, quindi non può cancellarli.
  statements.push(...await buildProfileExtraStatements(env, user.id, profile));

  if (statements.length) await env.DB.batch(statements);

  return json({ profile: await loadProfile(env, user.id) });
}
