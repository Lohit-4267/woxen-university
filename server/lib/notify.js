'use strict';
/**
 * Optional new-lead notifications. Set NOTIFY_WEBHOOK_URL to any endpoint that accepts JSON
 * (Slack/Discord incoming webhook, Zapier/Make hook, Google Apps Script web app…).
 * Fire-and-forget: a failing webhook never blocks or fails the submission.
 */
function submission(cfg, s) {
  if (!cfg.notifyWebhook) return;
  const label = { lead: 'Roadmap lead', event: 'Event seat', waitlist: 'Waitlist', ambassador: 'Growth Squad application' }[s.type] || s.type;
  const target = s.event || s.track || '';
  const text = `New ${label}: ${s.name} · ${s.phone} · ${s.email}${target ? ' · ' + target : ''}${s.stage ? ' · ' + s.stage : ''}${s.ref ? ' · ref ' + s.ref : ''}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  fetch(cfg.notifyWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, submission: s }),
    signal: ctrl.signal
  }).catch(e => console.warn('[notify] webhook failed:', e.message)).finally(() => clearTimeout(t));
}

module.exports = { submission };
