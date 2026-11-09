// Database setup. The Worker applies any migration it hasn't run yet on first use,
// so adding a table later only needs a new entry here and a push.
import { students } from "./data.js";

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS students (
        slug TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        statement_es TEXT NOT NULL DEFAULT '',
        statement_en TEXT NOT NULL DEFAULT '',
        draft TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'none',
        review_note TEXT NOT NULL DEFAULT '',
        submitted_at TEXT,
        reviewed_at TEXT,
        updated_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('superadmin', 'student')),
        student_slug TEXT REFERENCES students(slug),
        password_hash TEXT,
        must_change INTEGER NOT NULL DEFAULT 0,
        temp_issued_at TEXT,
        password_changed_at TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start INTEGER NOT NULL
      )`,
      // Titles and captions, keyed by photo id. Sits on top of the placeholder photos until R2 is in.
      `CREATE TABLE IF NOT EXISTS photo_text (
        photo_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        caption TEXT NOT NULL DEFAULT '',
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS site_content (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT
      )`,
    ],
  },
  {
    // Real photos in R2. Phillip uploads; the student picks which to show; Phillip approves.
    // status: private (uploaded, only the student and Phillip see it), requested (student picked it, waiting
    // for review), live (public), declined (Phillip said no; the student can pick it again).
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        student_slug TEXT NOT NULL REFERENCES students(slug),
        filename TEXT NOT NULL,
        original_type TEXT NOT NULL,
        original_bytes INTEGER NOT NULL,
        web_bytes INTEGER NOT NULL,
        thumb_bytes INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        capture_date TEXT,
        sort_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'private' CHECK (status IN ('private', 'requested', 'live', 'declined')),
        requested_at TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS photos_by_student ON photos (student_slug, sort_key)",
      "CREATE INDEX IF NOT EXISTS photos_by_status ON photos (status)",
      // The homepage card photo: the approved one, and the student's pick waiting for review.
      "ALTER TABLE students ADD COLUMN cover_photo_id TEXT",
      "ALTER TABLE students ADD COLUMN cover_requested_id TEXT",
      "ALTER TABLE students ADD COLUMN cover_requested_at TEXT",
    ],
  },
];

async function migrate(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)").run();
  const { results } = await db.prepare("SELECT version FROM schema_migrations").all();
  const done = new Set(results.map((r) => r.version));
  const now = new Date().toISOString();

  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.batch([
      ...m.statements.map((s) => db.prepare(s)),
      db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").bind(m.version, now),
    ]);
  }

  // Every student gets a gallery record and an account. An account can't log in until a temporary password is issued.
  await db.batch(
    students.flatMap((s) => [
      db.prepare("INSERT OR IGNORE INTO students (slug, first_name) VALUES (?, ?)").bind(s.slug, s.first_name),
      db
        .prepare("INSERT OR IGNORE INTO users (login, display_name, role, student_slug, created_at) VALUES (?, ?, 'student', ?, ?)")
        .bind(s.slug, s.first_name, s.slug, now),
    ])
  );
}

let ready = null;

export function ensureDb(env) {
  if (!ready) {
    ready = migrate(env.DB).catch((e) => {
      ready = null; // Let the next request try again.
      throw e;
    });
  }
  return ready;
}
