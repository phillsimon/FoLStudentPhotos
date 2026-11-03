import { students, site, findPhoto } from "./data.js";

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

const listStudent = (s) => ({
  slug: s.slug,
  first_name: s.first_name,
  cover: s.photos.find((p) => p.id === s.cover_photo_id),
  photo_count: s.photos.length,
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") {
      return Response.json({ ok: true, country: request.cf?.country ?? null, time: new Date().toISOString() });
    }

    if (path === "/api/locale") {
      return Response.json({ ...pickLanguage(request), country: request.cf?.country ?? null });
    }

    if (path === "/api/site") {
      return Response.json({ ...site, students: students.map(listStudent) });
    }

    let m = path.match(/^\/api\/students\/([a-z0-9-]+)$/);
    if (m) {
      const i = students.findIndex((s) => s.slug === m[1]);
      if (i === -1) return Response.json({ error: "Not found" }, { status: 404 });
      const s = students[i];
      const prev = students[(i - 1 + students.length) % students.length];
      const next = students[(i + 1) % students.length];
      return Response.json({
        ...s,
        prev: { slug: prev.slug, first_name: prev.first_name },
        next: { slug: next.slug, first_name: next.first_name },
      });
    }

    m = path.match(/^\/api\/img\/([a-z0-9-]+)\.svg$/);
    if (m) {
      const found = findPhoto(m[1]);
      if (!found) return new Response("Not found", { status: 404 });
      return new Response(placeholderSvg(found.student, found.photo), {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
      });
    }

    if (path.startsWith("/api/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
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
