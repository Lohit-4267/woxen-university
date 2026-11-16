(function () {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtDay = iso => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const STATUSES = [['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['enrolled', 'Enrolled'], ['not_interested', 'Not interested'], ['spam', 'Spam']];
const TYPES = [['lead', 'Roadmap lead'], ['event', 'Event seat'], ['waitlist', 'Waitlist'], ['ambassador', 'Squad application']];
const label = (list, v) => (list.find(x => x[0] === v) || [v, v])[1];
const statusTag = s => `<span class="tag ${esc(s)}">${esc(label(STATUSES, s))}</span>`;

/* ---------------- API ---------------- */
async function api(path, opt = {}) {
  const res = await fetch('/api/admin' + path, {
    method: opt.method || 'GET', credentials: 'same-origin',
    headers: opt.body ? { 'Content-Type': 'application/json' } : {},
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Please sign in.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2800); }
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

/* ---------------- drawer ---------------- */
function openDrawer(html) { $('#drawerBody').innerHTML = html; $('#drawer').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); setTimeout(() => { const i = $('#drawerBody input, #drawerBody select, #drawerBody textarea'); i && i.focus(); }, 60); }
function closeDrawer() { $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer' || e.target.closest('[data-close]')) closeDrawer(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ---------------- generic form builder ----------------
   field: { k, l, type: text|textarea|number|select|check|datetime|lines|email, opts, hint, full, req } */
function field(f, v) {
  const id = 'f_' + f.k.replace(/\W/g, '_'), hint = f.hint ? `<small>${f.hint}</small>` : '';
  if (f.type === 'check') return `<label class="check"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}> ${esc(f.l)}</label>`;
  if (f.type === 'select') return `<label for="${id}">${esc(f.l)}<select id="${id}" name="${f.k}">${f.opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(v ?? '') === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>${hint}</label>`;
  if (f.type === 'textarea' || f.type === 'lines') return `<label for="${id}">${esc(f.l)}<textarea id="${id}" name="${f.k}" rows="${f.rows || 4}">${esc(f.type === 'lines' && Array.isArray(v) ? v.join('\n') : v)}</textarea>${hint}</label>`;
  const type = f.type === 'datetime' ? 'datetime-local' : (f.type || 'text');
  return `<label for="${id}">${esc(f.l)}<input id="${id}" name="${f.k}" type="${type}" value="${esc(v)}" ${f.req ? 'required' : ''} ${f.ro ? 'readonly' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>${hint}</label>`;
}
function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.k]; if (!el) continue;
    if (f.type === 'check') out[f.k] = el.checked;
    else if (f.type === 'number') out[f.k] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'lines') out[f.k] = lines(el.value);
    else out[f.k] = el.value.trim();
  }
  return out;
}
const layout = rows => rows.map(r => Array.isArray(r) ? `<div class="${r.length === 3 ? 'cols3' : 'cols'}">${r.join('')}</div>` : r).join('');

/* ---------------- auth ---------------- */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; setTimeout(() => $('#loginForm [name=email]').focus(), 50); }
function showApp(admin) { $('#login').hidden = true; $('#app').hidden = false; $('#who').textContent = admin.email; route(); }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, b = $('button', f); $('#loginErr').textContent = ''; b.disabled = true;
  try { const r = await api('/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } }); f.password.value = ''; showApp(r.admin); }
  catch (err) { $('#loginErr').textContent = err.message; } finally { b.disabled = false; }
});
$('#logout').onclick = guard(async () => { await api('/logout', { method: 'POST' }); showLogin(); });

/* ---------------- router ---------------- */
const views = {};
function route() {
  const v = (location.hash.slice(1) || 'dashboard').split('?')[0];
  const fn = views[v] || views.dashboard;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  closeDrawer();
  $('#view').innerHTML = '<div class="empty">Loading…</div>';
  guard(fn)();
  refreshBadge();
}
addEventListener('hashchange', () => { if (!$('#app').hidden) route(); });
const refreshBadge = guard(async () => { const s = await api('/submissions?status=new&limit=1'); const b = $('#newBadge'); b.hidden = !s.total; b.textContent = s.total; });

