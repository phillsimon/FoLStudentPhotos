// Worker: API routes, plus language selection on HTML pages. Everything else is served from /public.
const SPANISH_COUNTRIES = new Set([
  "DO", "ES", "MX", "GT", "HN", "SV", "NI", "CR", "PA", "CU", "PR",
  "CO", "VE", "EC", "PE", "BO", "CL", "AR", "UY", "PY", "GQ",
]);

// Priority: saved choice (cookie) -> country -> English.
function pickLang(request) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)lang=(en|es)\b/);
  if (m) return m[1];
  const country = request.cf?.country;
  return country && SPANISH_COUNTRIES.has(country) ? "es" : "en";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        country: request.cf?.country ?? null,
        lang: pickLang(request),
        time: new Date().toISOString(),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("Content-Type") || "";
    if (!type.includes("text/html")) return res;

    const lang = pickLang(request);
    const out = new HTMLRewriter()
      .on("html", { element(el) { el.setAttribute("lang", lang); } })
      .transform(res);
    const headers = new Headers(out.headers);
    headers.set("Cache-Control", "private, no-cache");
    headers.append("Vary", "Cookie");
    return new Response(out.body, { status: out.status, headers });
  },
};
