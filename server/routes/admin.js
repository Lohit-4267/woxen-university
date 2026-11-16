'use strict';
const express = require('express');
const content = require('../lib/content');
const { hashPassword, verifyPassword, sha256, randomToken, rateLimit } = require('../lib/security');
const { str } = require('../lib/validate');
const { obj } = require('../db');

const COOKIE = 'aw_sess';
const SESSION_MS = 7 * 24 * 3600 * 1000;
const STATUSES = ['new', 'contacted', 'qualified', 'enrolled', 'not_interested', 'spam'];
const TYPES = ['lead', 'event', 'waitlist', 'ambassador'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isUniqueViolation = e => e && e.code === '23505';

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) {}
  }
  return out;
}

module.exports = function adminRoutes(getDb, cfg) {
  const r = express.Router();
  const bad = (res, error, status = 400) => res.status(status).json({ error });

  // Attach the db to every admin request.
  r.use(ah(async (req, res, next) => { req.db = await getDb(); next(); }));

  /* ------------------------------------------------------------ auth */
  const setCookie = (res, token, maxAge) => res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: cfg.secureCookies, path: '/api/admin', maxAge
  });

  const auth = ah(async (req, res, next) => {
    const token = cookies(req)[COOKIE];
    if (!token) return bad(res, 'Not signed in.', 401);
    const row = await req.db.one(`SELECT a.id, a.email, a.name, s.expires_at FROM sessions s JOIN admins a ON a.id = s.admin_id
                                  WHERE s.token_hash = $1`, [sha256(token)]);
    if (!row || Number(row.expires_at) < Date.now()) return bad(res, 'Session expired. Please sign in again.', 401);
    req.admin = { id: row.id, email: row.email, name: row.name };
    req.sessionHash = sha256(token);
    next();
  });

  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Try again in 15 minutes.' });
  r.post('/login', loginLimit, ah(async (req, res) => {
    const email = str(req.body?.email, 160).toLowerCase(), password = String(req.body?.password || '');
    const a = await req.db.one('SELECT * FROM admins WHERE email = $1', [email]);
    if (!a || !verifyPassword(password, a.password_hash)) return bad(res, 'Wrong email or password.', 401);
    const token = randomToken();
    await req.db.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
    await req.db.query('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), a.id, Date.now() + SESSION_MS]);
    setCookie(res, token, SESSION_MS);
    res.json({ ok: true, admin: { id: a.id, email: a.email, name: a.name } });
  }));

  r.use(auth);

  r.post('/logout', ah(async (req, res) => {
    await req.db.query('DELETE FROM sessions WHERE token_hash = $1', [req.sessionHash]);
    setCookie(res, '', 0);
    res.json({ ok: true });
  }));
  r.get('/me', (req, res) => res.json({ admin: req.admin }));

  r.post('/password', ah(async (req, res) => {
    const { current, next } = req.body || {};
    const a = await req.db.one('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
    if (!verifyPassword(String(current || ''), a.password_hash)) return bad(res, 'Current password is wrong.');
    if (String(next || '').length < 10) return bad(res, 'New password must be at least 10 characters.');
    await req.db.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hashPassword(String(next)), a.id]);
    await req.db.query('DELETE FROM sessions WHERE admin_id = $1 AND token_hash <> $2', [a.id, req.sessionHash]);
    res.json({ ok: true });
  }));

  /* ------------------------------------------------------------ admins */
  r.get('/admins', ah(async (req, res) => res.json(await req.db.query('SELECT id, email, name, created_at FROM admins ORDER BY id'))));
  r.post('/admins', ah(async (req, res) => {
    const email = str(req.body?.email, 160).toLowerCase(), name = str(req.body?.name, 80), pw = String(req.body?.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Valid email required.');
    if (pw.length < 10) return bad(res, 'Password must be at least 10 characters.');
    try {
      const row = await req.db.one('INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id', [email, name, hashPassword(pw)]);
      res.status(201).json({ id: row.id, email, name });
    } catch (e) { if (isUniqueViolation(e)) return bad(res, 'An admin with that email already exists.', 409); throw e; }
  }));
  r.delete('/admins/:id', ah(async (req, res) => {
    if (+req.params.id === req.admin.id) return bad(res, "You can't remove yourself.");
    await req.db.query('DELETE FROM admins WHERE id = $1', [+req.params.id || 0]);
    res.json({ ok: true });
  }));

  /* ------------------------------------------------------------ dashboard stats */
  r.get('/stats', ah(async (req, res) => {
    const q = (sql, p) => req.db.query(sql, p);
    const ns = `status <> 'spam'`;
    const [counts, byType, byStatus, daily, topTracks, topStages, topSources, referrals, events] = await Promise.all([
      req.db.one(`SELECT
          COUNT(*) FILTER (WHERE ${ns})::int AS total,
          COUNT(*) FILTER (WHERE ${ns} AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS today,
          COUNT(*) FILTER (WHERE ${ns} AND created_at >= now() - interval '7 days')::int AS last7,
          COUNT(*) FILTER (WHERE status = 'new')::int AS "newCount",
          COUNT(*) FILTER (WHERE status = 'enrolled')::int AS enrolled
        FROM submissions`),
      q(`SELECT type, COUNT(*)::int AS n FROM submissions WHERE ${ns} GROUP BY type ORDER BY n DESC`),
      q(`SELECT status, COUNT(*)::int AS n FROM submissions GROUP BY status`),
      q(`SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS n FROM submissions
         WHERE ${ns} AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '29 days') AT TIME ZONE 'UTC' GROUP BY day ORDER BY day`),
      q(`SELECT track, COUNT(*)::int AS n FROM submissions WHERE ${ns} AND track <> '' GROUP BY track ORDER BY n DESC LIMIT 8`),
      q(`SELECT stage, COUNT(*)::int AS n FROM submissions WHERE ${ns} AND stage <> '' GROUP BY stage ORDER BY n DESC`),
      q(`SELECT CASE WHEN utm_medium <> '' THEN utm_medium ELSE 'direct' END AS medium, COUNT(*)::int AS n
         FROM submissions WHERE ${ns} GROUP BY medium ORDER BY n DESC LIMIT 8`),
      q(`SELECT s.ref AS code, COALESCE(MAX(a.name), '') AS name, COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE s.status = 'enrolled')::int AS enrolled
         FROM submissions s LEFT JOIN ambassadors a ON a.code = s.ref
         WHERE s.ref <> '' AND s.${ns} GROUP BY s.ref ORDER BY n DESC LIMIT 20`),
      q(`SELECT e.id, e.title, e.starts_at, e.seats,
           (SELECT COUNT(*)::int FROM submissions s WHERE s.type = 'event' AND s.event_id = e.id AND s.${ns}) AS taken
         FROM events e ORDER BY e.starts_at`)
    ]);
    res.json(Object.assign(counts, { byType, byStatus, daily, topTracks, topStages, topSources, referrals, events }));
  }));

  /* ------------------------------------------------------------ submissions (leads) */
  function subFilter(q) {
    const where = [], args = [];
    // "?" placeholders become $n in order.
    const add = (sql, ...vals) => { let i = 0; where.push(sql.replace(/\?/g, () => { args.push(vals[i++]); return '$' + args.length; })); };
    if (TYPES.includes(q.type)) add('type = ?', q.type);
    if (STATUSES.includes(q.status)) add('status = ?', q.status);
    else if (q.status !== 'all') where.push(`status <> 'spam'`);
    if (q.event_id) add('event_id = ?', String(q.event_id));
    if (q.ref) add('ref = ?', String(q.ref).toUpperCase());
    if (q.track) add('track = ?', String(q.track));
    if (q.from && !isNaN(new Date(q.from))) add('created_at >= ?', String(q.from));
    if (q.to && !isNaN(new Date(q.to))) add(`created_at < (?::date + 1)`, String(q.to));
    if (q.q) {
      const like = '%' + String(q.q).replace(/[%_\\]/g, m => '\\' + m) + '%';
      add(`(name ILIKE ? OR email ILIKE ? OR phone ILIKE ? OR notes ILIKE ?)`, like, like, like, like);
    }
    return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
  }
  const shape = s => Object.assign(s, { extra: obj(s.extra) });

  r.get('/submissions', ah(async (req, res) => {
    const { sql, args } = subFilter(req.query);
    const limit = Math.min(200, Math.max(1, +req.query.limit || 50)), page = Math.max(1, +req.query.page || 1);
    const n = args.length;
    const [{ total }, rows] = await Promise.all([
      req.db.one(`SELECT COUNT(*)::int AS total FROM submissions ${sql}`, args),
      req.db.query(`SELECT * FROM submissions ${sql} ORDER BY created_at DESC, id DESC LIMIT $${n + 1} OFFSET $${n + 2}`, [...args, limit, (page - 1) * limit])
    ]);
    res.json({ total, page, limit, rows: rows.map(shape) });
  }));

  r.get('/submissions.csv', ah(async (req, res) => {
    const { sql, args } = subFilter(req.query);
    const rows = await req.db.query(`SELECT * FROM submissions ${sql} ORDER BY created_at DESC`, args);
    const cols = ['id', 'created_at', 'type', 'status', 'name', 'phone', 'email', 'stage', 'track', 'track_status', 'event',
      'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'notes', 'extra'];
    // Quote every cell; neutralise spreadsheet formula injection (=, +, -, @ prefixes).
    const cell = v => {
      if (v instanceof Date) v = v.toISOString(); else if (v && typeof v === 'object') v = JSON.stringify(v);
      let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
    res.set('Content-Disposition', `attachment; filename="arzon-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.type('text/csv').send(csv);
  }));

  r.get('/submissions/:id', ah(async (req, res) => {
    const s = await req.db.one('SELECT * FROM submissions WHERE id = $1', [+req.params.id || 0]);
    if (!s) return bad(res, 'Not found.', 404);
    const history = await req.db.query('SELECT id, type, track, event, status, created_at FROM submissions WHERE (email = $1 OR phone = $2) AND id <> $3 ORDER BY created_at DESC',
      [s.email, s.phone, s.id]);
    res.json(Object.assign(shape(s), { history }));
  }));

  r.patch('/submissions/:id', ah(async (req, res) => {
    const { status, notes } = req.body || {};
    if (status != null && !STATUSES.includes(status)) return bad(res, 'Invalid status.');
    const row = await req.db.one(`UPDATE submissions SET status = COALESCE($1, status), notes = COALESCE($2, notes), updated_at = now()
                                  WHERE id = $3 RETURNING *`, [status ?? null, notes != null ? str(notes, 4000) : null, +req.params.id || 0]);
    if (!row) return bad(res, 'Not found.', 404);
    content.invalidate();
    res.json(shape(row));
  }));

  r.post('/submissions/bulk', ah(async (req, res) => {
    const ids = (req.body?.ids || []).map(Number).filter(Number.isInteger).slice(0, 500), status = req.body?.status;
    if (!STATUSES.includes(status)) return bad(res, 'Invalid status.');
    const rows = await req.db.query('UPDATE submissions SET status = $1, updated_at = now() WHERE id = ANY($2::int[]) RETURNING id', [status, ids]);
    content.invalidate();
    res.json({ ok: true, updated: rows.length });
  }));

  r.delete('/submissions/:id', ah(async (req, res) => {
    await req.db.query('DELETE FROM submissions WHERE id = $1', [+req.params.id || 0]);
    content.invalidate();
    res.json({ ok: true });
  }));

  /* ------------------------------------------------------------ content: settings */
  const SETTING_KEYS = ['contact', 'pricing', 'site', 'cohort', 'case_comp'];
  r.get('/settings', ah(async (req, res) => res.json(await content.getSettings(req.db))));
  r.put('/settings/:key', ah(async (req, res) => {
    if (!SETTING_KEYS.includes(req.params.key)) return bad(res, 'Unknown setting.');
    const v = req.body;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(res, 'Setting must be an object.');
    if (req.params.key === 'pricing') for (const k of ['price', 'list_price', 'reg_fee']) if (v[k] != null && !(Number(v[k]) >= 0)) return bad(res, `${k} must be a number.`);
    await req.db.query('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [req.params.key, JSON.stringify(v)]);
    content.invalidate();
    res.json(v);
  }));

  /* ------------------------------------------------------------ content: categories */
  r.get('/categories', ah(async (req, res) => res.json(await req.db.query('SELECT * FROM categories ORDER BY sort, id'))));
  r.put('/categories/:id', ah(async (req, res) => {
    const id = req.params.id; if (!SLUG.test(id)) return bad(res, 'Invalid id.');
    const label = str(req.body?.label, 80); if (!label) return bad(res, 'Label required.');
    await req.db.query('INSERT INTO categories (id, label, sort) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET label = excluded.label, sort = excluded.sort',
      [id, label, +req.body?.sort || 0]);
    content.invalidate(); res.json({ id, label });
  }));

  /* ------------------------------------------------------------ content: tracks */
  const trackRow = t => Object.assign(obj(t.data), { id: t.id, name: t.name, cat: t.cat, live: !!t.live, flagship: !!t.flagship, published: !!t.published, sort: t.sort, updated_at: t.updated_at });
  r.get('/tracks', ah(async (req, res) => res.json((await req.db.query('SELECT * FROM tracks ORDER BY sort, name')).map(trackRow))));
  r.put('/tracks/:id', ah(async (req, res) => {
    const id = req.params.id, t = req.body || {};
    if (!SLUG.test(id)) return bad(res, 'Id must be lowercase letters, numbers and dashes.');
    const name = str(t.name, 160); if (!name) return bad(res, 'Name required.');
    if (!await req.db.one('SELECT 1 AS x FROM categories WHERE id = $1', [String(t.cat || '')])) return bad(res, 'Unknown category.');
    for (const k of ['fit', 'roles', 'tools', 'certs', 'modules']) if (t[k] != null && !Array.isArray(t[k])) return bad(res, `${k} must be a list.`);
    if (Array.isArray(t.modules) && t.modules.some(m => !m || typeof m.t !== 'string' || !Array.isArray(m.topics))) return bad(res, 'Each module needs a title "t" and a "topics" list.');
    const data = Object.assign({}, t); for (const k of ['published', 'sort', 'updated_at']) delete data[k];
    data.id = id; data.name = name; data.live = !!t.live; data.flagship = !!t.flagship;
    const sort = t.sort != null && t.sort !== '' ? +t.sort : (await req.db.one('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM tracks')).s;
    const row = await req.db.one(`INSERT INTO tracks (id, name, cat, live, flagship, published, sort, data, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())
                ON CONFLICT (id) DO UPDATE SET name = excluded.name, cat = excluded.cat, live = excluded.live, flagship = excluded.flagship,
                published = excluded.published, sort = excluded.sort, data = excluded.data, updated_at = excluded.updated_at RETURNING *`,
      [id, name, t.cat, !!t.live, !!t.flagship, t.published !== false, sort, JSON.stringify(data)]);
    content.invalidate();
    res.json(trackRow(row));
  }));
  r.delete('/tracks/:id', ah(async (req, res) => { await req.db.query('DELETE FROM tracks WHERE id = $1', [req.params.id]); content.invalidate(); res.json({ ok: true }); }));

  /* ------------------------------------------------------------ content: events */
  r.get('/events', ah(async (req, res) => res.json(await req.db.query(`SELECT e.*,
      (SELECT COUNT(*)::int FROM submissions s WHERE s.type = 'event' AND s.event_id = e.id AND s.status <> 'spam') AS taken
    FROM events e ORDER BY starts_at`))));
  r.put('/events/:id', ah(async (req, res) => {
    const id = req.params.id, e = req.body || {};
    if (!SLUG.test(id)) return bad(res, 'Id must be lowercase letters, numbers and dashes.');
    const title = str(e.title, 200), type = str(e.type, 60) || 'Event';
    if (!title) return bad(res, 'Title required.');
    if (!e.starts_at || isNaN(new Date(e.starts_at))) return bad(res, 'Valid start date/time required.');
    const seats = e.seats === '' || e.seats == null ? null : parseInt(e.seats, 10);
    if (seats !== null && !(seats >= 0)) return bad(res, 'Seats must be a number.');
    const row = await req.db.one(`INSERT INTO events (id, type, title, track_id, starts_at, mode, host, seats, published, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
                ON CONFLICT (id) DO UPDATE SET type = excluded.type, title = excluded.title, track_id = excluded.track_id, starts_at = excluded.starts_at,
                mode = excluded.mode, host = excluded.host, seats = excluded.seats, published = excluded.published, updated_at = excluded.updated_at RETURNING *`,
      [id, type, title, str(e.track_id, 60) || null, new Date(e.starts_at).toISOString(), str(e.mode, 120), str(e.host, 120), seats, e.published !== false]);
    content.invalidate();
    res.json(row);
  }));
  r.delete('/events/:id', ah(async (req, res) => { await req.db.query('DELETE FROM events WHERE id = $1', [req.params.id]); content.invalidate(); res.json({ ok: true }); }));

  /* ------------------------------------------------------------ content: FAQ */
  r.get('/faqs', ah(async (req, res) => res.json(await req.db.query('SELECT * FROM faqs ORDER BY sort, id'))));
  const faqIn = b => ({ q: str(b?.q, 300), a: str(b?.a, 3000), sort: +b?.sort || 0, published: b?.published !== false });
  r.post('/faqs', ah(async (req, res) => {
    const f = faqIn(req.body); if (!f.q || !f.a) return bad(res, 'Question and answer required.');
    const row = await req.db.one('INSERT INTO faqs (q, a, sort, published) VALUES ($1,$2,$3,$4) RETURNING *', [f.q, f.a, f.sort, f.published]);
    content.invalidate(); res.status(201).json(row);
  }));
  r.put('/faqs/:id', ah(async (req, res) => {
    const f = faqIn(req.body); if (!f.q || !f.a) return bad(res, 'Question and answer required.');
    const row = await req.db.one('UPDATE faqs SET q = $1, a = $2, sort = $3, published = $4 WHERE id = $5 RETURNING *', [f.q, f.a, f.sort, f.published, +req.params.id || 0]);
    if (!row) return bad(res, 'Not found.', 404);
    content.invalidate(); res.json(row);
  }));
  r.delete('/faqs/:id', ah(async (req, res) => { await req.db.query('DELETE FROM faqs WHERE id = $1', [+req.params.id || 0]); content.invalidate(); res.json({ ok: true }); }));

  /* ------------------------------------------------------------ content: benefits */
  r.get('/benefits', ah(async (req, res) => res.json((await req.db.query('SELECT * FROM benefits ORDER BY sort, id'))
    .map(b => Object.assign(obj(b.data), { id: b.id, sort: b.sort, published: !!b.published })))));
  r.put('/benefits/:id', ah(async (req, res) => {
    const id = req.params.id, b = req.body || {};
    if (!SLUG.test(id)) return bad(res, 'Invalid id.');
    if (!str(b.title, 160)) return bad(res, 'Title required.');
    const data = Object.assign({}, b); delete data.sort; delete data.published; data.id = id;
    await req.db.query(`INSERT INTO benefits (id, sort, published, data) VALUES ($1,$2,$3,$4::jsonb)
                ON CONFLICT (id) DO UPDATE SET sort = excluded.sort, published = excluded.published, data = excluded.data`,
      [id, +b.sort || 0, b.published !== false, JSON.stringify(data)]);
    content.invalidate(); res.json(data);
  }));
  r.delete('/benefits/:id', ah(async (req, res) => { await req.db.query('DELETE FROM benefits WHERE id = $1', [req.params.id]); content.invalidate(); res.json({ ok: true }); }));

  /* ------------------------------------------------------------ ambassadors (Growth Squad) */
  r.get('/ambassadors', ah(async (req, res) => res.json(await req.db.query(`SELECT a.*,
      (SELECT COUNT(*)::int FROM submissions s WHERE s.ref = a.code AND s.status <> 'spam') AS leads,
      (SELECT COUNT(*)::int FROM submissions s WHERE s.ref = a.code AND s.status = 'enrolled') AS enrolled
    FROM ambassadors a ORDER BY leads DESC, a.created_at`))));
  r.put('/ambassadors/:code', ah(async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(code)) return bad(res, 'Code must be 3–12 letters, numbers or dashes (e.g. CC-AR01).');
    const a = req.body || {}; const name = str(a.name, 120); if (!name) return bad(res, 'Name required.');
    const row = await req.db.one(`INSERT INTO ambassadors (code, name, email, phone, active) VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT (code) DO UPDATE SET name = excluded.name, email = excluded.email, phone = excluded.phone, active = excluded.active RETURNING *`,
      [code, name, str(a.email, 160), str(a.phone, 30), a.active !== false]);
    res.json(row);
  }));
  r.delete('/ambassadors/:code', ah(async (req, res) => { await req.db.query('DELETE FROM ambassadors WHERE code = $1', [String(req.params.code).toUpperCase()]); res.json({ ok: true }); }));

  return r;
};
