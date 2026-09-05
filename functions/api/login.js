import { assertSameOrigin, createSession, error, hashPassword, json, loadProfile, normalizeEmail, PASSWORD_ITERATIONS, randomToken, readJson, sessionCookie } from "./_shared.js";

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

// Credenziali dell'account demo per la revisione App Store: prima erano una
// stringa fissa nel sorgente (visibile per sempre nella cronologia git, e
// chiunque conoscesse l'email poteva "reimpostarla" tentando quel login).
// Vanno impostate come variabili d'ambiente su Cloudflare Pages (Settings >
// Environment variables): REVIEW_EMAIL, REVIEW_PASSWORD. Se non configurate,
// il login di revisione è semplicemente disattivato.
function reviewCredentials(env) {
  return { email: env?.REVIEW_EMAIL || "", password: env?.REVIEW_PASSWORD || "" };
}

function isReviewLogin(env, email, secret) {
  const { email: reviewEmail, password: reviewPassword } = reviewCredentials(env);
  return Boolean(reviewEmail) && Boolean(reviewPassword) && email === reviewEmail && secret === reviewPassword;
}

async function ensureReviewProfile(env, userId) {
  const existing = await loadProfile(env, userId);
  if (existing) return;

  const now = new Date().toISOString();
  await env.DB.prepare("insert into user_settings (user_id, keepers_count, sport, level, sessions_per_week, session_duration, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(user_id) do nothing")
    .bind(userId, 3, "calcio", "medio", 2, 60, now, now).run();

  const keepers = [
    { name: "Portiere Demo 1", height: 178, weight: 72, broadJump: 205, verticalJump: 42, halfHeightJump: 158, twoPostsTest: 5.84 },
    { name: "Portiere Demo 2", height: 171, weight: 66, broadJump: 188, verticalJump: 38, halfHeightJump: 146, twoPostsTest: 6.12 },
    { name: "Portiere Demo 3", height: 183, weight: 76, broadJump: 214, verticalJump: 45, halfHeightJump: 164, twoPostsTest: 5.62 }
  ];

  for (let i = 0; i < keepers.length; i++) {
    const keeper = keepers[i];
    await env.DB.prepare("insert into keepers (id, user_id, name, height_cm, weight_kg, sport, level, standing_broad_jump_cm, standing_vertical_jump_cm, standing_half_height_jump_cm, two_posts_test_sec, display_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(
        crypto.randomUUID(),
        userId,
        keeper.name,
        keeper.height,
        keeper.weight,
        "calcio",
        "medio",
        keeper.broadJump,
        keeper.verticalJump,
        keeper.halfHeightJump,
        keeper.twoPostsTest,
        i,
        now,
        now
      ).run();
  }
}

async function createOrRepairReviewUser(env) {
  const { email: reviewEmail, password: reviewPassword } = reviewCredentials(env);
  const salt = randomToken(16);
  const passwordHash = await hashPassword(reviewPassword, salt, PASSWORD_ITERATIONS);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("select * from users where email = ? limit 1").bind(reviewEmail).first();

  if (existing) {
    await env.DB.prepare("update users set password_hash = ?, salt = ?, iterations = ?, updated_at = ? where id = ?")
      .bind(passwordHash, salt, PASSWORD_ITERATIONS, now, existing.id).run();
    await ensureReviewProfile(env, existing.id);
    return { ...existing, password_hash: passwordHash, salt, iterations: PASSWORD_ITERATIONS };
  }

  const userId = crypto.randomUUID();
  await env.DB.prepare("insert into users (id, email, password_hash, salt, iterations, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)")
    .bind(userId, reviewEmail, passwordHash, salt, PASSWORD_ITERATIONS, now, now).run();
  await ensureReviewProfile(env, userId);
  return { id: userId, email: reviewEmail, password_hash: passwordHash, salt, iterations: PASSWORD_ITERATIONS };
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
    let user = await env.DB.prepare("select * from users where email = ? limit 1").bind(email).first();

    if (!user && isReviewLogin(env, email, secret)) {
      user = await createOrRepairReviewUser(env);
    }

    if (!user) return error("Credenziali non valide", 401);

    let candidate = await hashPassword(secret, user.salt, user.iterations);
    if (candidate !== user.password_hash && isReviewLogin(env, email, secret)) {
      user = await createOrRepairReviewUser(env);
      candidate = await hashPassword(secret, user.salt, user.iterations);
    }

    if (candidate !== user.password_hash) return error("Credenziali non valide", 401);

    if (isReviewLogin(env, email, secret)) {
      await ensureReviewProfile(env, user.id);
    }

    const token = await createSession(env, user.id);
    return json({ user: { id: user.id, email: user.email } }, 200, { "Set-Cookie": sessionCookie(token) });
  } catch (err) {
    console.error("login failed", err);
    return exceptionError(err);
  }
}
