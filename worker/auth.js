// Passwords (PBKDF2 via WebCrypto), sessions and login rate limits.

// 100,000 is the most PBKDF2 iterations Cloudflare Workers allow.
const ITERATIONS = 100000;
const SESSION_DAYS = 30;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_LOGIN = 8;
const MAX_FAILS_PER_IP = 30;

const enc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

// Used when the account doesn't exist, so a wrong name takes as long as a wrong password.
const DUMMY_SALT = new Uint8Array(16);

export async function verifyPassword(password, stored) {
  if (!stored) {
    await derive(password, DUMMY_SALT, ITERATIONS);
    return false;
  }
  const [, iterations, salt, expected] = stored.split("$");
  const actual = new Uint8Array(await derive(password, fromB64(salt), Number(iterations)));
  const want = fromB64(expected);
  if (actual.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ want[i];
  return diff === 0;
}

// Easy to read aloud or type on a phone: no 0/o, 1/l/i. About 40 bits, and only usable until first login.
export function makeTempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = (n) => {
    let out = "";
    for (const b of crypto.getRandomValues(new Uint32Array(n))) out += alphabet[b % alphabet.length];
    return out;
  };
  return `${pick(4)}-${pick(4)}`;
}

async function sha256(text) {
  return toB64(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

const readCookie = (request) => (request.headers.get("Cookie") || "").match(/(?:^|;\s*)sid=([^;]+)/)?.[1];

const cookieFlags = (request) =>
  `Path=/; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;

export async function createSession(env, request, userId) {
  const token = toB64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(
      await sha256(token), userId, now + SESSION_DAYS * 86400000, now
    ),
  ]);
  return `sid=${token}; Max-Age=${SESSION_DAYS * 86400}; ${cookieFlags(request)}`;
}

export async function destroySession(env, request) {
  const token = readCookie(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return `sid=; Max-Age=0; ${cookieFlags(request)}`;
}

export async function currentUser(env, request) {
  const token = readCookie(request);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.login, u.display_name, u.role, u.student_slug, u.must_change, u.password_hash
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(await sha256(token), Date.now())
    .first();
}

export async function dropUserSessions(env, userId) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "local";
const limitKeys = (request, login) => [
  { key: `login:${login}`, max: MAX_FAILS_PER_LOGIN },
  { key: `ip:${clientIp(request)}`, max: MAX_FAILS_PER_IP },
];

export async function isRateLimited(env, request, login) {
  const cutoff = Date.now() - WINDOW_MS;
  for (const { key, max } of limitKeys(request, login)) {
    const row = await env.DB.prepare("SELECT count, window_start FROM login_attempts WHERE key = ?").bind(key).first();
    if (row && row.window_start > cutoff && row.count >= max) return true;
  }
  return false;
}

export async function recordFailure(env, request, login) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  await env.DB.batch(
    limitKeys(request, login).map(({ key }) =>
      env.DB.prepare(
        `INSERT INTO login_attempts (key, count, window_start) VALUES (?1, 1, ?2)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN window_start > ?3 THEN count + 1 ELSE 1 END,
           window_start = CASE WHEN window_start > ?3 THEN window_start ELSE ?2 END`
      ).bind(key, now, cutoff)
    )
  );
}

export async function clearFailures(env, login) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(`login:${login}`).run();
}
