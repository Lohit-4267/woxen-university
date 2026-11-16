'use strict';
/**
 * SQLite database (Node's built-in node:sqlite — no native build step).
 * Opens the DB, runs migrations, and seeds content from seed.json on first run.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  // v1 — initial schema
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL              -- JSON
  );

  CREATE TABLE categories (
    id    TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    sort  INTEGER NOT NULL DEFAULT 0
  );

  -- Programmes / tracks. Rich nested fields (modules, tools, roles…) live in "data" as JSON;
  -- the columns are the ones we filter and sort on.
  CREATE TABLE tracks (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    cat        TEXT NOT NULL REFERENCES categories(id),
    live       INTEGER NOT NULL DEFAULT 1,     -- 1 = enrolling, 0 = coming soon / waitlist
    flagship   INTEGER NOT NULL DEFAULT 0,
    published  INTEGER NOT NULL DEFAULT 1,     -- 0 = hidden from the public site
    sort       INTEGER NOT NULL DEFAULT 0,
    data       TEXT NOT NULL,                  -- JSON: full track object
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE events (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    track_id   TEXT,                           -- optional link to a track
    starts_at  TEXT NOT NULL,                  -- ISO 8601 with offset
    mode       TEXT NOT NULL DEFAULT '',
    host       TEXT NOT NULL DEFAULT '',
    seats      INTEGER,                        -- NULL = unlimited
    published  INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE faqs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    q         TEXT NOT NULL,
    a         TEXT NOT NULL,
    sort      INTEGER NOT NULL DEFAULT 0,
    published INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE benefits (
    id        TEXT PRIMARY KEY,
    sort      INTEGER NOT NULL DEFAULT 0,
    published INTEGER NOT NULL DEFAULT 1,
    data      TEXT NOT NULL                    -- JSON: full benefit object
  );

  -- Growth Squad ambassadors: their referral code is stamped on every lead they bring in.
  CREATE TABLE ambassadors (
    code       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    phone      TEXT NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Every form on the site lands here: roadmap leads, event seats, waitlists, squad applications.
  CREATE TABLE submissions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT NOT NULL CHECK (type IN ('lead','event','waitlist','ambassador')),
    status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','contacted','qualified','enrolled','not_interested','spam')),
    name         TEXT NOT NULL,
    phone        TEXT NOT NULL,
    email        TEXT NOT NULL,
    stage        TEXT NOT NULL DEFAULT '',
    track        TEXT NOT NULL DEFAULT '',
    track_id     TEXT NOT NULL DEFAULT '',
    track_status TEXT NOT NULL DEFAULT '',
    event        TEXT NOT NULL DEFAULT '',
    event_id     TEXT NOT NULL DEFAULT '',
    ref          TEXT NOT NULL DEFAULT '',
    source       TEXT NOT NULL DEFAULT '',
    utm_source   TEXT NOT NULL DEFAULT '',
    utm_medium   TEXT NOT NULL DEFAULT '',
    utm_campaign TEXT NOT NULL DEFAULT '',
    utm_content  TEXT NOT NULL DEFAULT '',
    page         TEXT NOT NULL DEFAULT '',
    extra        TEXT NOT NULL DEFAULT '{}',   -- JSON: team_name, teammates, squad_role, handle…
    notes        TEXT NOT NULL DEFAULT '',
    consent      INTEGER NOT NULL DEFAULT 1,
    ip_hash      TEXT NOT NULL DEFAULT '',
    user_agent   TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_sub_type_created ON submissions(type, created_at DESC);
  CREATE INDEX idx_sub_status ON submissions(status);
  CREATE INDEX idx_sub_event ON submissions(event_id);
  CREATE INDEX idx_sub_ref ON submissions(ref);
  CREATE INDEX idx_sub_email ON submissions(email);

  CREATE TABLE admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL               -- unix ms
  );
  `
];

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get();
  let v = row ? row.version : 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  for (; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.prepare('UPDATE schema_version SET version = ?').run(v + 1);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

/** Load seed.json into an empty database. */
function seed(db, seedPath = path.join(__dirname, 'seed.json')) {
  const S = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const C = S.config;
  const settings = {
    contact: { phone: C.PHONE, email: C.EMAIL, address: C.ADDRESS, whatsapp: C.WHATSAPP },
    pricing: { price: C.PRICE, list_price: C.LIST_PRICE, reg_fee: C.REG_FEE, scholarship: !!C.SCHOLARSHIP },
    site: { register_url: C.REGISTER_URL, source: C.SOURCE, show_upcoming: !!C.SHOW_UPCOMING },
    cohort: C.COHORT,
    case_comp: S.caseComp
  };
  db.exec('BEGIN');
  try {
    const setS = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(settings)) setS.run(k, JSON.stringify(v));

    const cat = db.prepare('INSERT INTO categories (id, label, sort) VALUES (?, ?, ?)');
    Object.entries(S.cats).forEach(([id, label], i) => cat.run(id, label, i));

    const tr = db.prepare('INSERT INTO tracks (id, name, cat, live, flagship, sort, data) VALUES (?, ?, ?, ?, ?, ?, ?)');
    S.tracks.forEach((t, i) => tr.run(t.id, t.name, t.cat, t.live ? 1 : 0, t.flagship ? 1 : 0, i, JSON.stringify(t)));

    const ev = db.prepare('INSERT INTO events (id, type, title, track_id, starts_at, mode, host, seats) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    S.events.forEach(e => ev.run(e.id, e.type, e.title, e.track || null, e.date, e.mode || '', e.host || '', e.seats ?? null));

    const fq = db.prepare('INSERT INTO faqs (q, a, sort) VALUES (?, ?, ?)');
    S.faq.forEach((f, i) => fq.run(f.q, f.a, i));

    const bn = db.prepare('INSERT INTO benefits (id, sort, data) VALUES (?, ?, ?)');
    S.benefits.forEach((b, i) => bn.run(b.id, i, JSON.stringify(b)));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') { db.exec('PRAGMA journal_mode = WAL'); db.exec('PRAGMA busy_timeout = 5000'); }
  migrate(db);
  const empty = db.prepare('SELECT COUNT(*) AS n FROM tracks').get().n === 0;
  if (empty) seed(db);
  return db;
}

/** Run fn inside a transaction. */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { open, tx, seed, migrate };
