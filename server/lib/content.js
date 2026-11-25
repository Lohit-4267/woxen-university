'use strict';
/**
 * Builds the public site content (window.ARZON_CONFIG + window.ARZON_DATA) from the database,
 * in exactly the shape the front-end expects. Cached briefly in memory; admin writes call invalidate().
 */
const ICONS = require('./icons.json');
const { obj } = require('../db');

async function getSettings(db) {
  const out = {};
  for (const r of await db.query('SELECT key, value FROM settings')) out[r.key] = obj(r.value, null);
  return out;
}

async function build(db) {
  const [S, cats, tracks, events, faqs, bens, revs] = await Promise.all([
    getSettings(db),
    db.query('SELECT id, label FROM categories ORDER BY sort, id'),
    db.query('SELECT * FROM tracks WHERE published ORDER BY sort, name'),
    db.query(`SELECT e.*, (SELECT COUNT(*)::int FROM submissions s WHERE s.type = 'event' AND s.event_id = e.id AND s.status <> 'spam') AS taken
              FROM events e WHERE e.published ORDER BY e.starts_at`),
    db.query('SELECT q, a FROM faqs WHERE published ORDER BY sort, id'),
    db.query('SELECT id, data FROM benefits WHERE published ORDER BY sort, id'),
    db.query('SELECT source, author, rating, text, featured FROM reviews WHERE published ORDER BY sort, id')
  ]);
  const contact = S.contact || {}, pricing = S.pricing || {}, site = S.site || {};

  const config = {
    ENDPOINT: '/api/submissions',
    REGISTER_URL: site.register_url || 'https://arzonglobal.com/',
    PHONE: contact.phone || '', EMAIL: contact.email || '', ADDRESS: contact.address || '', WHATSAPP: contact.whatsapp || '',
    // Fees are intentionally not published: counsellors share them one-to-one.
    SCHOLARSHIP: !!pricing.scholarship,
    SOURCE: site.source || 'woxsen_crowdcore',
    SHOW_UPCOMING: !!site.show_upcoming,
    COHORT: S.cohort || { label: '', start: '' }
  };

  const CATS = {};
  for (const c of cats) CATS[c.id] = c.label;

  const TRACKS = tracks.map(r => Object.assign({ fit: [], roles: [], tools: [], certs: [], modules: [], signal: { text: '', src: '' } }, obj(r.data),
    { id: r.id, name: r.name, cat: r.cat, live: !!r.live, flagship: !!r.flagship }));

  const EVENTS = events.map(e => ({
    id: e.id, type: e.type, title: e.title, track: e.track_id || '', date: new Date(e.starts_at).toISOString(), mode: e.mode, host: e.host,
    seats: e.seats, seats_left: e.seats == null ? null : Math.max(0, e.seats - e.taken)
  }));

  const FAQ = faqs.map(f => ({ q: f.q, a: f.a }));
  const BENEFITS = bens.map(b => Object.assign(obj(b.data), { id: b.id }));

  const REVIEWS = revs.map(r => ({ source: r.source, author: r.author, rating: r.rating, text: r.text, featured: !!r.featured }));
  const RATINGS = S.ratings || {};
  const TRUST = Object.assign({ badges: [], partners: [] }, S.trust || {});

  return { config, data: { CATS, TRACKS, EVENTS, CASE_COMP: S.case_comp || {}, FAQ, BENEFITS, REVIEWS, RATINGS, TRUST, ICONS } };
}

let cache = null;
async function get(db) {
  // Seat counts change with every registration, so keep the cache short-lived.
  if (!cache || Date.now() - cache.at > 15000) cache = { at: Date.now(), value: await build(db) };
  return cache.value;
}
function invalidate() { cache = null; }

/** JS payload for <script src="/site-data.js">. "<" is escaped so content can never close the script tag. */
function toScript(content) {
  const j = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));
  return `window.ARZON_CONFIG=${j(content.config)};\nwindow.ARZON_DATA=${j(content.data)};\n`;
}

module.exports = { get, invalidate, toScript, getSettings };
