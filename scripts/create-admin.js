'use strict';
// Usage: npm run create-admin -- you@example.com "a-strong-password" "Your Name"
const cfg = require('../server/config');
const { open } = require('../server/db');
const { hashPassword } = require('../server/lib/security');

const [email, password, name = 'Admin'] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: npm run create-admin -- <email> <password> [name]'); process.exit(1); }
if (password.length < 10) { console.error('Password must be at least 10 characters.'); process.exit(1); }
const db = open(cfg.dbFile);
db.prepare(`INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name`)
  .run(email.toLowerCase(), name, hashPassword(password));
console.log(`Admin ${email} saved (password set/reset).`);
