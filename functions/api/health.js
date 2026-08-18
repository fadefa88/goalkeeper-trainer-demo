import { json } from "./_shared.js";

export async function onRequestGet({ env }) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return json({
      ok: false,
      db: false,
      error: "Binding D1 mancante: collega gk-trainer-db con nome variabile DB."
    }, 500);
  }

  try {
    const tables = await env.DB
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all();

    return json({
      ok: true,
      db: true,
      tables: (tables.results || []).map((row) => row.name)
    });
  } catch (err) {
    return json({
      ok: false,
      db: true,
      error: err?.message || String(err || "errore sconosciuto")
    }, 500);
  }
}
