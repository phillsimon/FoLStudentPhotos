// Email notices to Phillip when a student does something: changes their password, picks photos, or submits
// an artist statement. Sent through Resend (free plan). Nothing is sent until the RESEND_API_KEY secret is set,
// so the site works the same without it. A failed send is logged and never breaks the student's action.
//
// Settings (Worker variables): RESEND_API_KEY (secret, required), NOTIFY_TO (defaults to ADMIN_EMAIL),
// NOTIFY_FROM (defaults to Resend's test sender, which only delivers to the Resend account's own address).

const DEFAULT_FROM = "Fountain of Life Gallery <onboarding@resend.dev>";

export async function notify(env, request, subject, lines, path = "/admin") {
  if (!env.RESEND_API_KEY) return;
  const to = env.NOTIFY_TO || env.ADMIN_EMAIL;
  if (!to) return;
  const link = new URL(path, request.url).toString();
  const text = [...lines.filter(Boolean), "", link].join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.NOTIFY_FROM || DEFAULT_FROM, to: [to], subject: `Gallery: ${subject}`, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error("notify failed", r.status, await r.text());
  } catch (e) {
    console.error("notify failed", e);
  }
}
