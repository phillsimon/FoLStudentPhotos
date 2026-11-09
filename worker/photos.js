// Real photos: uploads to R2, the student's picks, Phillip's review, and the homepage card photo.
//
// Flow: Phillip uploads a student's photos (private). The student ticks the ones they want on their page,
// which sends them to Phillip's review queue. Phillip approves (live) or declines. The student also picks
// a card photo for the homepage, which goes live when Phillip approves it. Phillip's own choices publish
// immediately. A student can take a photo down at any time without review.

import { students } from "./data.js";
import { HttpError, readJson, isAdmin, canEditStudent, requireUser, requireAdmin } from "./http.js";

// Most photos a student's page can show, counting ones waiting for review.
export const MAX_SHOWN = 25;

const MAX_ORIGINAL = 95 * 1024 * 1024; // The Worker's request limit is 100 MB.
const MAX_VARIANT = 15 * 1024 * 1024;

const keyFor = (p, variant) => `students/${p.student_slug}/${p.id}/${variant}`;
const ORIGINAL = "original";

export const photoUrls = (p) => ({ thumb: `/api/photos/${p.id}/thumb.jpg`, web: `/api/photos/${p.id}/web.jpg` });

// The shape the frontend uses for both real photos and placeholders.
export const toClient = (p, text) => ({
  id: p.id,
  width: p.width,
  height: p.height,
  title: text?.title ?? "",
  caption: text?.caption ?? "",
  ...photoUrls(p),
});

export async function photosFor(env, slug) {
  const { results } = await env.DB.prepare("SELECT * FROM photos WHERE student_slug = ? ORDER BY sort_key, id").bind(slug).all();
  return results;
}

export async function getPhoto(env, id) {
  return env.DB.prepare("SELECT * FROM photos WHERE id = ?").bind(id).first();
}

function requireBucket(env) {
  if (!env.PHOTOS) throw new HttpError(503, "storage_missing");
  return env.PHOTOS;
}

// ---------- Upload (Phillip only) ----------

export async function uploadPhoto(request, env, slug) {
  const user = await requireAdmin(env, request);
  if (!students.some((s) => s.slug === slug)) throw new HttpError(404, "not_found");
  const bucket = requireBucket(env);

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "bad_request");
  }
  const original = form.get("original");
  const web = form.get("web");
  const thumb = form.get("thumb");
  let meta;
  try {
    meta = JSON.parse(form.get("meta") || "{}");
  } catch {
    throw new HttpError(400, "bad_request");
  }
  if (!(original instanceof File) || !(web instanceof File) || !(thumb instanceof File)) throw new HttpError(400, "bad_request");
  if (!original.type.startsWith("image/") || web.type !== "image/jpeg" || thumb.type !== "image/jpeg") throw new HttpError(400, "bad_type");
  if (original.size > MAX_ORIGINAL || web.size > MAX_VARIANT || thumb.size > MAX_VARIANT) throw new HttpError(413, "too_big");

  const filename = String(meta.filename || original.name || "photo.jpg").replace(/[\\/\0"]/g, "_").slice(0, 200);
  const width = Math.round(Number(meta.width));
  const height = Math.round(Number(meta.height));
  if (!(width > 0 && height > 0 && width < 100000 && height < 100000)) throw new HttpError(400, "bad_request");
  const capture = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(meta.capture_date || "") ? meta.capture_date : null;

  // Same file name and size already on this student: skip it.
  const dupe = await env.DB.prepare("SELECT id FROM photos WHERE student_slug = ? AND filename = ? AND original_bytes = ?")
    .bind(slug, filename, original.size).first();
  if (dupe) throw new HttpError(409, "duplicate");

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const row = { id, student_slug: slug };
  const now = new Date().toISOString();
  await Promise.all([
    bucket.put(keyFor(row, ORIGINAL), original.stream(), { httpMetadata: { contentType: original.type } }),
    bucket.put(keyFor(row, "web.jpg"), web.stream(), { httpMetadata: { contentType: "image/jpeg" } }),
    bucket.put(keyFor(row, "thumb.jpg"), thumb.stream(), { httpMetadata: { contentType: "image/jpeg" } }),
  ]);

  const title = String(meta.title || "").replace(/\s+/g, " ").trim().slice(0, 100);
  const caption = String(meta.caption || "").replace(/\r\n?/g, "\n").trim().slice(0, 500);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO photos (id, student_slug, filename, original_type, original_bytes, web_bytes, thumb_bytes, width, height, capture_date, sort_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, slug, filename, original.type, original.size, web.size, thumb.size, width, height, capture, `${capture || "9999"}|${filename.toLowerCase()}`, now),
    // Titles and captions from Lightroom start out as Phillip's text, so they don't show as student edits.
    ...(title || caption
      ? [env.DB.prepare("INSERT OR REPLACE INTO photo_text (photo_id, title, caption, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, title, caption, user.id, now)]
      : []),
  ]);
  return Response.json({ id });
}

export async function deletePhoto(request, env, id) {
  await requireAdmin(env, request);
  const p = await getPhoto(env, id);
  if (!p) throw new HttpError(404, "not_found");
  await requireBucket(env).delete([keyFor(p, ORIGINAL), keyFor(p, "web.jpg"), keyFor(p, "thumb.jpg")]);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(id),
    env.DB.prepare("DELETE FROM photo_text WHERE photo_id = ?").bind(id),
    env.DB.prepare("UPDATE students SET cover_photo_id = NULL WHERE cover_photo_id = ?").bind(id),
    env.DB.prepare("UPDATE students SET cover_requested_id = NULL, cover_requested_at = NULL WHERE cover_requested_id = ?").bind(id),
  ]);
  return Response.json({ ok: true });
}

