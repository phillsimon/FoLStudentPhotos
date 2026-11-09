import { students, site, findPhoto } from "./data.js";
import { HttpError, readJson, isAdmin, canEditStudent, requireUser, requireAdmin } from "./http.js";
import { ensureDb } from "./schema.js";
import { translate } from "./translate.js";
import { notify } from "./notify.js";
import {
  toClient, photosFor, getPhoto, uploadPhoto, deletePhoto, serveImage, saveSelection, reviewPhotos, reviewCover, reviewQueue,
} from "./photos.js";
import {
  hashPassword, verifyPassword, makeTempPassword, createSession, destroySession, currentUser,
  dropUserSessions, isRateLimited, recordFailure, clearFailures,
} from "./auth.js";

// Spanish-speaking countries get Spanish by default; everyone else gets English.
const SPANISH_COUNTRIES = new Set([
  "DO", "ES", "MX", "GT", "HN", "SV", "NI", "CR", "PA", "CU", "PR",
  "CO", "VE", "EC", "PE", "BO", "CL", "AR", "UY", "PY", "GQ",
]);

function pickLanguage(request) {
  const cookie = request.headers.get("Cookie") || "";
  const saved = cookie.match(/(?:^|;\s*)lang=(en|es)/);
  if (saved) return { lang: saved[1], source: "saved" };
  const country = request.cf?.country;
  if (country && SPANISH_COUNTRIES.has(country)) return { lang: "es", source: "country" };
  return { lang: "en", source: country ? "country" : "default" };
}

// Placeholder image: a soft gradient with the student's name and photo number.
function placeholderSvg(student, photo) {
  const { width: w, height: h, hue } = photo;
  const n = photo.id.split("-").pop();
  const fs = Math.round(Math.min(w, h) / 9);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 45% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 40% 32%)"/>
</linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,.85)"
 font-family="system-ui, sans-serif" font-size="${fs}" font-weight="600">${student.first_name} · ${n}</text>
