'use strict';
/**
 * Postgres database layer.
 *  - Production: DATABASE_URL (e.g. Supabase connection pooler) via node-postgres.
 *  - Local dev / tests without DATABASE_URL: PGlite (Postgres compiled to WASM, in-process),
 *    persisted to PGLITE_DIR or in-memory for tests.
 *
 * All tables live in the "arzon" schema so they never collide with anything in "public"
 * and are not exposed through Supabase's auto-generated Data API.
 *
 * Interface:  db.query(sql, params) -> rows,  db.one(sql, params) -> row | undefined,
 *             db.tx(async t => { await t.query(...) })
 */
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = 'arzon';

const MIGRATIONS = [
  // v1 — initial schema
  `
  CREATE TABLE settings (
    key   text PRIMARY KEY,
    value jsonb NOT NULL
  );

  CREATE TABLE categories (
    id    text PRIMARY KEY,
    label text NOT NULL,
    sort  integer NOT NULL DEFAULT 0
  );

  -- Programmes. Rich nested fields (modules, tools, roles…) live in "data"; columns are what we filter/sort on.
  CREATE TABLE tracks (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    cat        text NOT NULL REFERENCES categories(id),
    live       boolean NOT NULL DEFAULT true,   -- false = coming soon / waitlist
    flagship   boolean NOT NULL DEFAULT false,
    published  boolean NOT NULL DEFAULT true,
    sort       integer NOT NULL DEFAULT 0,
    data       jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE events (
    id         text PRIMARY KEY,
    type       text NOT NULL,
    title      text NOT NULL,
    track_id   text,
    starts_at  timestamptz NOT NULL,
    mode       text NOT NULL DEFAULT '',
    host       text NOT NULL DEFAULT '',
    seats      integer,                          -- NULL = unlimited
    published  boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE faqs (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    q         text NOT NULL,
    a         text NOT NULL,
    sort      integer NOT NULL DEFAULT 0,
    published boolean NOT NULL DEFAULT true
  );

  CREATE TABLE benefits (
    id        text PRIMARY KEY,
    sort      integer NOT NULL DEFAULT 0,
    published boolean NOT NULL DEFAULT true,
    data      jsonb NOT NULL
  );

  CREATE TABLE ambassadors (
    code       text PRIMARY KEY,
    name       text NOT NULL,
    email      text NOT NULL DEFAULT '',
    phone      text NOT NULL DEFAULT '',
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  -- Every form on the site: roadmap leads, event seats, waitlists, squad applications.
  CREATE TABLE submissions (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type         text NOT NULL CHECK (type IN ('lead','event','waitlist','ambassador')),
    status       text NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','contacted','qualified','enrolled','not_interested','spam')),
    name         text NOT NULL,
    phone        text NOT NULL,
    email        text NOT NULL,
    stage        text NOT NULL DEFAULT '',
    track        text NOT NULL DEFAULT '',
    track_id     text NOT NULL DEFAULT '',
    track_status text NOT NULL DEFAULT '',
    event        text NOT NULL DEFAULT '',
    event_id     text NOT NULL DEFAULT '',
    ref          text NOT NULL DEFAULT '',
    source       text NOT NULL DEFAULT '',
    utm_source   text NOT NULL DEFAULT '',
    utm_medium   text NOT NULL DEFAULT '',
    utm_campaign text NOT NULL DEFAULT '',
    utm_content  text NOT NULL DEFAULT '',
    page         text NOT NULL DEFAULT '',
    extra        jsonb NOT NULL DEFAULT '{}',
    notes        text NOT NULL DEFAULT '',
    consent      boolean NOT NULL DEFAULT true,
    ip_hash      text NOT NULL DEFAULT '',
    user_agent   text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_sub_type_created ON submissions(type, created_at DESC);
  CREATE INDEX idx_sub_status ON submissions(status);
  CREATE INDEX idx_sub_event ON submissions(event_id);
  CREATE INDEX idx_sub_ref ON submissions(ref);
  CREATE INDEX idx_sub_email ON submissions(email);

  CREATE TABLE admins (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         text NOT NULL UNIQUE,            -- stored lower-case
    name          text NOT NULL DEFAULT '',
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    admin_id   integer NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at bigint NOT NULL                     -- unix ms
  );
  CREATE INDEX idx_sessions_admin ON sessions(admin_id);
  `,
  // v2: counsellor logins (registrations only), student reviews, ratings + trust settings, Razorpay link.
  // Data here comes from the 2026 Arzon student brochure (reviews quoted as published there).
  `
  ALTER TABLE admins ADD COLUMN role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'counsellor'));

  CREATE TABLE reviews (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source     text NOT NULL DEFAULT 'google' CHECK (source IN ('google', 'justdial', 'ambitionbox', 'other')),
    author     text NOT NULL,
    rating     integer NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    text       text NOT NULL,
    featured   boolean NOT NULL DEFAULT true,          -- full card (true) or short quote chip (false)
    sort       integer NOT NULL DEFAULT 0,
    published  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  -- Reviews that mention healthcare / pharma are kept but unpublished: this site is for MBA & BBA students.
  INSERT INTO reviews (source, author, rating, text, featured, sort, published) VALUES
    ('google', 'Pradeep Kumar Korra', 5, $r$One of the greatest sites if you're serious about pursuing a career in healthcare and AI. The mentors are genuinely knowledgeable in their field. Real talents and a clear professional path. Every minute is worthwhile.$r$, true, 1, false),
    ('google', 'Vignesh Kolli', 5, $r$Great to learn here. Compared to other institutions, classes run on time with recorded sessions, and this internship played a major role in my interview.$r$, true, 2, true),
    ('google', 'Evangeline', 5, $r$An informative and interactive session. I learned how AI is used in pharma and medical procedures.$r$, true, 3, false),
    ('google', 'Vishal Shee', 5, $r$It was a great session. After it I have a clear view of the role of AI in Pharma.$r$, true, 4, false),
    ('google', 'Niloli Chophy', 5, $r$The organisation is doing a great job. Helpful for enhancing our career.$r$, true, 5, true),
    ('google', 'Sudharani Alliboyina', 5, $r$Excellent guidance$r$, false, 6, true),
    ('google', 'Jeethendar Seervi', 5, $r$Helpful in building the career$r$, false, 7, true),
    ('google', 'Abu Hamza', 5, $r$It is very beneficial$r$, false, 8, true);

  INSERT INTO settings (key, value) VALUES
    ('ratings', $j$ {"google_rating": 4.5, "google_count": "447 reviews", "google_url": "",
                   "justdial_rating": 4.5, "justdial_count": "445+ reviews", "justdial_url": "",
                   "ambitionbox_rating": 4.8, "ambitionbox_count": "31 votes", "ambitionbox_url": ""}$j$::jsonb),
    ('trust', $j$ {"badges": [
        {"t": "TASK", "d": "Programmes officially presented with TASK (Telangana Academy for Skill and Knowledge), Government of Telangana."},
        {"t": "ISO 9001:2015", "d": "Quality management, independently assessed for training and internships."},
        {"t": "MSME · Udyam registered", "d": "Registered with the Ministry of MSME, Government of India."}],
      "partners": ["PI Data Centers", "Webhizzy Solutions", "Sangama Solutions", "GMS Enterprises"]}$j$::jsonb)
  ON CONFLICT (key) DO NOTHING;

  -- Payment / enrolment goes straight to Razorpay (existing installs; fresh installs get it from seed.json).
  UPDATE settings SET value = jsonb_set(value, '{register_url}', '"https://rzp.io/rzp/Jm81XZWn"') WHERE key = 'site';

  INSERT INTO faqs (q, a, sort) VALUES
    ($f$Is a job guaranteed?$f$, $f$No, and be wary of anyone who promises one: hiring decisions are always made by employers. What you get is job-ready skills, proof of work (3 industry projects and a 3-month internship) and placement support, including resume building and interview preparation.$f$, 50),
    ($f$Do I need to know my career already?$f$, $f$No. Take the 30-second career-fit quiz or talk to an academic counsellor. They'll help you pick the track that fits your strengths and your Woxsen specialisation.$f$, 51),
    ($f$What if I get stuck during the programme?$f$, $f$You get 24×7 doubt help from peers and mentors, plus lifetime access to every class recording on the LMS.$f$, 52);
  `
];

