import { requireAuth } from "../../_shared.js";

// Bucket R2 privato: nessun oggetto è mai esposto con un URL diretto. Questo
// è l'unico modo in cui il browser vede un video, ed è per questo protetto
// da id+user_id come qualunque altro dato dell'account.
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  let start = startStr ? Number(startStr) : null;
  let end = endStr ? Number(endStr) : null;
  if (start === null && end !== null) { start = Math.max(0, size - end); end = size - 1; }
  if (start === null) return null;
  if (end === null || end >= size) end = size - 1;
  if (start > end || start < 0) return null;
  return { offset: start, length: end - start + 1, end };
}

export async function onRequestGet({ request, env, params }) {
  const { response, user } = await requireAuth(env, request);
  if (response) return response;

  const row = await env.DB.prepare("select video_status, video_storage_key from custom_exercises where id = ? and user_id = ?")
    .bind(params.id, user.id).first();
  if (!row || row.video_status !== "ready" || !row.video_storage_key) {
    return new Response("Video non disponibile", { status: 404 });
  }
  if (!env.EXERCISE_VIDEOS) return new Response("Storage video non configurato", { status: 503 });

  const head = await env.EXERCISE_VIDEOS.head(row.video_storage_key);
  if (!head) return new Response("Video non disponibile", { status: 404 });

  const range = parseRange(request.headers.get("Range"), head.size);
  const object = range
    ? await env.EXERCISE_VIDEOS.get(row.video_storage_key, { range: { offset: range.offset, length: range.length } })
    : await env.EXERCISE_VIDEOS.get(row.video_storage_key);
  if (!object) return new Response("Video non disponibile", { status: 404 });

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    // Privato all'utente proprietario: nessuna cache condivisa/intermedia.
    "Cache-Control": "private, max-age=3600"
  });
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.end}/${head.size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(head.size));
  return new Response(object.body, { status: 200, headers });
}
