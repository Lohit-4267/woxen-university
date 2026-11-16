'use strict';
const express = require('express');
const content = require('../lib/content');
const { validateSubmission } = require('../lib/validate');
const { rateLimit, sha256 } = require('../lib/security');
const { tx } = require('../db');
const notify = require('../lib/notify');

module.exports = function publicRoutes(db, cfg) {
  const r = express.Router();

  r.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // Site content consumed by the front-end as a classic script (keeps the page's synchronous boot).
  r.get('/site-data.js', (req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(content.toScript(content.get(db)));
  });
  r.get('/api/content', (req, res) => res.set('Cache-Control', 'no-cache').json(content.get(db)));

  const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: cfg.submitLimit, message: 'Too many submissions from this network. Please try again in a few minutes.' });

  r.post('/api/submissions', limiter, (req, res) => {
    const body = req.body || {};
    // Honeypot: bots fill every field. Pretend success, store nothing.
    if (body.website) return res.status(201).json({ ok: true });

    const { value: v, error } = validateSubmission(body);
    if (error) return res.status(400).json({ error });

    const ipHash = sha256((cfg.ipSalt || '') + (req.ip || '')).slice(0, 24);
    const ua = String(req.get('user-agent') || '').slice(0, 200);

    try {
      const result = tx(db, () => {
        // De-duplicate double-clicks / resubmits: same person, same form, same target within 10 minutes.
        const dup = db.prepare(`SELECT id FROM submissions WHERE type = ? AND email = ? AND event_id = ? AND track = ?
                                AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes') LIMIT 1`)
          .get(v.type, v.email, v.event_id, v.track);
        if (dup) return { id: dup.id, duplicate: true };

        if (v.type === 'event') {
          const S = content.getSettings(db);
          const caseId = (S.case_comp && S.case_comp.id) || 'market-masters';
          if (v.event_id !== caseId) {
            const ev = db.prepare('SELECT * FROM events WHERE id = ? AND published = 1').get(v.event_id);
            if (!ev) return { status: 404, error: 'This event is no longer available.' };
            if (new Date(ev.starts_at) < new Date()) return { status: 409, error: 'This event has already ended.' };
            v.event = ev.title;
            if (ev.seats != null) {
              const n = db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE type = 'event' AND event_id = ? AND status <> 'spam'`).get(ev.id).n;
              if (n >= ev.seats) return { status: 409, error: 'Sorry, this event is full. Join another session or WhatsApp us for the waitlist.' };
            }
          }
        }

        const info = db.prepare(`INSERT INTO submissions
          (type, name, phone, email, stage, track, track_id, track_status, event, event_id, ref, source,
           utm_source, utm_medium, utm_campaign, utm_content, page, extra, ip_hash, user_agent)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          v.type, v.name, v.phone, v.email, v.stage, v.track, v.track_id, v.track_status, v.event, v.event_id, v.ref, v.source,
          v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content, v.page, v.extra, ipHash, ua);
        return { id: Number(info.lastInsertRowid) };
      });

      if (result.error) return res.status(result.status).json({ error: result.error });
      if (!result.duplicate) {
        if (v.type === 'event') content.invalidate(); // seat counts changed
        notify.submission(cfg, Object.assign({ id: result.id }, v));
      }
      res.status(201).json({ ok: true, id: result.id });
    } catch (e) {
      console.error('[submissions] insert failed', e);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return r;
};