/* ================================================================ DASHBOARD */
views.dashboard = async () => {
  const s = await api('/stats');
  const days = []; const map = Object.fromEntries(s.daily.map(d => [d.day, d.n]));
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push([d, map[d] || 0]); }
  const max = Math.max(1, ...days.map(d => d[1])), W = 600, H = 150, bw = W / days.length;
  const chart = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Submissions per day, last 30 days">
    ${days.map(([d, n], i) => { const h = n ? Math.max(3, (n / max) * (H - 24)) : 0; return `<rect x="${i * bw + 2}" y="${H - 16 - h}" width="${bw - 4}" height="${h}" rx="2"><title>${fmtDay(d)}: ${n}</title></rect>`; }).join('')}
    <text x="0" y="${H - 2}">${fmtDay(days[0][0])}</text><text x="${W}" y="${H - 2}" text-anchor="end">Today</text></svg>`;
  const bars = (rows, k, fmtL = x => x) => { const m = Math.max(1, ...rows.map(r => r.n)); return rows.length ? `<div class="bars">${rows.map(r => `<div class="bar"><span class="t"><i style="width:${(r.n / m) * 100}%"></i>${esc(fmtL(r[k]))}</span><b>${r.n}</b></div>`).join('')}</div>` : '<p class="muted">No data yet.</p>'; };
  const upcoming = s.events.filter(e => new Date(e.starts_at) > new Date());
  $('#view').innerHTML = `
    <div class="head"><div><h1>Dashboard</h1><p class="muted">Everything submitted on the campus site.</p></div><a class="btn" href="#leads">View all leads →</a></div>
    <div class="grid kpis">
      ${[['Total', s.total], ['Today', s.today], ['Last 7 days', s.last7], ['New · to contact', s.newCount], ['Enrolled', s.enrolled]].map(([l, n]) => `<div class="card kpi"><span class="mono">${l}</span><b>${n.toLocaleString('en-IN')}</b></div>`).join('')}
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><h2>Submissions · last 30 days</h2>${chart}</div>
      <div class="card"><h2>By form</h2>${bars(s.byType, 'type', t => label(TYPES, t))}</div>
    </div>
    <div class="grid half" style="margin-top:14px">
      <div class="card"><h2>Top programmes</h2>${bars(s.topTracks, 'track')}</div>
      <div class="card"><h2>Programme & year</h2>${bars(s.topStages, 'stage')}</div>
      <div class="card"><h2>Channel (utm_medium)</h2>${bars(s.topSources, 'medium')}</div>
      <div class="card"><h2>Growth Squad leaderboard</h2>${s.referrals.length ? `<div class="bars">${s.referrals.map(r => `<div class="bar"><span class="t"><i style="width:${(r.n / s.referrals[0].n) * 100}%"></i><b>${esc(r.code)}</b> ${esc(r.name)} <span class="muted">· ${r.enrolled} enrolled</span></span><b>${r.n}</b></div>`).join('')}</div>` : '<p class="muted">No referral leads yet. Ambassadors share links from the Growth Squad page.</p>'}</div>
    </div>
    <div class="card" style="margin-top:14px"><h2>Upcoming events · seats</h2>${upcoming.length ? `<div class="bars">${upcoming.map(e => `<div class="bar"><span class="t"><i style="width:${e.seats ? Math.min(100, (e.taken / e.seats) * 100) : 0}%"></i>${esc(e.title)} <span class="muted">· ${fmtDay(e.starts_at)}</span></span><b>${e.taken}${e.seats ? '/' + e.seats : ''}</b></div>`).join('')}</div>` : '<p class="muted">No upcoming events. <a href="#events" style="color:var(--sky)">Add one →</a></p>'}</div>`;
};

/* ================================================================ LEADS */
let leadQ = { type: '', status: '', q: '', from: '', to: '', page: 1 };
views.leads = async () => {
  const p = new URLSearchParams(location.hash.split('?')[1] || ''); for (const k of ['type', 'status', 'event_id', 'ref']) if (p.get(k) != null) leadQ[k] = p.get(k);
  $('#view').innerHTML = `
    <div class="head"><div><h1>Leads</h1><p class="muted">Roadmap requests, event seats, waitlists and Squad applications.</p></div>
      <div class="row"><a class="btn" id="csv" href="#">Export CSV</a></div></div>
    <form class="filters" id="lf">
      <label>Search<input name="q" placeholder="Name, email, phone, notes" value="${esc(leadQ.q)}"></label>
      <label>Form<select name="type"><option value="">All forms</option>${TYPES.map(([v, l]) => `<option value="${v}" ${leadQ.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Status<select name="status"><option value="">All (excl. spam)</option>${STATUSES.map(([v, l]) => `<option value="${v}" ${leadQ.status === v ? 'selected' : ''}>${l}</option>`).join('')}<option value="all" ${leadQ.status === 'all' ? 'selected' : ''}>Everything</option></select></label>
      <label>From<input type="date" name="from" value="${esc(leadQ.from)}"></label>
      <label>To<input type="date" name="to" value="${esc(leadQ.to)}"></label>
      <button class="btn" type="button" id="lreset">Reset</button>
    </form>
    <div class="row" id="bulk" hidden style="margin-bottom:10px"><span class="muted" id="bulkN"></span>
      <select id="bulkS" style="width:auto">${STATUSES.map(([v, l]) => `<option value="${v}">Mark as ${l}</option>`).join('')}</select><button class="btn sm primary" id="bulkGo">Apply</button></div>
    <div id="ltbl"></div>`;
  const f = $('#lf'); let t;
  f.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { Object.assign(leadQ, { q: f.q.value.trim(), type: f.type.value, status: f.status.value, from: f.from.value, to: f.to.value, page: 1 }); loadLeads(); }, e.target.name === 'q' ? 300 : 0); });
  f.addEventListener('submit', e => e.preventDefault());
  $('#lreset').onclick = () => { leadQ = { type: '', status: '', q: '', from: '', to: '', page: 1 }; location.hash = 'leads'; views.leads(); };
  $('#bulkGo').onclick = guard(async () => { const ids = $$('#ltbl input[data-id]:checked').map(i => +i.dataset.id); await api('/submissions/bulk', { method: 'POST', body: { ids, status: $('#bulkS').value } }); toast(`Updated ${ids.length}`); loadLeads(); refreshBadge(); });
  await loadLeads();
};
const qsOf = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
async function loadLeads() {
  const d = await api('/submissions?' + qsOf(Object.assign({ limit: 50 }, leadQ)));
  if (!$('#ltbl')) return; // user navigated away while loading
  const { page, ...noPage } = leadQ; $('#csv').href = '/api/admin/submissions.csv?' + qsOf(noPage);
  const pages = Math.max(1, Math.ceil(d.total / d.limit));
  $('#ltbl').innerHTML = d.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th><input type="checkbox" id="all" aria-label="Select all"></th><th>Received</th><th>Name</th><th>Contact</th><th>Form</th><th>Interest</th><th>Year</th><th>Ref</th><th>Status</th></tr></thead><tbody>
    ${d.rows.map(r => `<tr class="click" data-row="${r.id}"><td><input type="checkbox" data-id="${r.id}" aria-label="Select"></td><td class="nowrap">${fmt(r.created_at)}</td><td><b>${esc(r.name)}</b></td>
      <td class="nowrap"><a href="https://wa.me/${esc(r.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener" style="color:var(--sky)">${esc(r.phone)}</a><br><span class="muted">${esc(r.email)}</span></td>
      <td>${esc(label(TYPES, r.type))}</td><td>${esc(r.event || r.track || '')}${r.extra.team_name ? `<br><span class="muted">Team: ${esc(r.extra.team_name)}</span>` : ''}${r.extra.squad_role ? `<br><span class="muted">${esc(r.extra.squad_role)}</span>` : ''}</td>
      <td>${esc(r.stage)}</td><td>${esc(r.ref)}</td><td>${statusTag(r.status)}</td></tr>`).join('')}</tbody></table></div>
    <div class="pager"><span class="muted">${d.total.toLocaleString('en-IN')} result${d.total === 1 ? '' : 's'} · page ${d.page} of ${pages}</span>
      <div class="row"><button class="btn sm" id="prev" ${d.page <= 1 ? 'disabled' : ''}>← Prev</button><button class="btn sm" id="next" ${d.page >= pages ? 'disabled' : ''}>Next →</button></div></div>`
    : '<div class="card empty">No submissions match these filters yet.</div>';
  if (!d.rows.length) return;
  $('#prev').onclick = () => { leadQ.page--; loadLeads(); }; $('#next').onclick = () => { leadQ.page++; loadLeads(); };
  const sync = () => { const n = $$('#ltbl input[data-id]:checked').length; $('#bulk').hidden = !n; $('#bulkN').textContent = `${n} selected`; };
  $('#all').onchange = e => { $$('#ltbl input[data-id]').forEach(i => i.checked = e.target.checked); sync(); };
  $$('#ltbl tbody tr').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('input,a')) { sync(); return; } leadDetail(+tr.dataset.row); }));
}
const leadDetail = guard(async id => {
  const s = await api('/submissions/' + id);
  const kv = [['Form', label(TYPES, s.type)], ['Received', fmt(s.created_at)], ['Phone', `<a style="color:var(--sky)" href="https://wa.me/${esc(s.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(s.phone)} · WhatsApp</a>`],
    ['Email', `<a style="color:var(--sky)" href="mailto:${esc(s.email)}">${esc(s.email)}</a>`], ['Programme & year', esc(s.stage)], ['Programme', esc(s.track)], ['Track status', esc(s.track_status)], ['Event', esc(s.event)],
    ...Object.entries(s.extra).map(([k, v]) => [k.replace(/_/g, ' '), esc(v)]),
    ['Referral code', esc(s.ref)], ['UTM', esc([s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content].filter(Boolean).join(' / '))], ['Page', esc(s.page)]].filter(([, v]) => v);
  openDrawer(`<span class="mono">Submission #${s.id}</span><h2 style="font-size:22px;margin:6px 0 0">${esc(s.name)}</h2>
    <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
    <form class="form" id="lfm"><label>Status<select name="status">${STATUSES.map(([v, l]) => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Notes<textarea name="notes" rows="5" placeholder="Call notes, counsellor, payment status…">${esc(s.notes)}</textarea></label>
      <div class="actions"><button type="button" class="btn danger" id="ldel">Delete</button><button class="btn primary" type="submit">Save</button></div></form>
    ${s.history.length ? `<h3 style="margin-top:22px">Other submissions from this person</h3><div class="bars">${s.history.map(h => `<div class="bar"><span class="t">${esc(label(TYPES, h.type))} · ${esc(h.event || h.track)} <span class="muted">· ${fmt(h.created_at)}</span></span>${statusTag(h.status)}</div>`).join('')}</div>` : ''}`);
  $('#lfm').onsubmit = guard(async e => { e.preventDefault(); await api('/submissions/' + id, { method: 'PATCH', body: { status: e.target.status.value, notes: e.target.notes.value } }); toast('Saved'); closeDrawer(); loadLeads(); refreshBadge(); });
  $('#ldel').onclick = guard(async () => { if (!confirm('Delete this submission permanently?')) return; await api('/submissions/' + id, { method: 'DELETE' }); toast('Deleted'); closeDrawer(); loadLeads(); refreshBadge(); });
});