/* ------------------------------------------------------------------ drivers */
function wrap(runner) {
  // Parameterless calls may contain several statements (migrations): PGlite needs exec() for that,
  // node-postgres uses the simple-query protocol automatically when there are no params.
  const q = async (sql, params = []) => {
    if (!params.length && typeof runner.exec === 'function') { const r = await runner.exec(sql); return (r[r.length - 1] || {}).rows || []; }
    return (await runner.query(sql, params)).rows;
  };
  return { query: q, one: async (sql, params) => (await q(sql, params))[0] };
}

async function connectPg(url) {
  const { Pool } = require('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: +process.env.PG_POOL_MAX || 3,            // serverless: keep per-instance pools small
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: local || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false }
  });
  pool.on('error', e => console.error('[db] idle client error', e.message));
  // Belt and braces: the app role also has search_path set at role level (works through transaction poolers).
  pool.on('connect', c => c.query(`SET search_path TO ${SCHEMA}, public`).catch(() => {}));
  const db = wrap(pool);
  db.tx = async fn => {
    const c = await pool.connect();
    try {
      await c.query(`BEGIN; SET LOCAL search_path TO ${SCHEMA}, public`);
      const r = await fn(wrap(c));
      await c.query('COMMIT');
      return r;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  };
  db.close = () => pool.end();
  db.kind = 'postgres';
  return db;
}

