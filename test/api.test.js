'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

let server, base, cookie = '';
const cfg = { databaseUrl: '', pgliteDir: '', prod: false, secureCookies: false, trustProxy: false, ipSalt: 't', submitLimit: 1000,
  notifyWebhook: '', adminEmail: 'admin@test.local', adminPassword: 'correct-horse-battery' };

const req = async (method, path, body, headers = {}) => {
  const res = await fetch(base + path, { method, headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, cookie ? { cookie } : {}, headers), body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch (_) { json = text; }
  return { status: res.status, body: json, headers: res.headers };
};
const lead = (o = {}) => Object.assign({ type: 'lead', name: 'Aditi Rao', phone: '98765 43210', email: 'Aditi@Woxsen.edu.in', stage: 'MBA · 1st year', track: 'Business Analytics & Intelligence', track_id: 'business-analytics' }, o);

before(async () => {
  const app = createApp(cfg);
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('serves the site and seeded content', async () => {
  const home = await fetch(base + '/'); assert.equal(home.status, 200);
  const html = await home.text(); assert.match(html, /<script src="\/site-data.js"><\/script>/);
  const js = await req('GET', '/site-data.js'); assert.match(js.body, /^window\.ARZON_CONFIG=/);
  const c = await req('GET', '/api/content');
  assert.equal(c.body.config.ENDPOINT, '/api/submissions');
  assert.equal(c.body.config.PRICE, undefined); // fees are never published
  assert.equal(c.body.config.SCHOLARSHIP, true);
  assert.ok(c.body.data.TRACKS.length >= 20);
  assert.ok(c.body.data.TRACKS.find(t => t.id === 'business-analytics').modules.length > 0);
  assert.ok(c.body.data.ICONS.chart);
  assert.equal(c.body.data.BENEFITS.length, 7);
});

test('rejects invalid submissions', async () => {
  assert.equal((await req('POST', '/api/submissions', lead({ name: 'A' }))).status, 400);
  assert.equal((await req('POST', '/api/submissions', lead({ phone: '123' }))).status, 400);
  assert.equal((await req('POST', '/api/submissions', lead({ email: 'nope' }))).status, 400);
  assert.equal((await req('POST', '/api/submissions', lead({ type: 'hack' }))).status, 400);
  assert.equal((await req('POST', '/api/submissions', '{bad', {})).status, 400);
});

test('stores a lead, normalises fields, de-duplicates resubmits', async () => {
  const r = await req('POST', '/api/submissions', lead({ ref: 'cc-ar01', utm_medium: 'instagram' }));
  assert.equal(r.status, 201); assert.ok(r.body.id);
  const again = await req('POST', '/api/submissions', lead({ ref: 'cc-ar01' }));
  assert.equal(again.body.id, r.body.id, 'duplicate within 10 min returns the same id');
});

test('honeypot submissions are silently dropped', async () => {
  const r = await req('POST', '/api/submissions', lead({ email: 'bot@spam.com', website: 'http://spam' }));
  assert.equal(r.status, 201); assert.equal(r.body.id, undefined);
});

test('event registration enforces seats and past events', async () => {
  // past seeded event
  assert.equal((await req('POST', '/api/submissions', lead({ type: 'event', event_id: 'sprint-analytics' }))).status, 409);
  assert.equal((await req('POST', '/api/submissions', lead({ type: 'event', event_id: 'nope' }))).status, 404);
  // the case challenge is always accepted
  assert.equal((await req('POST', '/api/submissions', lead({ type: 'event', event_id: 'market-masters', team_name: 'Alpha' }))).status, 201);
});

test('admin auth is required', async () => {
  const saved = cookie; cookie = '';
  assert.equal((await req('GET', '/api/admin/stats')).status, 401);
  assert.equal((await req('POST', '/api/admin/login', { email: 'admin@test.local', password: 'wrong' })).status, 401);
  cookie = saved;
});

test('admin: login, list, update, export', async () => {
  const l = await req('POST', '/api/admin/login', { email: 'ADMIN@test.local', password: 'correct-horse-battery' });
  assert.equal(l.status, 200); assert.ok(cookie.startsWith('aw_sess='));

  const list = await req('GET', '/api/admin/submissions?type=lead');
  assert.equal(list.status, 200);
  const row = list.body.rows.find(r => r.email === 'aditi@woxsen.edu.in');
  assert.ok(row); assert.equal(row.phone, '+919876543210'); assert.equal(row.ref, 'CC-AR01'); assert.equal(row.status, 'new');

  const up = await req('PATCH', `/api/admin/submissions/${row.id}`, { status: 'contacted', notes: 'Called, interested' });
  assert.equal(up.body.status, 'contacted');
  assert.equal((await req('PATCH', `/api/admin/submissions/${row.id}`, { status: 'bogus' })).status, 400);

  const search = await req('GET', '/api/admin/submissions?q=interested');
  assert.equal(search.body.total, 1);

  const stats = await req('GET', '/api/admin/stats');
  assert.ok(stats.body.total >= 2); assert.equal(stats.body.referrals[0].code, 'CC-AR01');

  const csv = await fetch(base + '/api/admin/submissions.csv', { headers: { cookie } });
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /aditi@woxsen\.edu\.in/);
});

test('admin: CSV neutralises formula injection', async () => {
  await req('POST', '/api/submissions', lead({ name: '=HYPERLINK("x")', email: 'f@x.com' }));
  const csv = await (await fetch(base + '/api/admin/submissions.csv', { headers: { cookie } })).text();
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});

test('admin: content edits go live (tracks, events with seats, settings)', async () => {
  const t = await req('PUT', '/api/admin/tracks/excel-pro', { name: 'Excel Pro', cat: 'business', live: true, fit: ['bba'], tools: ['Excel'], modules: [{ t: 'Basics', topics: ['Cells'] }] });
  assert.equal(t.status, 200);
  assert.equal((await req('PUT', '/api/admin/tracks/Bad Id', { name: 'x', cat: 'business' })).status, 400);

  const when = new Date(Date.now() + 7 * 864e5).toISOString();
  assert.equal((await req('PUT', '/api/admin/events/tiny', { title: 'Tiny session', type: 'Clinic', starts_at: when, seats: 1 })).status, 200);
  assert.equal((await req('PUT', '/api/admin/settings/pricing', { price: 9000, list_price: 24999, reg_fee: 1065, scholarship: true })).status, 200);

  const c = (await req('GET', '/api/content')).body;
  assert.ok(c.data.TRACKS.find(x => x.id === 'excel-pro'));
  assert.equal(c.config.PRICE, undefined);
  assert.equal((await req('GET', '/api/admin/settings')).body.pricing.price, 9000); // kept for the admin team only
  assert.equal(c.data.EVENTS.find(e => e.id === 'tiny').seats_left, 1);

  assert.equal((await req('POST', '/api/submissions', lead({ type: 'event', event_id: 'tiny', email: 'one@x.com' }))).status, 201);
  const full = await req('POST', '/api/submissions', lead({ type: 'event', event_id: 'tiny', email: 'two@x.com' }));
  assert.equal(full.status, 409); assert.match(full.body.error, /full/);
  assert.equal((await req('GET', '/api/content')).body.data.EVENTS.find(e => e.id === 'tiny').seats_left, 0);

  // hide a track
  await req('PUT', '/api/admin/tracks/excel-pro', { name: 'Excel Pro', cat: 'business', published: false });
  assert.ok(!(await req('GET', '/api/content')).body.data.TRACKS.find(x => x.id === 'excel-pro'));
});

test('admin: ambassadors credited with referral leads', async () => {
  assert.equal((await req('PUT', '/api/admin/ambassadors/cc-ar01', { name: 'Arjun' })).status, 200);
  const list = (await req('GET', '/api/admin/ambassadors')).body;
  assert.equal(list[0].code, 'CC-AR01'); assert.equal(list[0].leads, 1);
});

test('reviews, ratings and trust are published; healthcare reviews stay hidden', async () => {
  const d = (await req('GET', '/api/content')).body.data;
  assert.ok(d.REVIEWS.length >= 5);
  assert.ok(!d.REVIEWS.some(r => /health|pharma|medical/i.test(r.text)), 'no healthcare/pharma reviews on the MBA/BBA site');
  assert.equal(d.RATINGS.google_rating, 4.5);
  assert.ok(d.TRUST.badges.some(b => /ISO 9001/.test(b.t)) && d.TRUST.badges.some(b => /MSME/.test(b.t)));
  const all = (await req('GET', '/api/admin/reviews')).body;
  assert.ok(all.length >= 8 && all.some(r => !r.published));
  const added = await req('POST', '/api/admin/reviews', { source: 'ambitionbox', author: 'Test Student', rating: 4, text: 'Solid mentors.', featured: true });
  assert.equal(added.status, 201);
  assert.ok((await req('GET', '/api/content')).body.data.REVIEWS.find(r => r.author === 'Test Student' && r.source === 'ambitionbox'));
  assert.equal((await req('DELETE', '/api/admin/reviews/' + added.body.id)).status, 200);
  assert.equal((await req('GET', '/api/content')).body.config.REGISTER_URL, 'https://rzp.io/rzp/Jm81XZWn');
});

test('counsellors see registrations only', async () => {
  const made = await req('POST', '/api/admin/admins', { email: 'counsellor@test.local', name: 'C One', password: 'counsellor-pass-1', role: 'counsellor' });
  assert.equal(made.status, 201); assert.equal(made.body.role, 'counsellor');
  const adminCookie = cookie; cookie = '';
  const login = await req('POST', '/api/admin/login', { email: 'counsellor@test.local', password: 'counsellor-pass-1' });
  assert.equal(login.status, 200); assert.equal(login.body.admin.role, 'counsellor');
  const list = await req('GET', '/api/admin/submissions?limit=5');
  assert.equal(list.status, 200); assert.ok(list.body.total >= 1);
  const id = list.body.rows ? list.body.rows[0].id : list.body.items[0].id;
  assert.equal((await req('PATCH', '/api/admin/submissions/' + id, { status: 'contacted', notes: 'Called, interested' })).status, 200);
  assert.equal((await req('GET', '/api/admin/submissions.csv')).status, 200);
  for (const [m, p] of [['GET', '/api/admin/settings'], ['GET', '/api/admin/admins'], ['GET', '/api/admin/tracks'], ['PUT', '/api/admin/settings/site'], ['DELETE', '/api/admin/submissions/' + id], ['POST', '/api/admin/admins']])
    assert.equal((await req(m, p, m === 'GET' || m === 'DELETE' ? undefined : {})).status, 403, `${m} ${p} should be admin-only`);
  await req('POST', '/api/admin/logout', {}); cookie = adminCookie;
});

test('blocks cross-origin admin writes', async () => {
  const r = await req('POST', '/api/admin/logout', {}, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('logout ends the session', async () => {
  assert.equal((await req('POST', '/api/admin/logout', {})).status, 200);
  cookie = '';
  assert.equal((await req('GET', '/api/admin/me')).status, 401);
});
