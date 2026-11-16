'use strict';
const crypto = require('node:crypto');

/* ---------------- passwords (scrypt) ---------------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(keyHex, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

/* ---------------- in-memory fixed-window rate limiter ---------------- */
function rateLimit({ windowMs, max, key = req => req.ip, message = 'Too many requests. Please try again in a few minutes.' }) {
  const hits = new Map();
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs);
  sweep.unref();
  return (req, res, next) => {
    const k = key(req), now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(k, h); }
    if (++h.n > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

/* ---------------- basic security headers ---------------- */
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  next();
}

/* ---------------- CSRF guard for cookie-authenticated JSON APIs ----------------
   Browsers can't send a cross-site application/json POST without a CORS preflight,
   and we also check Origin when present. */
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('x-forwarded-host') || req.get('host');
    try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Cross-origin request blocked.' }); }
    catch (_) { return res.status(403).json({ error: 'Bad origin.' }); }
  }
  if (!req.is('application/json') && req.headers['content-length'] && +req.headers['content-length'] > 0)
    return res.status(415).json({ error: 'Send JSON.' });
  next();
}

module.exports = { hashPassword, verifyPassword, sha256, randomToken, rateLimit, securityHeaders, sameOrigin };
