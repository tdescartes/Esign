// db.js — Postgres schema + connection.
//
// Production: set DATABASE_URL to a real Postgres instance.
// Local dev/tests: when DATABASE_URL is unset, falls back to an in-memory
// Postgres-compatible engine (pg-mem) so the app still runs with zero setup —
// the same ergonomic the old SQLite default had. This fallback is NOT
// durable and must never be used in production.

import pg from "pg";

const { Pool } = pg;

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
} else {
  const { newDb } = await import("pg-mem");
  const memDb = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memDb.adapters.createPg();
  pool = new adapter.Pool();
  console.warn(
    "[db] DATABASE_URL not set — using the in-memory pg-mem fallback. Data will not persist across restarts."
  );
}

export { pool };

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    revoked_at  TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id                TEXT PRIMARY KEY,
    owner_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    pages             TEXT NOT NULL,              -- JSON array of page content (HTML preview fallback)
    status            TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | completed
    page_count        INTEGER NOT NULL DEFAULT 0,
    source_file_path  TEXT,                        -- uploaded PDF on disk, when provided
    sealed_file_path  TEXT,                        -- flattened, sealed PDF on disk
    sealed_hash       TEXT,                        -- SHA-256 of the sealed document
    created_at        TEXT NOT NULL,
    completed_at      TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS recipients (
    id            TEXT PRIMARY KEY,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    email         TEXT,
    color         TEXT NOT NULL,
    signing_order INTEGER NOT NULL DEFAULT 0, -- 0 = parallel; >0 = sequential position
    status        TEXT NOT NULL DEFAULT 'draft', -- draft | sent | viewed | signed
    token         TEXT UNIQUE,               -- the private signing-portal token
    created_at    TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS fields (
    id           TEXT PRIMARY KEY,
    document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,              -- signature | initials | name | date | text | check
    page         INTEGER NOT NULL,
    x_pct        REAL NOT NULL,              -- normalized 0-100 so it survives any zoom/screen
    y_pct        REAL NOT NULL,
    w            REAL NOT NULL,
    h            REAL NOT NULL,
    required     BOOLEAN NOT NULL DEFAULT TRUE,
    value        TEXT,                       -- the filled value (or data-URI for a drawn signature)
    value_meta   TEXT,                       -- optional JSON (e.g. { kind: 'drawn' })
    created_at   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id           TEXT PRIMARY KEY,
    document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    actor        TEXT,                       -- who (recipient name / "sender" / "system")
    event        TEXT NOT NULL,              -- created | sent | viewed | signed | consent | completed ...
    meta         TEXT,
    ip           TEXT,
    created_at   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS consents (
    id            TEXT PRIMARY KEY,
    document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    recipient_id  TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    text_shown    TEXT NOT NULL,             -- the disclosure text shown at the moment of consent
    ip            TEXT,
    user_agent    TEXT,
    created_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_recipients_doc ON recipients(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fields_doc ON fields(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_events(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
];

export async function initSchema() {
  for (const statement of statements) {
    await pool.query(statement);
  }
}

await initSchema();