/* ================================================================ PROGRAMMES */
let ICON_OPTS = [];
async function iconOpts() { if (!ICON_OPTS.length) { const c = await fetch('/api/content').then(r => r.json()); ICON_OPTS = Object.keys(c.data.ICONS).map(k => [k, k]); } return ICON_OPTS; }
views.programmes = async () => {
  const [tracks, cats] = await Promise.all([api('/tracks'), api('/categories')]);
  const catL = Object.fromEntries(cats.map(c => [c.id, c.label]));
  $('#view').innerHTML = `<div class="head"><div><h1>Programmes</h1><p class="muted">${tracks.length} tracks. Changes go live on the site immediately.</p></div><button class="btn primary" id="tnew">+ New programme</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Programme</th><th>Category</th><th>For</th><th>Status</th><th>Home page</th><th>Visible</th></tr></thead><tbody>
    ${tracks.map(t => `<tr class="click" data-id="${esc(t.id)}"><td class="muted">${t.sort}</td><td><b>${esc(t.name)}</b><br><span class="muted">${esc(t.tagline || '')}</span></td><td>${esc(catL[t.cat] || t.cat)}</td><td>${esc((t.fit || []).join(', ').toUpperCase())}</td>
      <td>${t.live ? '<span class="tag on">Enrolling</span>' : '<span class="tag contacted">Coming soon</span>'}</td><td>${t.flagship ? '★' : ''}</td><td>${t.published ? '<span class="tag on">Published</span>' : '<span class="tag off">Hidden</span>'}</td></tr>`).join('')}
    </tbody></table></div>`;
  $('#tnew').onclick = () => trackForm(null, cats);
  $$('#view tbody tr').forEach(tr => tr.onclick = () => trackForm(tracks.find(t => t.id === tr.dataset.id), cats));
};
const trackForm = guard(async (t, cats) => {
  const icons = await iconOpts(); const isNew = !t; t = t || { cat: cats[0]?.id, live: true, published: true, fit: [], modules: [], signal: {} };
  const F = [
    { k: 'id', l: 'URL id', ro: !isNew, req: true, hint: 'Lowercase, dashes. Used in #/programme/<id>.', ph: 'e.g. business-analytics' },
    { k: 'name', l: 'Full name', req: true }, { k: 'short', l: 'Short name' }, { k: 'goal', l: 'Career goal (quiz & form chip)', ph: 'e.g. Business Analyst' },
    { k: 'cat', l: 'Category', type: 'select', opts: cats.map(c => [c.id, c.label]) }, { k: 'icon', l: 'Icon', type: 'select', opts: icons }, { k: 'sort', l: 'Order', type: 'number' },
    { k: 'live', l: 'Enrolling now (off = coming soon / waitlist)', type: 'check' }, { k: 'flagship', l: 'Show on home page', type: 'check' }, { k: 'published', l: 'Visible on site', type: 'check' },
    { k: 'fit_bba', l: 'Recommended for BBA', type: 'check' }, { k: 'fit_mba', l: 'Recommended for MBA', type: 'check' },
    { k: 'tagline', l: 'Tagline' }, { k: 'desc', l: 'One-line description', type: 'textarea', rows: 2 }, { k: 'overview', l: 'Overview', type: 'textarea', rows: 4 },
    { k: 'roles', l: 'Career roles', type: 'lines', hint: 'One per line.' }, { k: 'tools', l: 'Tools', type: 'lines', hint: 'One per line.' }, { k: 'certs', l: 'Certifications', type: 'lines', hint: 'One per line.' },
    { k: 'sig_text', l: 'Hiring signal' }, { k: 'sig_src', l: 'Signal source' }, { k: 'pay', l: 'Pay insight' }, { k: 'paySrc', l: 'Pay source' },
    { k: 'modules', l: 'Curriculum modules', type: 'textarea', rows: 8, hint: 'One module per line: <b>Title: topic, topic, topic</b>' },
    { k: 'capstone', l: 'Capstone project', type: 'textarea', rows: 2 }
  ];
  const v = Object.assign({}, t, { fit_bba: (t.fit || []).includes('bba'), fit_mba: (t.fit || []).includes('mba'), sig_text: t.signal?.text, sig_src: t.signal?.src,
    modules: (t.modules || []).map(m => `${m.t}: ${(m.topics || []).join(', ')}`).join('\n') });
  const h = k => field(F.find(f => f.k === k), v[k]);
  openDrawer(`<span class="mono">${isNew ? 'New programme' : 'Edit programme'}</span><h2 style="font-size:22px;margin:6px 0 18px">${esc(t.name || 'Untitled')}</h2>
    <form class="form" id="tf">${layout([[h('id'), h('name')], [h('short'), h('goal')], [h('cat'), h('icon'), h('sort')],
      `<fieldset><legend>Visibility</legend><div class="cols">${h('live')}${h('flagship')}${h('published')}${h('fit_bba')}${h('fit_mba')}</div></fieldset>`,
      h('tagline'), h('desc'), h('overview'), [h('roles'), h('tools')], h('certs'), [h('sig_text'), h('sig_src')], [h('pay'), h('paySrc')], h('modules'), h('capstone')])}
      <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" id="tdel">Delete</button>'}<button class="btn primary" type="submit">Save programme</button></div></form>`);
  $('#tf').onsubmit = guard(async e => {
    e.preventDefault(); const r = readForm(e.target, F);
    const body = Object.assign({}, t, {
      name: r.name, short: r.short, goal: r.goal, cat: r.cat, icon: r.icon, sort: r.sort, live: r.live, flagship: r.flagship, published: r.published,
      fit: [r.fit_bba && 'bba', r.fit_mba && 'mba'].filter(Boolean), tagline: r.tagline, desc: r.desc, overview: r.overview,
      roles: r.roles, tools: r.tools, certs: r.certs, signal: { text: r.sig_text, src: r.sig_src }, pay: r.pay, paySrc: r.paySrc, capstone: r.capstone,
      modules: lines(r.modules).map(l => { const i = l.indexOf(':'); return i < 0 ? { t: l, topics: [] } : { t: l.slice(0, i).trim(), topics: l.slice(i + 1).split(',').map(x => x.trim()).filter(Boolean) }; })
    });
    const id = isNew ? r.id : t.id; if (!id) throw new Error('URL id is required.');
    await api('/tracks/' + encodeURIComponent(id), { method: 'PUT', body }); toast('Programme saved'); closeDrawer(); views.programmes();
  });
  if (!isNew) $('#tdel').onclick = guard(async () => { if (!confirm(`Delete "${t.name}"? Consider hiding it instead.`)) return; await api('/tracks/' + encodeURIComponent(t.id), { method: 'DELETE' }); toast('Deleted'); closeDrawer(); views.programmes(); });
});

