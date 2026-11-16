'use strict';
/**
 * Builds the public site content (window.ARZON_CONFIG + window.ARZON_DATA) from the database,
 * in exactly the shape the front-end expects. Cached in memory; any admin write calls invalidate().
 */
const ICONS = require('./icons.json');

const parse = (s, fallback) => { try { return JSON.parse(s); } catch (_) { return fallback; } };

function getSettings(db) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = parse(r.value, null);
  return out;
}

function seatsTaken(db) {
  const m = {};
  const rows = db.prepare(`SELECT event_id, COUNT(*) AS n FROM submissions
                           WHERE type = 'event' AND event_id <> '' AND status <> 'spam' GROUP BY event_id`).all();
  for (const r of rows) m[r.event_id] = r.n;
  return m;
}

function build(db) {
  const S = getSettings(db);
  const contact = S.contact || {}, pricing = S.pricing || {}, site = S.site || {};

  const config = {
    ENDPOINT: '/api/submissions',
    REGISTER_URL: site.register_url || 'https://arzonglobal.com/',
    PHONE: contact.phone || '', EMAIL: contact.email || '', ADDRESS: contact.address || '', WHATSAPP: contact.whatsapp || '',
    PRICE: pricing.price, LIST_PRICE: pricing.list_price, REG_FEE: pricing.reg_fee, SCHOLARSHIP: !!pricing.scholarship,
    SOURCE: site.source || 'woxsen_crowdcore',
    SHOW_UPCOMING: !!site.show_upcoming,
    COHORT: S.cohort || { label: '', start: '' }
  };

  const CATS = {};
  for (const c of db.prepare('SELECT id, label FROM categories ORDER BY sort, id').all()) CATS[c.id] = c.label;

  const TRACKS = db.prepare('SELECT * FROM tracks WHERE published = 1 ORDER BY sort, name').all().map(r => {
    const t = parse(r.data, {});
    return Object.assign({ fit: [], roles: [], tools: [], certs: [], modules: [], signal: { text: '', src: '' } }, t,
      { id: r.id, name: r.name, cat: r.cat, live: !!r.live, flagship: !!r.flagship });
  });

  const taken = seatsTaken(db);
  const EVENTS = db.prepare('SELECT * FROM events WHERE published = 1 ORDER BY starts_at').all().map(e => ({
    id: e.id, type: e.type, title: e.title, track: e.track_id || '', date: e.starts_at, mode: e.mode, host: e.host,
    seats: e.seats, seats_left: e.seats == null ? null : Math.max(0, e.seats - (taken[e.id] || 0))
  }));

  const FAQ = db.prepare('SELECT q, a FROM faqs WHERE published = 1 ORDER BY sort, id').all().map(f => ({ q: f.q, a: f.a }));
  const BENEFITS = db.prepare('SELECT id, data FROM benefits WHERE published = 1 ORDER BY sort, id').all()
    .map(b => Object.assign(parse(b.data, {}), { id: b.id }));

  return { config, data: { CATS, TRACKS, EVENTS, CASE_COMP: S.case_comp || {}, FAQ, BENEFITS, ICONS } };
}

let cache = null;
function get(db) {
  // Seat counts change with every registration, so keep the cache short-lived.
  if (!cache || Date.now() - cache.at > 15000) cache = { at: Date.now(), value: build(db) };
  return cache.value;
}
function invalidate() { cache = null; }

/** JS payload for <script src="/site-data.js">. "<" is escaped so content can never close the script tag. */
function toScript(content) {
  const j = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  return `window.ARZON_CONFIG=${j(content.config)};\nwindow.ARZON_DATA=${j(content.data)};\n`;
}

module.exports = { get, invalidate, toScript, getSettings, seatsTaken };