// ---------- Images ----------

// Live photos are public and cached for a year. Anything not yet live is only for the student and Phillip.
export async function serveImage(request, env, id, variant, user) {
  const p = await getPhoto(env, id);
  if (!p) throw new HttpError(404, "not_found");
  const live = p.status === "live";
  if (!live && !canEditStudent(user, p.student_slug)) throw new HttpError(404, "not_found");
  const obj = await requireBucket(env).get(keyFor(p, `${variant}.jpg`));
  if (!obj) throw new HttpError(404, "not_found");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": live ? "public, max-age=31536000, immutable" : "private, max-age=3600",
      ETag: obj.httpEtag,
    },
  });
}

// ---------- The student's picks ----------

// body: { show: [photo ids], cover: photo id or null }
export async function saveSelection(request, env, slug) {
  const user = await requireUser(env, request);
  if (!canEditStudent(user, slug)) throw new HttpError(403, "forbidden");
  const body = await readJson(request);
  const show = new Set(Array.isArray(body.show) ? body.show.map(String) : []);
  const cover = body.cover ? String(body.cover) : null;
  const all = await photosFor(env, slug);
  if (cover && !all.some((p) => p.id === cover)) throw new HttpError(400, "bad_request");
  if (cover && !show.has(cover)) throw new HttpError(400, "cover_not_shown");
  // Phillip's save leaves a student's waiting picks in place, so they count toward the limit too.
  const waitingKept = isAdmin(user) ? all.filter((p) => p.status === "requested" && !show.has(p.id)).length : 0;
  if (all.filter((p) => show.has(p.id)).length + waitingKept > MAX_SHOWN) throw new HttpError(400, "too_many");
  const student = await env.DB.prepare("SELECT cover_photo_id, cover_requested_id, cover_requested_at FROM students WHERE slug = ?").bind(slug).first();
  const now = new Date().toISOString();
  const admin = isAdmin(user);
  const stmts = [];
  const setStatus = (p, status, extra = "") =>
    stmts.push(env.DB.prepare(`UPDATE photos SET status = ?${extra} WHERE id = ?`).bind(status, ...(extra ? [now] : []), p.id));

  const liveAfter = new Set();
  for (const p of all) {
    const wanted = show.has(p.id);
    if (admin) {
      // Phillip's choices publish now. A student's pick he hasn't ticked stays in his queue.
      if (wanted && p.status !== "live") setStatus(p, "live", ", reviewed_at = ?");
      else if (!wanted && p.status === "live") setStatus(p, "private");
      if (wanted) liveAfter.add(p.id);
    } else {
      // A student's pick waits for review. Taking a photo down needs no review.
      if (wanted && (p.status === "private" || p.status === "declined")) setStatus(p, "requested", ", requested_at = ?");
      else if (!wanted && (p.status === "requested" || p.status === "live")) setStatus(p, "private");
      if (wanted && p.status === "live") liveAfter.add(p.id);
    }
  }

  // Card photo.
  let coverId = student?.cover_photo_id ?? null;
  let coverRequest = student?.cover_requested_id ?? null;
  if (admin) {
    // Phillip's pick replaces the card photo now, and settles any pick waiting for review.
    if (cover !== coverId) coverRequest = null;
    if (cover === coverRequest) coverRequest = null;
    coverId = cover;
  } else {
    // The student's pick waits for review. Picking the approved one again withdraws the request.
    coverRequest = cover && cover !== coverId ? cover : null;
  }
  if (coverId && !liveAfter.has(coverId)) coverId = null; // Its photo came down.
  const keepAt = coverRequest && coverRequest === student?.cover_requested_id;
  stmts.push(
    env.DB.prepare("UPDATE students SET cover_photo_id = ?1, cover_requested_id = ?2, cover_requested_at = ?3 WHERE slug = ?4")
      .bind(coverId, coverRequest, coverRequest ? (keepAt ? student.cover_requested_at ?? now : now) : null, slug)
  );
  await env.DB.batch(stmts);
  return Response.json({ ok: true });
}

