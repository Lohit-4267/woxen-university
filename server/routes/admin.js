'use strict';
const express = require('express');
const content = require('../lib/content');
const { hashPassword, verifyPassword, sha256, randomToken, rateLimit } = require('../lib/security');
const { str } = require('../lib/validate');
const { tx } = require('../db');

const COOKIE = 'aw_sess';
const SESSION_MS = 7 * 24 * 3600 * 1000;
const STATUSES = ['new', 'contacted', 'qualified', 'enrolled', 'not_interested', 'spam'];
const TYPES = ['lead', 'event', 'waitlist', 'ambassador'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const parse = (s, f) => { try { return JSON.parse(s); } catch (_) { return f; } };

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = function adminRoutes(db, cfg) {
  const r = express.Router();
  const bad = (res, error, status = 400) => res.status(status).json({ error });

  /* ------------------------------------------------------------ auth */
  const setCookie = (res, token, maxAge) => res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: cfg.secureCookies, path: '/api/admin', maxAge
  });

  function auth(req, res, next) {
    const token = cookies(req)[COOKIE];
    if (!token) return bad(res, 'Not signed in.', 401);
    const row = db.prepare(`SELECT a.id, a.email, a.name, s.expires_at FROM sessions s JOIN admins a ON a.id = s.admin_id
                            WHERE s.token_hash = ?`).get(sha256(token));
    if (!row || row.expires_at < Date.now()) return bad(res, 'Session expired. Please sign in again.', 401);
    req.admin = { id: row.id, email: row.email, name: row.name };
    req.sessionHash = sha256(token);
    next();
  }

  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Try again in 15 minutes.' });
  r.post('/login', loginLimit, (req, res) => {
    const email = str(req.body?.email, 160).toLowerCase(), password = String(req.body?.password || '');
    const a = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
    if (!a || !verifyPassword(password, a.password_hash)) return bad(res, 'Wrong email or password.', 401);
    const token = randomToken();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), a.id, Date.now() + SESSION_MS);
    setCookie(res, token, SESSION_MS);
    res.json({ ok: true, admin: { id: a.id, email: a.email, name: a.name } });
  });

  r.use(auth);

  r.post('/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionHash);
    setCookie(res, '', 0);
    res.json({ ok: true });
  });
  r.get('/me', (req, res) => res.json({ admin: req.admin }));

  r.post('/password', (req, res) => {
    const { current, next } = req.body || {};
    const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!verifyPassword(String(current || ''), a.password_hash)) return bad(res, 'Current password is wrong.');
    if (String(next || '').length < 10) return bad(res, 'New password must be at least 10 characters.');
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(String(next)), a.id);
    db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash <> ?').run(a.id, req.sessionHash);
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------ admins */
  r.get('/admins', (req, res) => res.json(db.prepare('SELECT id, email, name, created_at FROM admins ORDER BY id').all()));
  r.post('/admins', (req, res) => {
    const email = str(req.body?.email, 160).toLowerCase(), name = str(req.body?.name, 80), pw = String(req.body?.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'Valid email required.');
    if (pw.length < 10) return bad(res, 'Password must be at least 10 characters.');
    try {
      const info = db.prepare('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)').run(email, name, hashPassword(pw));
      res.status(201).json({ id: Number(info.lastInsertRowid), email, name });
    } catch (e) { bad(res, 'An admin with that email already exists.', 409); }
  });
  r.delete('/admins/:id', (req, res) => {
    if (+req.params.id === req.admin.id) return bad(res, "You can't remove yourself.");
    db.prepare('DELETE FROM admins WHERE id = ?').run(+req.params.id);
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------ dashboard stats */
  r.get('/stats', (req, res) => {
    const one = (sql, ...a) => db.prepare(sql).get(...a);
    const all = (sql, ...a) => db.prepare(sql).all(...a);
    const notSpam = `status <> 'spam'`;
    res.json({
      total: one(`SELECT COUNT(*) AS n FROM submissions WHERE ${notSpam}`).n,
      today: one(`SELECT COUNT(*) AS n FROM submissions WHERE ${notSpam} AND created_at >= strftime('%Y-%m-%dT00:00:00Z','now')`).n,
      last7: one(`SELECT COUNT(*) AS n FROM submissions WHERE ${notSpam} AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')`).n,
      newCount: one(`SELECT COUNT(*) AS n FROM submissions WHERE status = 'new'`).n,
      enrolled: one(`SELECT COUNT(*) AS n FROM submissions WHERE status = 'enrolled'`).n,
      byType: all(`SELECT type, COUNT(*) AS n FROM submissions WHERE ${notSpam} GROUP BY type`),
      byStatus: all(`SELECT status, COUNT(*) AS n FROM submissions GROUP BY status`),
      daily: all(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM submissions
                  WHERE ${notSpam} AND created_at >= strftime('%Y-%m-%dT00:00:00Z','now','-29 days') GROUP BY day ORDER BY day`),
      topTracks: all(`SELECT track, COUNT(*) AS n FROM submissions WHERE ${notSpam} AND track <> '' GROUP BY track ORDER BY n DESC LIMIT 8`),
      topStages: all(`SELECT stage, COUNT(*) AS n FROM submissions WHERE ${notSpam} AND stage <> '' GROUP BY stage ORDER BY n DESC`),
      topSources: all(`SELECT CASE WHEN utm_medium <> '' THEN utm_medium ELSE 'direct' END AS medium, COUNT(*) AS n
                       FROM submissions WHERE ${notSpam} GROUP BY medium ORDER BY n DESC LIMIT 8`),
      referrals: all(`SELECT s.ref AS code, COALESCE(a.name, '') AS name, COUNT(*) AS n,
                        SUM(CASE WHEN s.status = 'enrolled' THEN 1 ELSE 0 END) AS enrolled
                      FROM submissions s LEFT JOIN ambassadors a ON a.code = s.ref
                      WHERE s.ref <> '' AND s.${notSpam} GROUP BY s.ref ORDER BY n DESC LIMIT 20`),
      events: all(`SELECT e.id, e.title, e.starts_at, e.seats,
                     (SELECT COUNT(*) FROM submissions s WHERE s.type = 'event' AND s.event_id = e.id AND s.${notSpam}) AS taken
                   FROM events e ORDER BY e.starts_at`)
    });
  });

  /* ------------------------------------------------------------ submissions (leads) */
  function subFilter(q) {
    const where = [], args = [];
    if (TYPES.includes(q.type)) { where.push('type = ?'); args.push(q.type); }
    if (STATUSES.includes(q.status)) { where.push('status = ?'); args.push(q.status); }
    else if (q.status !== 'all') { where.push(`status <> 'spam'`); }
    if (q.event_id) { where.push('event_id = ?'); args.push(String(q.event_id)); }
    if (q.ref) { where.push('ref = ?'); args.push(String(q.ref).toUpperCase()); }
    if (q.track) { where.push('track = ?'); args.push(String(q.track)); }
    if (q.from) { where.push('created_at >= ?'); args.push(String(q.from)); }
    if (q.to) { where.push('created_at < ?'); args.push(String(q.to) + 'T23:59:59.999Z'); }
    if (q.q) {
      const like = '%' + String(q.q).replace(/[%_\\]/g, m => '\\' + m) + '%';
      where.push(`(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')`);
      args.push(like, like, like, like);
    }
    return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
  }
  const shape = s => Object.assign(s, { extra: parse(s.extra, {}) });

  r.get('/submissions', (req, res) => {
    const { sql, args } = subFilter(req.query);
    const limit = Math.min(200, Math.max(1, +req.query.limit || 50)), page = Math.max(1, +req.query.page || 1);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM submissions ${sql}`).get(...args).n;
    const rows = db.prepare(`SELECT * FROM submissions ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...args, limit, (page - 1) * limit).map(shape);
    res.json({ total, page, limit, rows });
  });

  r.get('/submissions.csv', (req, res) => {
    const { sql, args } = subFilter(req.query);
    const rows = db.prepare(`SELECT * FROM submissions ${sql} ORDER BY created_at DESC`).all(...args);
    const cols = ['id', 'created_at', 'type', 'status', 'name', 'phone', 'email', 'stage', 'track', 'track_status', 'event',
      'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'notes', 'extra'];
    // Quote every cell; neutralise spreadsheet formula injection (=, +, -, @ prefixes).
    const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
    res.set('Content-Disposition', `attachment; filename="arzon-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.type('text/csv').send(csv);
  });

  r.get('/submissions/:id', (req, res) => {
    const s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(+req.params.id);
    if (!s) return bad(res, 'Not found.', 404);
    const history = db.prepare('SELECT id, type, track, event, status, created_at FROM submissions WHERE (email = ? OR phone = ?) AND id <> ? ORDER BY created_at DESC')
      .all(s.email, s.phone, s.id);
    res.json(Object.assign(shape(s), { history }));
  });

  r.patch('/submissions/:id', (req, res) => {
    const s = db.prepare('SELECT id FROM submissions WHERE id = ?').get(+req.params.id);
    if (!s) return bad(res, 'Not found.', 404);
    const { status, notes } = req.body || {};
    if (status != null && !STATUSES.includes(status)) return bad(res, 'Invalid status.');
    db.prepare(`UPDATE submissions SET status = COALESCE(?, status), notes = COALESCE(?, notes),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(status ?? null, notes != null ? str(notes, 4000) : null, s.id);
    content.invalidate();
    res.json(shape(db.prepare('SELECT * FROM submissions WHERE id = ?').get(s.id)));
  });

  r.post('/submissions/bulk', (req, res) => {
    const ids = (req.body?.ids || []).map(Number).filter(Boolean).slice(0, 500), status = req.body?.status;
    if (!STATUSES.includes(status)) return bad(res, 'Invalid status.');
    tx(db, () => { const st = db.prepare(`UPDATE submissions SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`); ids.forEach(id => st.run(status, id)); });
    content.invalidate();
    res.json({ ok: true, updated: ids.length });
  });

  r.delete('/submissions/:id', (req, res) => {
    db.prepare('DELETE FROM submissions WHERE id = ?').run(+req.params.id);
    content.invalidate();
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------ content: settings */
  const SETTING_KEYS = ['contact', 'pricing', 'site', 'cohort', 'case_comp'];
  r.get('/settings', (req, res) => res.json(content.getSettings(db)));
  r.put('/settings/:key', (req, res) => {
    if (!SETTING_KEYS.includes(req.params.key)) return bad(res, 'Unknown setting.');
    const v = req.body;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(res, 'Setting must be an object.');
    if (req.params.key === 'pricing') for (const k of ['price', 'list_price', 'reg_fee']) if (v[k] != null && !(Number(v[k]) >= 0)) return bad(res, `${k} must be a number.`);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(req.params.key, JSON.stringify(v));
    content.invalidate();
    res.json(v);
  });

  /* ------------------------------------------------------------ content: categories */
  r.get('/categories', (req, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY sort, id').all()));
  r.put('/categories/:id', (req, res) => {
    const id = req.params.id; if (!SLUG.test(id)) return bad(res, 'Invalid id.');
    const label = str(req.body?.label, 80); if (!label) return bad(res, 'Label required.');
    db.prepare('INSERT INTO categories (id, label, sort) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET label = excluded.label, sort = excluded.sort')
      .run(id, label, +req.body?.sort || 0);
    content.invalidate(); res.json({ id, label });
  });

  /* ------------------------------------------------------------ content: tracks */
  const trackRow = t => Object.assign(parse(t.data, {}), { id: t.id, name: t.name, cat: t.cat, live: !!t.live, flagship: !!t.flagship, published: !!t.published, sort: t.sort, updated_at: t.updated_at });
  r.get('/tracks', (req, res) => res.json(db.prepare('SELECT * FROM tracks ORDER BY sort, name').all().map(trackRow)));
  r.put('/tracks/:id', (req, res) => {
    const id = req.params.id, t = req.body || {};
    if (!SLUG.test(id)) return bad(res, 'Id must be lowercase letters, numbers and dashes.');
    const name = str(t.name, 160); if (!name) return bad(res, 'Name required.');
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(t.cat)) return bad(res, 'Unknown category.');
    for (const k of ['fit', 'roles', 'tools', 'certs', 'modules']) if (t[k] != null && !Array.isArray(t[k])) return bad(res, `${k} must be a list.`);
    if (Array.isArray(t.modules) && t.modules.some(m => !m || typeof m.t !== 'string' || !Array.isArray(m.topics))) return bad(res, 'Each module needs a title "t" and a "topics" list.');
    const data = Object.assign({}, t); for (const k of ['published', 'sort', 'updated_at']) delete data[k];
    data.id = id; data.name = name; data.live = !!t.live; data.flagship = !!t.flagship;
    const sort = t.sort != null ? +t.sort : (db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM tracks').get().s);
    db.prepare(`INSERT INTO tracks (id, name, cat, live, flagship, published, sort, data, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, cat = excluded.cat, live = excluded.live, flagship = excluded.flagship,
                published = excluded.published, sort = excluded.sort, data = excluded.data, updated_at = excluded.updated_at`)
      .run(id, name, t.cat, t.live ? 1 : 0, t.flagship ? 1 : 0, t.published === false ? 0 : 1, sort, JSON.stringify(data));
    content.invalidate();
    res.json(trackRow(db.prepare('SELECT * FROM tracks WHERE id = ?').get(id)));
  });
  r.delete('/tracks/:id', (req, res) => { db.prepare('DELETE FROM tracks WHERE id = ?').run(req.params.id); content.invalidate(); res.json({ ok: true }); });

  /* ------------------------------------------------------------ content: events */
  r.get('/events', (req, res) => res.json(db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM submissions s WHERE s.type = 'event' AND s.event_id = e.id AND s.status <> 'spam') AS taken
                                                      FROM events e ORDER BY starts_at`).all().map(e => Object.assign(e, { published: !!e.published }))));
  r.put('/events/:id', (req, res) => {
    const id = req.params.id, e = req.body || {};
    if (!SLUG.test(id)) return bad(res, 'Id must be lowercase letters, numbers and dashes.');
    const title = str(e.title, 200), type = str(e.type, 60) || 'Event';
    if (!title) return bad(res, 'Title required.');
    if (!e.starts_at || isNaN(new Date(e.starts_at))) return bad(res, 'Valid start date/time required.');
    const seats = e.seats === '' || e.seats == null ? null : Math.max(0, parseInt(e.seats, 10));
    if (seats !== null && isNaN(seats)) return bad(res, 'Seats must be a number.');
    db.prepare(`INSERT INTO events (id, type, title, track_id, starts_at, mode, host, seats, published, updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
                ON CONFLICT(id) DO UPDATE SET type = excluded.type, title = excluded.title, track_id = excluded.track_id, starts_at = excluded.starts_at,
                mode = excluded.mode, host = excluded.host, seats = excluded.seats, published = excluded.published, updated_at = excluded.updated_at`)
      .run(id, type, title, str(e.track_id, 60) || null, String(e.starts_at), str(e.mode, 120), str(e.host, 120), seats, e.published === false ? 0 : 1);
    content.invalidate();
    res.json(db.prepare('SELECT * FROM events WHERE id = ?').get(id));
  });
  r.delete('/events/:id', (req, res) => { db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id); content.invalidate(); res.json({ ok: true }); });

  /* ------------------------------------------------------------ content: FAQ */
  r.get('/faqs', (req, res) => res.json(db.prepare('SELECT * FROM faqs ORDER BY sort, id').all().map(f => Object.assign(f, { published: !!f.published }))));
  const faqIn = b => ({ q: str(b?.q, 300), a: str(b?.a, 3000), sort: +b?.sort || 0, published: b?.published === false ? 0 : 1 });
  r.post('/faqs', (req, res) => {
    const f = faqIn(req.body); if (!f.q || !f.a) return bad(res, 'Question and answer required.');
    const info = db.prepare('INSERT INTO faqs (q, a, sort, published) VALUES (?,?,?,?)').run(f.q, f.a, f.sort, f.published);
    content.invalidate(); res.status(201).json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(Number(info.lastInsertRowid)));
  });
  r.put('/faqs/:id', (req, res) => {
    const f = faqIn(req.body); if (!f.q || !f.a) return bad(res, 'Question and answer required.');
    db.prepare('UPDATE faqs SET q = ?, a = ?, sort = ?, published = ? WHERE id = ?').run(f.q, f.a, f.sort, f.published, +req.params.id);
    content.invalidate(); res.json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(+req.params.id));
  });
  r.delete('/faqs/:id', (req, res) => { db.prepare('DELETE FROM faqs WHERE id = ?').run(+req.params.id); content.invalidate(); res.json({ ok: true }); });

  /* ------------------------------------------------------------ content: benefits */
  r.get('/benefits', (req, res) => res.json(db.prepare('SELECT * FROM benefits ORDER BY sort, id').all().map(b => Object.assign(parse(b.data, {}), { id: b.id, sort: b.sort, published: !!b.published }))));
  r.put('/benefits/:id', (req, res) => {
    const id = req.params.id, b = req.body || {};
    if (!SLUG.test(id)) return bad(res, 'Invalid id.');
    if (!str(b.title, 160)) return bad(res, 'Title required.');
    const data = Object.assign({}, b); delete data.sort; delete data.published; data.id = id;
    db.prepare(`INSERT INTO benefits (id, sort, published, data) VALUES (?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, published = excluded.published, data = excluded.data`)
      .run(id, +b.sort || 0, b.published === false ? 0 : 1, JSON.stringify(data));
    content.invalidate(); res.json(data);
  });
  r.delete('/benefits/:id', (req, res) => { db.prepare('DELETE FROM benefits WHERE id = ?').run(req.params.id); content.invalidate(); res.json({ ok: true }); });

  /* ------------------------------------------------------------ ambassadors (Growth Squad) */
  r.get('/ambassadors', (req, res) => res.json(db.prepare(`SELECT a.*,
      (SELECT COUNT(*) FROM submissions s WHERE s.ref = a.code AND s.status <> 'spam') AS leads,
      (SELECT COUNT(*) FROM submissions s WHERE s.ref = a.code AND s.status = 'enrolled') AS enrolled
    FROM ambassadors a ORDER BY leads DESC, a.created_at`).all().map(a => Object.assign(a, { active: !!a.active }))));
  r.put('/ambassadors/:code', (req, res) => {
    const code = String(req.params.code).toUpperCase();
    if (!/^[A-Z0-9-]{3,12}$/.test(code)) return bad(res, 'Code must be 3–12 letters, numbers or dashes (e.g. CC-AR01).');
    const a = req.body || {}; const name = str(a.name, 120); if (!name) return bad(res, 'Name required.');
    db.prepare(`INSERT INTO ambassadors (code, name, email, phone, active) VALUES (?,?,?,?,?)
                ON CONFLICT(code) DO UPDATE SET name = excluded.name, email = excluded.email, phone = excluded.phone, active = excluded.active`)
      .run(code, name, str(a.email, 160), str(a.phone, 30), a.active === false ? 0 : 1);
    res.json(db.prepare('SELECT * FROM ambassadors WHERE code = ?').get(code));
  });
  r.delete('/ambassadors/:code', (req, res) => { db.prepare('DELETE FROM ambassadors WHERE code = ?').run(String(req.params.code).toUpperCase()); res.json({ ok: true }); });

  return r;
};
