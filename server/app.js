'use strict';
const path = require('node:path');
const express = require('express');
const { open } = require('./db');
const { securityHeaders, sameOrigin, hashPassword } = require('./lib/security');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

function createApp(cfg) {
  const db = open(cfg.dbFile);

  // First boot: create the initial admin from ADMIN_EMAIL / ADMIN_PASSWORD if there are none.
  if (cfg.adminEmail && cfg.adminPassword && db.prepare('SELECT COUNT(*) AS n FROM admins').get().n === 0) {
    db.prepare('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)').run(cfg.adminEmail.toLowerCase(), 'Admin', hashPassword(cfg.adminPassword));
    console.log(`[setup] created admin ${cfg.adminEmail}`);
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);
  app.use(securityHeaders);
  app.use('/api', express.json({ limit: '200kb' }), sameOrigin);

  app.use(publicRoutes(db, cfg));
  app.use('/api/admin', adminRoutes(db, cfg));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  const pub = path.join(__dirname, '..', 'public');
  app.get(['/admin', '/admin/'], (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(pub, 'admin', 'index.html')));
  app.use(express.static(pub, { maxAge: cfg.prod ? '1h' : 0, index: 'index.html' }));
  app.use((req, res) => res.status(404).sendFile(path.join(pub, 'index.html'))); // SPA uses #/ routes; unknown paths go home

  // JSON errors (e.g. malformed body)
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