async function connectPglite(dir) {
  let PGlite;
  try { ({ PGlite } = require('@electric-sql/pglite')); }
  catch (_) { throw new Error('No DATABASE_URL set and @electric-sql/pglite is not installed. Set DATABASE_URL or run `npm install`.'); }
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir || undefined);
  await pg.exec(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}; SET search_path TO ${SCHEMA}, public;`);
  const db = wrap(pg);
  db.tx = fn => pg.transaction(t => fn(wrap(t)));
  db.close = () => pg.close();
  db.kind = 'pglite';
  return db;
}

/* ------------------------------------------------------------------ migrations + seed */
async function migrate(db) {
  const has = await db.one(`SELECT 1 AS x FROM pg_namespace WHERE nspname = $1`, [SCHEMA]);
  if (!has) await db.query(`CREATE SCHEMA ${SCHEMA}`);
  await db.tx(async t => {
    // Serialise concurrent cold starts.
    await t.query(`SELECT pg_advisory_xact_lock(727274)`);
    await t.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_version (version integer NOT NULL)`);
    let row = await t.one(`SELECT version FROM ${SCHEMA}.schema_version`);
    if (!row) { await t.query(`INSERT INTO ${SCHEMA}.schema_version VALUES (0)`); row = { version: 0 }; }
    for (let v = row.version; v < MIGRATIONS.length; v++) {
      await t.query(`SET LOCAL search_path TO ${SCHEMA}`);
      await t.query(MIGRATIONS[v]);
      await t.query(`UPDATE ${SCHEMA}.schema_version SET version = $1`, [v + 1]);
    }
    const n = (await t.one(`SELECT COUNT(*)::int AS n FROM ${SCHEMA}.tracks`)).n;
    if (n === 0) await seed(t);
  });
}

async function seed(t, seedPath = path.join(__dirname, 'seed.json')) {
  const S = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const C = S.config;
  const settings = {
    contact: { phone: C.PHONE, email: C.EMAIL, address: C.ADDRESS, whatsapp: C.WHATSAPP },
    pricing: { price: C.PRICE, list_price: C.LIST_PRICE, reg_fee: C.REG_FEE, scholarship: !!C.SCHOLARSHIP },
    site: { register_url: C.REGISTER_URL, source: C.SOURCE, show_upcoming: !!C.SHOW_UPCOMING },
    cohort: C.COHORT,
    case_comp: S.caseComp
  };
  const s = SCHEMA;
  for (const [k, v] of Object.entries(settings)) await t.query(`INSERT INTO ${s}.settings (key, value) VALUES ($1, $2::jsonb)`, [k, JSON.stringify(v)]);
  let i = 0;
  for (const [id, label] of Object.entries(S.cats)) await t.query(`INSERT INTO ${s}.categories (id, label, sort) VALUES ($1, $2, $3)`, [id, label, i++]);
  i = 0;
  for (const tr of S.tracks) await t.query(`INSERT INTO ${s}.tracks (id, name, cat, live, flagship, sort, data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [tr.id, tr.name, tr.cat, !!tr.live, !!tr.flagship, i++, JSON.stringify(tr)]);
  for (const e of S.events) await t.query(`INSERT INTO ${s}.events (id, type, title, track_id, starts_at, mode, host, seats) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.id, e.type, e.title, e.track || null, e.date, e.mode || '', e.host || '', e.seats ?? null]);
  i = 0;
  for (const f of S.faq) await t.query(`INSERT INTO ${s}.faqs (q, a, sort) VALUES ($1,$2,$3)`, [f.q, f.a, i++]);
  i = 0;
  for (const b of S.benefits) await t.query(`INSERT INTO ${s}.benefits (id, sort, data) VALUES ($1,$2,$3::jsonb)`, [b.id, i++, JSON.stringify(b)]);
}

/** Open the database, run migrations, seed on first run. */
async function open(cfg) {
  const db = cfg.databaseUrl ? await connectPg(cfg.databaseUrl) : await connectPglite(cfg.pgliteDir);
  await migrate(db);
  return db;
}

/** jsonb comes back parsed from both drivers; tolerate strings too. */
const obj = (v, fallback = {}) => { if (v == null) return fallback; if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return fallback; } } return v; };

module.exports = { open, obj, SCHEMA };
