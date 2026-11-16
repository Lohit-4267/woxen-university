'use strict';
const path = require('node:path');
const express = require('express');
const { open } = require('./db');
const { securityHeaders, sameOrigin, hashPassword } = require('./lib/security');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

function createApp(cfg) {
  // Connect lazily on the first request (serverless-friendly); the promise is shared, and retried after a failure.
  let dbPromise = null;
  const getDb = () => {
    if (!dbPromise) {
      dbPromise = (async () => {
        const db = await open(cfg);
        // First boot: create the initial admin from ADMIN_EMAIL / ADMIN_PASSWORD if there are none.
        if (cfg.adminEmail && cfg.adminPassword) {
          const { n } = await db.one('SELECT COUNT(*)::int AS n FROM admins');
          if (n === 0) {
            await db.query('INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
              [cfg.adminEmail.toLowerCase(), 'Admin', hashPassword(cfg.adminPassword)]);
            console.log(`[setup] created admin ${cfg.adminEmail}`);
          }
        }
        return db;
      })();
      dbPromise.catch(e => { console.error('[db] init failed:', e.message); dbPromise = null; });
    }
    return dbPromise;
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);
  app.use(securityHeaders);
  app.use('/api', express.json({ limit: '200kb' }), sameOrigin);

  app.use(publicRoutes(getDb, cfg));
  app.use('/api/admin', adminRoutes(getDb, cfg));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  const pub = path.join(__dirname, '..', 'public');
  app.get(['/admin', '/admin/'], (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(pub, 'admin', 'index.html')));
  app.use(express.static(pub, { maxAge: cfg.prod ? '1h' : 0, index: 'index.html' }));
  app.use((req, res) => res.status(404).sendFile(path.join(pub, 'index.html'))); // SPA uses #/ routes; unknown paths go home

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  });

  app.locals.getDb = getDb;
  return app;
}

module.exports = { createApp };
