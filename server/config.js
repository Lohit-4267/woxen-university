'use strict';
const path = require('node:path');
const env = process.env;
const prod = env.NODE_ENV === 'production' || !!env.VERCEL;

module.exports = {
  port: +env.PORT || 3000,
  // Postgres connection string (Supabase: use the connection pooler URL). Unset → local PGlite database.
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
  pgliteDir: env.PGLITE_DIR || path.join(__dirname, '..', 'data', 'pglite'),
  prod,
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : prod,
  trustProxy: env.TRUST_PROXY ? (isNaN(+env.TRUST_PROXY) ? env.TRUST_PROXY : +env.TRUST_PROXY) : (prod ? 1 : false),
  ipSalt: env.IP_SALT || 'change-me',
  submitLimit: +env.SUBMIT_RATE_LIMIT || 20,           // form posts per IP per 10 min
  notifyWebhook: env.NOTIFY_WEBHOOK_URL || '',
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || ''
};
