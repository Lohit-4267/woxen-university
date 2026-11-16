'use strict';
const path = require('node:path');
const env = process.env;
const prod = env.NODE_ENV === 'production';

module.exports = {
  port: +env.PORT || 3000,
  dbFile: env.DB_FILE || path.join(__dirname, '..', 'data', 'arzon.db'),
  prod,
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : prod,
  trustProxy: env.TRUST_PROXY || (prod ? 1 : false),   // behind Render/Railway/Nginx set to 1
  ipSalt: env.IP_SALT || 'change-me',
  submitLimit: +env.SUBMIT_RATE_LIMIT || 20,           // form posts per IP per 10 min
  notifyWebhook: env.NOTIFY_WEBHOOK_URL || '',
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || ''
};