</svg>`;
}

const LIMITS = { title: 100, caption: 500, studentStatement: 1500, adminStatement: 3000, note: 1000, site: 20000, password: 200 };
const MIN_PASSWORD = 8;
const SITE_FIELDS = ["eyebrow_en", "eyebrow_es", "title_en", "title_es", "meta_en", "meta_es", "workshop_en", "workshop_es"];
const SINGLE_LINE_SITE_FIELDS = new Set(SITE_FIELDS.filter((f) => !f.startsWith("workshop")));

// Plain text only. Line breaks are kept; the site shows each one as a paragraph break.
function cleanText(value, max) {
  const text = (typeof value === "string" ? value : "")
    .replace(/\r\n?/g, "\n")
    .replace(/<\/?[a-z!][^>]*>/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (text.length > max) throw new HttpError(400, "too_long");
  return text;
}
const cleanLine = (value, max) => cleanText(value, max).replace(/\s*\n\s*/g, " ");

const publicUser = (u) =>
  u && { login: u.login, display_name: u.display_name, role: u.role, student_slug: u.student_slug, must_change: !!u.must_change };

// The super admin account is created from ADMIN_EMAIL and the ADMIN_PASSWORD secret the first time anyone logs in.
async function ensureAdmin(env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE role = 'superadmin'").first();
  if (exists) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (login, display_name, role, password_hash, password_changed_at, created_at) VALUES (?, 'Phillip', 'superadmin', ?, ?, ?)"
  ).bind(env.ADMIN_EMAIL.toLowerCase(), await hashPassword(env.ADMIN_PASSWORD), new Date().toISOString(), new Date().toISOString()).run();
}

async function login(request, env) {
  const body = await readJson(request);
  const name = String(body.login || "").trim().toLowerCase().slice(0, 200);
  const password = String(body.password || "").slice(0, LIMITS.password);
  if (!name || !password) throw new HttpError(400, "bad_login");
  await ensureAdmin(env);
  if (await isRateLimited(env, request, name)) throw new HttpError(429, "too_many_attempts");

  const user = await env.DB.prepare("SELECT * FROM users WHERE login = ?").bind(name).first();
  if (!(await verifyPassword(password, user?.password_hash))) {
    await recordFailure(env, request, name);
    throw new HttpError(401, "bad_login");
  }
  await clearFailures(env, name);
  await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  const cookie = await createSession(env, request, user.id);
  return Response.json({ user: publicUser(user) }, { headers: { "Set-Cookie": cookie } });
}

async function changePassword(request, env) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, "not_signed_in");
  const body = await readJson(request);
  const next = String(body.new_password || "");
  if (next.length < MIN_PASSWORD) throw new HttpError(400, "password_short");
  if (next.length > LIMITS.password) throw new HttpError(400, "too_long");
  if (await verifyPassword(next, user.password_hash)) throw new HttpError(400, "password_same");
  // Someone on a temporary password has just entered it, so only a regular change asks again.
  if (!user.must_change && !(await verifyPassword(String(body.current_password || ""), user.password_hash))) {
    throw new HttpError(401, "bad_current_password");
  }
  await env.DB.prepare("UPDATE users SET password_hash = ?, must_change = 0, temp_issued_at = NULL, password_changed_at = ? WHERE id = ?")
    .bind(await hashPassword(next), new Date().toISOString(), user.id).run();
  // Sign out everywhere else, then keep this device signed in.
  await dropUserSessions(env, user.id);
  const cookie = await createSession(env, request, user.id);
  if (user.role === "student") {
    const first = user.must_change;
    await notify(env, request, `${user.display_name} ${first ? "signed in and chose a password" : "changed their password"}`, [
      first
        ? `${user.display_name} signed in with the temporary password and chose their own password.`
        : `${user.display_name} changed their password.`,
    ]);
  }
  return Response.json({ user: publicUser({ ...user, must_change: 0 }) }, { headers: { "Set-Cookie": cookie } });
}

async function siteContent(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM site_content").all();
  const merged = { ...site };
  for (const r of results) if (SITE_FIELDS.includes(r.key)) merged[r.key] = r.value;
  return merged;
}

async function photoTexts(env, ids) {
  const { results } = await env.DB.prepare("SELECT photo_id, title, caption FROM photo_text").all();
  const wanted = new Set(ids);
  return new Map(results.filter((r) => wanted.has(r.photo_id)).map((r) => [r.photo_id, r]));
}

// Placeholder photos (with SVG addresses) show until a student has real photos live.
const placeholder = (p) => ({ ...p, thumb: `/api/img/${p.id}.svg`, web: `/api/img/${p.id}.svg` });

async function listStudents(env) {
  const [{ results: live }, { results: rows }] = await Promise.all([
    env.DB.prepare("SELECT id, student_slug, width, height FROM photos WHERE status = 'live' ORDER BY sort_key, id").all(),
    env.DB.prepare("SELECT slug, cover_photo_id FROM students").all(),
  ]);
  const coverOf = new Map(rows.map((r) => [r.slug, r.cover_photo_id]));
  return students.map((s) => {
    const mine = live.filter((p) => p.student_slug === s.slug);
    const cover = mine.find((p) => p.id === coverOf.get(s.slug)) || mine[0];
    return {
      slug: s.slug,
      first_name: s.first_name,
      cover: cover ? toClient(cover) : placeholder(s.photos.find((p) => p.id === s.cover_photo_id)),
      photo_count: mine.length || s.photos.length,
    };
  });
}

async function getStudent(request, env, slug) {
  const i = students.findIndex((s) => s.slug === slug);
  if (i === -1) throw new HttpError(404, "not_found");
  const s = students[i];
  const prev = students[(i - 1 + students.length) % students.length];
  const next = students[(i + 1) % students.length];
  const row = await env.DB.prepare("SELECT * FROM students WHERE slug = ?").bind(slug).first();
  const user = await currentUser(env, request);
  const canEdit = canEditStudent(user, slug);
  const real = await photosFor(env, slug);
  const live = real.filter((p) => p.status === "live");
  const shown = live.length ? live : s.photos;
  const texts = await photoTexts(env, [...shown, ...(canEdit ? real : [])].map((p) => p.id));
  const withText = (p) => (live.length ? toClient(p, texts.get(p.id)) : { ...placeholder(p), ...pickText(texts.get(p.id)) });

  return Response.json({
    ...s,
    statement_es: row?.statement_es ?? "",
    statement_en: row?.statement_en ?? "",
    photos: shown.map(withText),
    prev: { slug: prev.slug, first_name: prev.first_name },
    next: { slug: next.slug, first_name: next.first_name },
    // Only the student who owns this page and the super admin see the unpublished draft and the full photo library.
    ...(canEdit && {
      edit: { draft: row?.draft ?? "", status: row?.status ?? "none", review_note: row?.review_note ?? "" },
      library: real.map((p) => ({ ...toClient(p, texts.get(p.id)), status: p.status, filename: p.filename, bytes: p.original_bytes })),
      cover: { approved: row?.cover_photo_id ?? null, requested: row?.cover_requested_id ?? null },
    }),
  });
}

const pickText = (t) => ({ title: t?.title ?? "", caption: t?.caption ?? "" });

async function saveStatement(request, env, slug) {
  const user = await requireUser(env, request);
  if (!canEditStudent(user, slug)) throw new HttpError(403, "forbidden");
  if (!students.some((s) => s.slug === slug)) throw new HttpError(404, "not_found");
  const body = await readJson(request);
  const now = new Date().toISOString();

  if (isAdmin(user)) {
    // Phillip's edits publish immediately and replace any draft waiting for review.
    const es = cleanText(body.es, LIMITS.adminStatement);
    const en = cleanText(body.en, LIMITS.adminStatement);
    if (!!es !== !!en) throw new HttpError(400, "need_both_languages");
    await env.DB.prepare(
      `UPDATE students SET statement_es = ?, statement_en = ?, draft = '', review_note = '', status = ?, reviewed_at = ?, updated_at = ? WHERE slug = ?`
    ).bind(es, en, es ? "approved" : "none", now, now, slug).run();
  } else {
    // A student's text is held for review. The approved version stays live until Phillip publishes this one.
    const text = cleanText(body.text, LIMITS.studentStatement);
    if (!text) throw new HttpError(400, "empty");
    await env.DB.prepare(
      `UPDATE students SET draft = ?, review_note = '', status = 'submitted', submitted_at = ?, updated_at = ? WHERE slug = ?`
    ).bind(text, now, now, slug).run();
    const name = students.find((x) => x.slug === slug).first_name;
    await notify(env, request, `${name} submitted an artist statement`, [
      `${name} submitted an artist statement for your review:`,
      "",
      text,
    ], `/estudiantes/${slug}`);
  }
  return Response.json({ ok: true });
}

async function requestChanges(request, env, slug) {
  await requireAdmin(env, request);
  const note = cleanText((await readJson(request)).note, LIMITS.note);
  if (!note) throw new HttpError(400, "empty");
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    "UPDATE students SET review_note = ?, status = 'changes_requested', reviewed_at = ?, updated_at = ? WHERE slug = ? AND draft <> ''"
  ).bind(note, now, now, slug).run();
  if (!r.meta.changes) throw new HttpError(404, "not_found");
  return Response.json({ ok: true });
}

async function savePhotoText(request, env, id) {
  const user = await requireUser(env, request);
  const slug = findPhoto(id)?.student.slug ?? (await getPhoto(env, id))?.student_slug;
  if (!slug) throw new HttpError(404, "not_found");
  if (!canEditStudent(user, slug)) throw new HttpError(403, "forbidden");
  const body = await readJson(request);
  const title = cleanLine(body.title, LIMITS.title);
  const caption = cleanText(body.caption, LIMITS.caption);
  await env.DB.prepare(
    `INSERT INTO photo_text (photo_id, title, caption, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(photo_id) DO UPDATE SET title = ?2, caption = ?3, updated_by = ?4, updated_at = ?5`
  ).bind(id, title, caption, user.id, new Date().toISOString()).run();
  return Response.json({ ok: true, title, caption });
}

async function saveSite(request, env) {
  await requireAdmin(env, request);
  const body = await readJson(request);
  const now = new Date().toISOString();
  const values = SITE_FIELDS.map((f) => [f, SINGLE_LINE_SITE_FIELDS.has(f) ? cleanLine(body[f], 300) : cleanText(body[f], LIMITS.site)]);
  if (values.some(([, v]) => !v)) throw new HttpError(400, "empty");
  await env.DB.batch(
    values.map(([k, v]) =>
      env.DB.prepare(
        "INSERT INTO site_content (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3"
      ).bind(k, v, now)
    )
  );
  return Response.json({ ok: true });
}

async function translateText(request, env) {
  await requireAdmin(env, request);
  const body = await readJson(request);
  const text = cleanText(body.text, LIMITS.adminStatement);
  const source = body.source === "en" ? "en" : "es";
  const target = source === "es" ? "en" : "es";
  if (!text) throw new HttpError(400, "empty");
  try {
    return Response.json({ text: await translate(env, text, source, target) });
  } catch (e) {
    console.error("translate failed", e);
    throw new HttpError(503, "translate_failed");
  }
}

async function adminOverview(request, env) {
  await requireAdmin(env, request);
  const [users, pending, edits, queue, owners] = await Promise.all([
    env.DB.prepare(
      `SELECT id, login, display_name, role, student_slug, must_change, password_hash IS NOT NULL AS has_password, temp_issued_at, password_changed_at, last_login_at
       FROM users ORDER BY role DESC, display_name`
    ).all(),
    env.DB.prepare("SELECT slug, first_name, submitted_at FROM students WHERE status = 'submitted' ORDER BY submitted_at").all(),
    env.DB.prepare(
      `SELECT p.photo_id, p.title, p.caption, p.updated_at, u.display_name
       FROM photo_text p JOIN users u ON u.id = p.updated_by
       WHERE u.role = 'student' ORDER BY p.updated_at DESC LIMIT 20`
    ).all(),
    reviewQueue(env),
    env.DB.prepare("SELECT id, student_slug FROM photos").all(),
  ]);
  const ownerOf = new Map(owners.results.map((r) => [r.id, r.student_slug]));
  return Response.json({
    users: users.results,
    pending: pending.results,
    photo_edits: edits.results.map((e) => ({ ...e, student_slug: findPhoto(e.photo_id)?.student.slug ?? ownerOf.get(e.photo_id) })),
    ...queue,
  });
}

// The password is returned only here and only once, so Phillip can send it. Only its hash is stored.
async function issueTempPassword(request, env, userId) {
  await requireAdmin(env, request);
  const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(userId).first();
  if (!target) throw new HttpError(404, "not_found");
  if (target.role !== "student") throw new HttpError(403, "forbidden");
  const password = makeTempPassword();
  await env.DB.prepare("UPDATE users SET password_hash = ?, must_change = 1, temp_issued_at = ? WHERE id = ?")
    .bind(await hashPassword(password), new Date().toISOString(), userId).run();
  await dropUserSessions(env, userId);
  return Response.json({ password });
}

async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health") {
    return Response.json({ ok: true, country: request.cf?.country ?? null, time: new Date().toISOString() });
  }
  if (path === "/api/locale") {
    return Response.json({ ...pickLanguage(request), country: request.cf?.country ?? null });
  }

  const img = path.match(/^\/api\/img\/([a-z0-9-]+)\.svg$/);
  if (img) {
    const found = findPhoto(img[1]);
    if (!found) throw new HttpError(404, "not_found");
    return new Response(placeholderSvg(found.student, found.photo), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
    });
  }

  // Changes must come from this site's own pages.
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin && new URL(origin).host !== url.host) throw new HttpError(403, "forbidden");
  }

  await ensureDb(env);

  const im = path.match(/^\/api\/photos\/([a-z0-9]+)\/(thumb|web)\.jpg$/);
  if (im && (method === "GET" || method === "HEAD")) return serveImage(request, env, im[1], im[2], await currentUser(env, request));

  if (path === "/api/me" && method === "GET") return Response.json({ user: publicUser(await currentUser(env, request)) });
  if (path === "/api/auth/login" && method === "POST") return login(request, env);
  if (path === "/api/auth/password" && method === "POST") return changePassword(request, env);
  if (path === "/api/auth/logout" && method === "POST") {
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await destroySession(env, request) } });
  }

  if (path === "/api/site") {
    if (method === "PUT") return saveSite(request, env);
    if (method === "GET") return Response.json({ ...(await siteContent(env)), students: await listStudents(env) });
  }
  if (path === "/api/translate" && method === "POST") return translateText(request, env);
  if (path === "/api/admin/overview" && method === "GET") return adminOverview(request, env);
  if (path === "/api/admin/test-email" && method === "POST") {
    await requireAdmin(env, request);
    return Response.json(await notify(env, request, "Test email", ["This is a test from the gallery's admin page. Email notices are working."]));
  }

  let m = path.match(/^\/api\/admin\/users\/(\d+)\/temp-password$/);
  if (m && method === "POST") return issueTempPassword(request, env, Number(m[1]));

  m = path.match(/^\/api\/students\/([a-z0-9-]+)$/);
  if (m && method === "GET") return getStudent(request, env, m[1]);

  m = path.match(/^\/api\/students\/([a-z0-9-]+)\/statement$/);
  if (m && method === "PUT") return saveStatement(request, env, m[1]);

  m = path.match(/^\/api\/students\/([a-z0-9-]+)\/statement\/request-changes$/);
  if (m && method === "POST") return requestChanges(request, env, m[1]);

  m = path.match(/^\/api\/photos\/([a-z0-9-]+)$/);
  if (m && method === "PATCH") return savePhotoText(request, env, m[1]);
  if (m && method === "DELETE") return deletePhoto(request, env, m[1]);

  m = path.match(/^\/api\/students\/([a-z0-9-]+)\/selection$/);
  if (m && method === "PUT") return saveSelection(request, env, m[1]);

  m = path.match(/^\/api\/admin\/students\/([a-z0-9-]+)\/photos$/);
  if (m && method === "POST") return uploadPhoto(request, env, m[1]);

  m = path.match(/^\/api\/admin\/students\/([a-z0-9-]+)\/cover$/);
  if (m && method === "POST") return reviewCover(request, env, m[1]);

  if (path === "/api/admin/photos/review" && method === "POST") return reviewPhotos(request, env);

  throw new HttpError(404, "not_found");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      try {
        const res = await api(request, env, url);
        // Account and draft details must never be cached. The placeholder images may be.
        if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store");
        return res;
      } catch (e) {
        if (e instanceof HttpError) return Response.json({ error: e.code }, { status: e.status, headers: { "Cache-Control": "no-store" } });
        console.error(e);
        return Response.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
      }
    }

    // HTML pages: set <html lang> before the page loads, so the right language shows with no flash.
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("Content-Type") || "";
    if (!type.includes("text/html")) return res;

    const { lang } = pickLanguage(request);
    const out = new HTMLRewriter()
      .on("html", { element(el) { el.setAttribute("lang", lang); } })
      .transform(res);
    const headers = new Headers(out.headers);
    headers.set("Cache-Control", "private, no-cache");
    headers.append("Vary", "Cookie");
    return new Response(out.body, { status: out.status, headers });
  },
};
