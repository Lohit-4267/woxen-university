'use strict';
/** Validation + normalisation for public form submissions. Returns { value } or { error }. */

const TYPES = ['lead', 'event', 'waitlist', 'ambassador'];
const EXTRA_KEYS = ['team_name', 'teammates', 'squad_role', 'handle', 'gaps', 'club'];
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function normalisePhone(raw) {
  const s = str(raw, 30);
  const digits = s.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  // Bare 10-digit Indian mobile → +91XXXXXXXXXX; otherwise keep the digits with a leading +
  if (digits.length === 10) return '+91' + digits;
  return '+' + digits;
}

function validateSubmission(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request.' };
  const type = str(body.type, 20);
  if (!TYPES.includes(type)) return { error: 'Unknown form type.' };

  const name = str(body.name, 120);
  if (name.length < 2) return { error: 'Please enter your full name.' };

  const phone = normalisePhone(body.phone);
  if (!phone) return { error: 'Please enter a valid WhatsApp number.' };

  const email = str(body.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Please enter a valid email address.' };

  const extra = {};
  for (const k of EXTRA_KEYS) { const max = k === 'gaps' ? 800 : 200; if (body[k] != null && str(body[k], max)) extra[k] = str(body[k], max); }

  const value = {
    type, name, phone, email,
    stage: str(body.stage, 60),
    track: str(body.track, 120),
    track_id: str(body.track_id, 60),
    track_status: str(body.track_status, 20),
    event: str(body.event, 160),
    event_id: str(body.event_id, 60),
    ref: str(body.ref, 20).toUpperCase().replace(/[^A-Z0-9-]/g, ''),
    source: str(body.source, 60),
    utm_source: str(body.utm_source, 60),
    utm_medium: str(body.utm_medium, 60),
    utm_campaign: str(body.utm_campaign, 60),
    utm_content: str(body.utm_content, 60),
    page: str(body.page, 120),
    extra: JSON.stringify(extra)
  };
  if (type === 'event' && !value.event_id) return { error: 'Missing event.' };
  return { value };
}

module.exports = { validateSubmission, normalisePhone, str };