// ---------- Phillip's review ----------

// body: { ids: [...], action: "approve" | "decline" }. Only photos waiting for review change.
export async function reviewPhotos(request, env) {
  await requireAdmin(env, request);
  const body = await readJson(request);
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].slice(0, 500) : [];
  if (!ids.length || !["approve", "decline"].includes(body.action)) throw new HttpError(400, "bad_request");
  const status = body.action === "approve" ? "live" : "declined";
  const now = new Date().toISOString();
  await env.DB.batch(
    ids.map((id) => env.DB.prepare("UPDATE photos SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'requested'").bind(status, now, id))
  );
  if (status === "declined") {
    // A declined photo can't be the card photo either.
    await env.DB.batch(
      ids.map((id) => env.DB.prepare("UPDATE students SET cover_requested_id = NULL, cover_requested_at = NULL WHERE cover_requested_id = ?").bind(id))
    );
  }
  return Response.json({ ok: true });
}

// body: { action: "approve" | "decline" }. Approving the card photo also approves the photo itself.
export async function reviewCover(request, env, slug) {
  await requireAdmin(env, request);
  const body = await readJson(request);
  const s = await env.DB.prepare("SELECT cover_requested_id FROM students WHERE slug = ?").bind(slug).first();
  if (!s?.cover_requested_id) throw new HttpError(404, "not_found");
  const now = new Date().toISOString();
  if (body.action === "approve") {
    const p = await getPhoto(env, s.cover_requested_id);
    if (!p || !["requested", "live"].includes(p.status)) throw new HttpError(409, "not_available");
    await env.DB.batch([
      env.DB.prepare("UPDATE photos SET status = 'live', reviewed_at = ? WHERE id = ? AND status = 'requested'").bind(now, p.id),
      env.DB.prepare("UPDATE students SET cover_photo_id = ?, cover_requested_id = NULL, cover_requested_at = NULL WHERE slug = ?").bind(p.id, slug),
    ]);
  } else if (body.action === "decline") {
    await env.DB.prepare("UPDATE students SET cover_requested_id = NULL, cover_requested_at = NULL WHERE slug = ?").bind(slug).run();
  } else {
    throw new HttpError(400, "bad_request");
  }
  return Response.json({ ok: true });
}

// What /admin needs: photos waiting for review, card photo picks, and storage used.
export async function reviewQueue(env) {
  const [photos, covers, bytes] = await Promise.all([
    env.DB.prepare(
      `SELECT p.id, p.student_slug, p.width, p.height, p.requested_at, s.first_name
       FROM photos p JOIN students s ON s.slug = p.student_slug
       WHERE p.status = 'requested' ORDER BY s.first_name, p.sort_key`
    ).all(),
    env.DB.prepare(
      `SELECT s.slug, s.first_name, s.cover_requested_id, s.cover_requested_at, p.status
       FROM students s JOIN photos p ON p.id = s.cover_requested_id ORDER BY s.cover_requested_at`
    ).all(),
    env.DB.prepare("SELECT COALESCE(SUM(original_bytes + web_bytes + thumb_bytes), 0) AS n FROM photos").first(),
  ]);
  return {
    photo_reviews: photos.results.map((p) => ({ ...p, ...photoUrls(p) })),
    cover_reviews: covers.results.map((c) => ({ ...c, ...photoUrls({ id: c.cover_requested_id }) })),
    storage_bytes: bytes?.n ?? 0,
  };
}