/* ================================================================ EVENTS */
const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); const ist = new Date(d.getTime() + 330 * 60000); return ist.toISOString().slice(0, 16); };
const fromLocalInput = v => v ? v + ':00+05:30' : '';
views.events = async () => {
  const [events, tracks] = await Promise.all([api('/events'), api('/tracks')]);
  $('#view').innerHTML = `<div class="head"><div><h1>Events</h1><p class="muted">Skill sprints, clinics and sessions. Times are IST. Seats fill from registrations.</p></div><button class="btn primary" id="enew">+ New event</button></div>
    ${events.length ? `<div class="tbl-wrap"><table><thead><tr><th>When (IST)</th><th>Event</th><th>Mode · host</th><th>Seats</th><th>Visible</th><th></th></tr></thead><tbody>
    ${events.map(e => { const past = new Date(e.starts_at) < new Date(); return `<tr class="click" data-id="${esc(e.id)}"><td class="nowrap">${fmt(e.starts_at)}${past ? '<br><span class="tag off">Ended</span>' : ''}</td><td><span class="muted">${esc(e.type)}</span><br><b>${esc(e.title)}</b></td><td>${esc(e.mode)}<br><span class="muted">${esc(e.host)}</span></td>
      <td>${e.taken}${e.seats != null ? ' / ' + e.seats : ''}</td><td>${e.published ? '<span class="tag on">Published</span>' : '<span class="tag off">Hidden</span>'}</td><td><a class="btn sm" href="#leads?type=event&event_id=${esc(e.id)}">Registrations</a></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">No events yet.</div>'}`;
  $('#enew').onclick = () => eventForm(null, tracks);
  $$('#view tbody tr').forEach(tr => tr.onclick = e => { if (e.target.closest('a')) return; eventForm(events.find(x => x.id === tr.dataset.id), tracks); });
};
function eventForm(e, tracks) {
  const isNew = !e; e = e || { type: 'Skill Sprint', published: true, seats: 120 };
  const F = [{ k: 'id', l: 'Id', ro: !isNew, req: true, ph: 'e.g. sprint-excel' }, { k: 'type', l: 'Type', ph: 'Skill Sprint, Career Clinic…' }, { k: 'title', l: 'Title', req: true },
    { k: 'starts_at', l: 'Starts (IST)', type: 'datetime' }, { k: 'mode', l: 'Mode / venue', ph: 'On campus · Woxsen' }, { k: 'host', l: 'Host', ph: 'CrowdCore × Arzon' },
    { k: 'seats', l: 'Seats', type: 'number', hint: 'Leave empty for unlimited.' }, { k: 'track_id', l: 'Linked programme', type: 'select', opts: [['', '— none —'], ...tracks.map(t => [t.id, t.name])] },
    { k: 'published', l: 'Visible on site', type: 'check' }];
  const v = Object.assign({}, e, { starts_at: toLocalInput(e.starts_at) }); const h = k => field(F.find(f => f.k === k), v[k]);
  openDrawer(`<span class="mono">${isNew ? 'New event' : 'Edit event'}</span><h2 style="font-size:22px;margin:6px 0 18px">${esc(e.title || 'Untitled')}</h2>
    <form class="form" id="ef">${layout([[h('id'), h('type')], h('title'), [h('starts_at'), h('seats')], [h('mode'), h('host')], h('track_id'), h('published')])}
    <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" id="edel">Delete</button>'}<button class="btn primary" type="submit">Save event</button></div></form>`);
  $('#ef').onsubmit = guard(async ev => { ev.preventDefault(); const r = readForm(ev.target, F); r.starts_at = fromLocalInput(r.starts_at);
    await api('/events/' + encodeURIComponent(isNew ? r.id : e.id), { method: 'PUT', body: r }); toast('Event saved'); closeDrawer(); views.events(); });
  if (!isNew) $('#edel').onclick = guard(async () => { if (!confirm('Delete this event? Registrations are kept.')) return; await api('/events/' + encodeURIComponent(e.id), { method: 'DELETE' }); toast('Deleted'); closeDrawer(); views.events(); });
}

/* ================================================================ GROWTH SQUAD */
views.squad = async () => {
  const [list, apps] = await Promise.all([api('/ambassadors'), api('/submissions?type=ambassador&limit=10')]);
  const link = code => `${location.origin}/?utm_source=woxsen_crowdcore&utm_medium=instagram&utm_campaign=growth_squad&ref=${encodeURIComponent(code)}`;
  $('#view').innerHTML = `<div class="head"><div><h1>Growth Squad</h1><p class="muted">Ambassadors and their referral codes. Every lead from their link is credited to them.</p></div><button class="btn primary" id="anew">+ Add ambassador</button></div>
    ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Contact</th><th>Leads</th><th>Enrolled</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(a => `<tr class="click" data-code="${esc(a.code)}"><td><b>${esc(a.code)}</b></td><td>${esc(a.name)}</td><td>${esc(a.phone)}<br><span class="muted">${esc(a.email)}</span></td><td>${a.leads}</td><td>${a.enrolled}</td>
      <td>${a.active ? '<span class="tag on">Active</span>' : '<span class="tag off">Inactive</span>'}</td><td class="nowrap"><button class="btn sm" data-copy="${esc(link(a.code))}">Copy link</button> <a class="btn sm" href="#leads?ref=${esc(a.code)}">Leads</a></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">No ambassadors yet. Approve a Squad application below and give them a code.</div>'}
    <div class="head" style="margin-top:28px"><h2>Latest Squad applications</h2><a class="btn sm" href="#leads?type=ambassador">All applications →</a></div>
    ${apps.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Received</th><th>Name</th><th>Role wanted</th><th>Handle</th><th>Status</th><th></th></tr></thead><tbody>
      ${apps.rows.map(r => `<tr><td class="nowrap">${fmt(r.created_at)}</td><td><b>${esc(r.name)}</b><br><span class="muted">${esc(r.phone)}</span></td><td>${esc(r.extra.squad_role || '')}</td><td>${esc(r.extra.handle || '')}</td><td>${statusTag(r.status)}</td>
      <td><button class="btn sm" data-approve="${r.id}">Approve → code</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No applications yet.</p>'}`;
  $('#anew').onclick = () => ambForm(null);
  $$('[data-copy]').forEach(b => b.onclick = async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(b.dataset.copy); toast('Referral link copied'); } catch (_) { prompt('Copy this link', b.dataset.copy); } });
  $$('#view tr[data-code]').forEach(tr => tr.onclick = e => { if (e.target.closest('a,button')) return; ambForm(list.find(a => a.code === tr.dataset.code)); });
  $$('[data-approve]').forEach(b => b.onclick = () => { const r = apps.rows.find(x => x.id === +b.dataset.approve);
    const initials = r.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); ambForm(null, { name: r.name, email: r.email, phone: r.phone, code: `CC-${initials}${String(list.length + 1).padStart(2, '0')}`, active: true }, r.id); });
};
function ambForm(a, prefill, appId) {
  const isNew = !a; a = a || prefill || { active: true };
  const F = [{ k: 'code', l: 'Referral code', ro: !isNew, req: true, ph: 'CC-AR01', hint: '3–12 letters, numbers or dashes.' }, { k: 'name', l: 'Name', req: true }, { k: 'phone', l: 'WhatsApp' }, { k: 'email', l: 'Email', type: 'email' }, { k: 'active', l: 'Active', type: 'check' }];
  const h = k => field(F.find(f => f.k === k), a[k]);
  openDrawer(`<span class="mono">${isNew ? 'New ambassador' : 'Edit ambassador'}</span><h2 style="font-size:22px;margin:6px 0 18px">${esc(a.name || 'Ambassador')}</h2>
    <form class="form" id="af">${layout([[h('code'), h('name')], [h('phone'), h('email')], h('active')])}
    <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" id="adel">Remove</button>'}<button class="btn primary" type="submit">Save</button></div></form>`);
  $('#af').onsubmit = guard(async e => { e.preventDefault(); const r = readForm(e.target, F);
    await api('/ambassadors/' + encodeURIComponent(isNew ? r.code : a.code), { method: 'PUT', body: r });
    if (appId) await api('/submissions/' + appId, { method: 'PATCH', body: { status: 'qualified', notes: `Approved · referral code ${r.code.toUpperCase()}` } });
    toast('Ambassador saved'); closeDrawer(); views.squad(); });
  if (!isNew) $('#adel').onclick = guard(async () => { if (!confirm('Remove this ambassador? Their past leads keep the code.')) return; await api('/ambassadors/' + encodeURIComponent(a.code), { method: 'DELETE' }); closeDrawer(); views.squad(); });
}

/* ================================================================ FAQ */
views.faq = async () => {
  const list = await api('/faqs');
  $('#view').innerHTML = `<div class="head"><div><h1>FAQ</h1><p class="muted">Shown on the home and scholarship pages.</p></div><button class="btn primary" id="fnew">+ New question</button></div>
    <div class="grid">${list.map(f => `<div class="card click" style="cursor:pointer" data-id="${f.id}"><div class="row" style="justify-content:space-between"><h3>${esc(f.q)}</h3><span class="row"><span class="muted">#${f.sort}</span>${f.published ? '' : '<span class="tag off">Hidden</span>'}</span></div><p class="muted" style="margin:6px 0 0">${esc(f.a)}</p></div>`).join('') || '<div class="card empty">No questions yet.</div>'}</div>`;
  $('#fnew').onclick = () => faqForm(null, list.length);
  $$('#view [data-id]').forEach(c => c.onclick = () => faqForm(list.find(f => f.id === +c.dataset.id)));
};
function faqForm(f, n) {
  const isNew = !f; f = f || { published: true, sort: n };
  const F = [{ k: 'q', l: 'Question', req: true }, { k: 'a', l: 'Answer', type: 'textarea', rows: 5 }, { k: 'sort', l: 'Order', type: 'number' }, { k: 'published', l: 'Visible on site', type: 'check' }];
  const h = k => field(F.find(x => x.k === k), f[k]);
  openDrawer(`<span class="mono">${isNew ? 'New question' : 'Edit question'}</span><form class="form" id="ff" style="margin-top:16px">${layout([h('q'), h('a'), [h('sort'), h('published')]])}
    <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" id="fdel">Delete</button>'}<button class="btn primary" type="submit">Save</button></div></form>`);
  $('#ff').onsubmit = guard(async e => { e.preventDefault(); const r = readForm(e.target, F); await api(isNew ? '/faqs' : '/faqs/' + f.id, { method: isNew ? 'POST' : 'PUT', body: r }); toast('Saved'); closeDrawer(); views.faq(); });
  if (!isNew) $('#fdel').onclick = guard(async () => { if (!confirm('Delete this question?')) return; await api('/faqs/' + f.id, { method: 'DELETE' }); closeDrawer(); views.faq(); });
}

/* ================================================================ BENEFITS */
views.benefits = async () => {
  const list = await api('/benefits');
  $('#view').innerHTML = `<div class="head"><div><h1>What you get</h1><p class="muted">Benefit cards and their detail pages (#/benefits/&lt;id&gt;).</p></div><button class="btn primary" id="bnew">+ New benefit</button></div>
    <div class="grid half">${list.map(b => `<div class="card" style="cursor:pointer" data-id="${esc(b.id)}"><span class="mono">${esc(b.kicker || '')}</span><h3 style="margin-top:6px">${esc(b.title)}</h3><p class="muted" style="margin:6px 0 0">${esc(b.short)}</p>${b.published ? '' : '<span class="tag off">Hidden</span>'}</div>`).join('')}</div>`;
  $('#bnew').onclick = () => benForm(null, list.length);
  $$('#view [data-id]').forEach(c => c.onclick = () => benForm(list.find(b => b.id === c.dataset.id)));
};
const benForm = guard(async (b, n) => {
  const icons = await iconOpts(); const isNew = !b; b = b || { published: true, sort: n, points: [], how: [], visual: 'letter' };
  const F = [{ k: 'id', l: 'Id', ro: !isNew, req: true }, { k: 'title', l: 'Title', req: true }, { k: 'kicker', l: 'Kicker' }, { k: 'short', l: 'Card text' },
    { k: 'lede', l: 'Detail page intro', type: 'textarea', rows: 3 }, { k: 'points', l: 'Key points', type: 'lines', hint: 'One per line.' },
    { k: 'how', l: 'How it works', type: 'textarea', rows: 4, hint: 'One step per line: <b>Step: description</b>' },
    { k: 'icon', l: 'Icon', type: 'select', opts: icons }, { k: 'visual', l: 'Illustration', type: 'select', opts: ['player', 'letter', 'feed', 'projects', 'certs'].map(x => [x, x]) },
    { k: 'sort', l: 'Order', type: 'number' }, { k: 'published', l: 'Visible on site', type: 'check' }];
  const v = Object.assign({}, b, { how: (b.how || []).map(([s, d]) => `${s}: ${d}`).join('\n') }); const h = k => field(F.find(x => x.k === k), v[k]);
  openDrawer(`<span class="mono">${isNew ? 'New benefit' : 'Edit benefit'}</span><h2 style="font-size:22px;margin:6px 0 18px">${esc(b.title || 'Untitled')}</h2>
    <form class="form" id="bf">${layout([[h('id'), h('title')], [h('kicker'), h('short')], h('lede'), h('points'), h('how'), [h('icon'), h('visual'), h('sort')], h('published')])}
    <div class="actions">${isNew ? '' : '<button type="button" class="btn danger" id="bdel">Delete</button>'}<button class="btn primary" type="submit">Save</button></div></form>`);
  $('#bf').onsubmit = guard(async e => { e.preventDefault(); const r = readForm(e.target, F);
    r.how = lines(r.how).map(l => { const i = l.indexOf(':'); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
    await api('/benefits/' + encodeURIComponent(isNew ? r.id : b.id), { method: 'PUT', body: r }); toast('Saved'); closeDrawer(); views.benefits(); });
  if (!isNew) $('#bdel').onclick = guard(async () => { if (!confirm('Delete this benefit?')) return; await api('/benefits/' + encodeURIComponent(b.id), { method: 'DELETE' }); closeDrawer(); views.benefits(); });
});

/* ================================================================ SETTINGS */
views.settings = async () => {
  const s = await api('/settings'); const c = s.contact || {}, p = s.pricing || {}, site = s.site || {}, co = s.cohort || {}, m = s.case_comp || {};
  const sec = (key, title, desc, fields, v) => `<form class="card form" data-key="${key}"><div><h2>${title}</h2><p class="muted" style="margin:4px 0 0">${desc}</p></div>${layout(fields.map(r => Array.isArray(r) ? r.map(f => field(f, v[f.k])) : field(r, v[r.k])))}<div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">Save</button></div></form>`;
  const SF = {
    contact: [[{ k: 'phone', l: 'Phone' }, { k: 'whatsapp', l: 'WhatsApp (digits only, with country code)' }], [{ k: 'email', l: 'Email', type: 'email' }, { k: 'address', l: 'Address' }]],
    pricing: [[{ k: 'price', l: 'Programme fee with scholarship (₹)', type: 'number' }, { k: 'list_price', l: 'List price (₹)', type: 'number' }, { k: 'reg_fee', l: 'Registration fee (₹)', type: 'number' }], { k: 'scholarship', l: 'Scholarship offer active', type: 'check' }],
    site: [[{ k: 'register_url', l: 'Registration / payment URL' }, { k: 'source', l: 'Lead source tag' }], { k: 'show_upcoming', l: 'Show "coming soon" programmes as waitlists', type: 'check' }],
    cohort: [[{ k: 'label', l: 'Cohort label', ph: 'Woxsen Batch' }, { k: 'start', l: 'Start date', type: 'date' }]],
    case_comp: [[{ k: 'name', l: 'Name' }, { k: 'tagline', l: 'Tagline' }], { k: 'brief', l: 'Brief', type: 'textarea', rows: 2 },
      [{ k: 'opens', l: 'Registrations open', type: 'date' }, { k: 'closes', l: 'Round 1 deadline', type: 'date' }, { k: 'final', l: 'Grand finale', type: 'date' }], { k: 'team', l: 'Team size' },
      { k: 'rounds', l: 'Rounds', type: 'textarea', rows: 3, hint: 'One per line: <b>Round title: description</b>' }, { k: 'prizes', l: 'Prizes', type: 'lines', hint: 'One per line.' }]
  };
  const mv = Object.assign({}, m, { rounds: (m.rounds || []).map(r => `${r.t}: ${r.d}`).join('\n') });
  $('#view').innerHTML = `<div class="head"><div><h1>Settings</h1><p class="muted">Site-wide details. Saved changes appear on the site within seconds.</p></div></div>
    <div class="grid">${sec('contact', 'Contact', 'Footer, WhatsApp button and email fallback.', SF.contact, c)}${sec('pricing', 'Pricing', 'Shown on programme cards, scholarship and benefits pages.', SF.pricing, p)}
    ${sec('site', 'Site', 'Registration link and attribution.', SF.site, site)}${sec('cohort', 'Cohort', 'Next batch shown across the site.', SF.cohort, co)}
    ${sec('case_comp', 'Case challenge', 'The Market Masters section on the Events page.', SF.case_comp, mv)}</div>`;
  $$('#view form[data-key]').forEach(f => f.onsubmit = guard(async e => {
    e.preventDefault(); const key = f.dataset.key; const flat = SF[key].flat(); const r = readForm(f, flat);
    let body = r;
    if (key === 'case_comp') body = Object.assign({}, m, r, { rounds: lines(r.rounds).map(l => { const i = l.indexOf(':'); return i < 0 ? { t: l, d: '' } : { t: l.slice(0, i).trim(), d: l.slice(i + 1).trim() }; }) });
    if (key === 'contact') body.whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
    await api('/settings/' + key, { method: 'PUT', body }); toast('Saved');
  }));
};

/* ================================================================ ACCOUNT */
views.account = async () => {
  const admins = await api('/admins'); const me = (await api('/me')).admin;
  $('#view').innerHTML = `<div class="head"><div><h1>Account</h1><p class="muted">Signed in as ${esc(me.email)}</p></div></div>
    <div class="grid half">
      <form class="card form" id="pw"><h2>Change password</h2><label>Current password<input type="password" name="current" autocomplete="current-password"></label><label>New password<input type="password" name="next" autocomplete="new-password" minlength="10"></label><small>At least 10 characters. Other sessions are signed out.</small><div class="row" style="justify-content:flex-end"><button class="btn primary">Update password</button></div></form>
      <div class="card"><h2>Admins</h2><div class="bars">${admins.map(a => `<div class="bar"><span class="t">${esc(a.email)} <span class="muted">${esc(a.name)}</span></span>${a.id === me.id ? '<span class="muted">you</span>' : `<button class="btn sm danger" data-rm="${a.id}">Remove</button>`}</div>`).join('')}</div>
        <form class="form" id="na" style="margin-top:16px"><h3>Add admin</h3><div class="cols"><label>Email<input type="email" name="email"></label><label>Name<input name="name"></label></div><label>Temporary password<input type="text" name="password" minlength="10" autocomplete="off"></label><div class="row" style="justify-content:flex-end"><button class="btn">Add admin</button></div></form></div>
    </div>`;
  $('#pw').onsubmit = guard(async e => { e.preventDefault(); await api('/password', { method: 'POST', body: { current: e.target.current.value, next: e.target.next.value } }); e.target.reset(); toast('Password updated'); });
  $('#na').onsubmit = guard(async e => { e.preventDefault(); const f = e.target; await api('/admins', { method: 'POST', body: { email: f.email.value, name: f.name.value, password: f.password.value } }); toast('Admin added'); views.account(); });
  $$('[data-rm]').forEach(b => b.onclick = guard(async () => { if (!confirm('Remove this admin?')) return; await api('/admins/' + b.dataset.rm, { method: 'DELETE' }); views.account(); }));
};

/* ---------------- boot ---------------- */
api('/me').then(r => showApp(r.admin)).catch(() => showLogin());
})();
