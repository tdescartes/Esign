// db.js — SQLite schema + connection.
// Zero-config: creates ./inkwell.db on first run. Swap for Postgres later
// (the schema maps 1:1 — just change the driver and the id defaults).

import Database from "better-sqlite3";

export const db = new Database(process.env.DB_PATH || "inkwell.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  pages        TEXT NOT NULL,              -- JSON array of page content (HTML now, PDF ref later)
  status       TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | completed
  sealed_hash  TEXT,                       -- SHA-256 of the sealed document
  created_at   TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS recipients (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT,
  color         TEXT NOT NULL,
  signing_order INTEGER NOT NULL DEFAULT 0, -- 0 = parallel; >0 = sequential position
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | sent | viewed | signed
  token         TEXT UNIQUE,               -- the private signing-portal token
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fields (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,              -- signature | initials | name | date | text | check
  page         INTEGER NOT NULL,
  x_pct        REAL NOT NULL,              -- normalized 0-100 so it survives any zoom/screen
  y_pct        REAL NOT NULL,
  w            REAL NOT NULL,
  h            REAL NOT NULL,
  required     INTEGER NOT NULL DEFAULT 1,
  value        TEXT,                       -- the filled value (or data-URI for a drawn signature)
  value_meta   TEXT,                       -- optional JSON (e.g. { kind: 'drawn' })
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  actor        TEXT,                       -- who (recipient name / "sender" / "system")
  event        TEXT NOT NULL,              -- created | sent | viewed | signed | consent | completed ...
  meta         TEXT,
  ip           TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipients_doc ON recipients(document_id);
CREATE INDEX IF NOT EXISTS idx_fields_doc     ON fields(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_doc      ON audit_events(document_id);
`);
