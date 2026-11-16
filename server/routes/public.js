'use strict';
const express = require('express');
const content = require('../lib/content');
const { validateSubmission } = require('../lib/validate');
const { rateLimit, sha256 } = require('../lib/security');
const notify = require('../lib/notify');

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = function publicRoutes(getDb, cfg) {
  const r = express.Router();

  r.get('/api/health', ah(async (req, res) => {
    const db = await getDb();
    await db.query('SELECT 1');
    res.json({ ok: true, db: db.kind, time: new Date().toISOString() });
  }));

  // Site content consumed by the front-end as a classic script (keeps the page's synchronous boot).
  r.get('/site-data.js', ah(async (req, res) => {
    const c = await content.get(await getDb());
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(content.toScript(c));
  }));
  r.get('/api/content', ah(async (req, res) => res.set('Cache-Control', 'no-cache').json(await content.get(await getDb()))));

  const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: cfg.submitLimit, message: 'Too many submissions from this network. Please try again in a few minutes.' });

  r.post('/api/submissions', limiter, ah(async (req, res) => {
    const body = req.body || {};
    // Honeypot: bots fill every field. Pretend success, store nothing.
    if (body.website) return res.status(201).json({ ok: true });

    const { value: v, error } = validateSubmission(body);
    if (error) return res.status(400).json({ error });

    const db = await getDb();
    const ipHash = sha256((cfg.ipSalt || '') + (req.ip || '')).slice(0, 24);
    const ua = String(req.get('user-agent') || '').slice(0, 200);

    const result = await db.tx(async t => {
      if (v.type === 'event') {
        const S = await content.getSettings(t);
        const caseId = (S.case_comp && S.case_comp.id) || 'market-masters';
        if (v.event_id !== caseId) {
          // Row lock serialises concurrent registrations for the same event, so seats can't oversell.
          const ev = await t.one('SELECT * FROM events WHERE id = $1 AND published FOR UPDATE', [v.event_id]);
          if (!ev) return { status: 404, error: 'This event is no longer available.' };
          if (new Date(ev.starts_at) < new Date()) return { status: 409, error: 'This event has already ended.' };
          v.event = ev.title;
          if (ev.seats != null) {
            const { n } = await t.one(`SELECT COUNT(*)::int AS n FROM submissions WHERE type = 'event' AND event_id = $1 AND status <> 'spam'`, [ev.id]);
            if (n >= ev.seats) return { status: 409, error: 'Sorry, this event is full. Join another session or WhatsApp us for the waitlist.' };
          }
        }
      }

      // De-duplicate double-clicks / resubmits: same person, same form, same target within 10 minutes.
      const dup = await t.one(`SELECT id FROM submissions WHERE type = $1 AND email = $2 AND event_id = $3 AND track = $4
                               AND created_at > now() - interval '10 minutes' LIMIT 1`, [v.type, v.email, v.event_id, v.track]);
      if (dup) return { id: dup.id, duplicate: true };

      const row = await t.one(`INSERT INTO submissions
        (type, name, phone, email, stage, track, track_id, track_status, event, event_id, ref, source,
         utm_source, utm_medium, utm_campaign, utm_content, page, extra, ip_hash, user_agent)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20) RETURNING id`, [
        v.type, v.name, v.phone, v.email, v.stage, v.track, v.track_id, v.track_status, v.event, v.event_id, v.ref, v.source,
        v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content, v.page, v.extra, ipHash, ua]);
      return { id: row.id };
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    if (!result.duplicate) {
      if (v.type === 'event') content.invalidate(); // seat counts changed
      await notify.submission(cfg, Object.assign({ id: result.id }, v));
    }
    res.status(201).json({ ok: true, id: result.id });
  }));

  return r;
};
