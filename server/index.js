'use strict';
const cfg = require('./config');
const { createApp } = require('./app');

const app = createApp(cfg);
const server = app.listen(cfg.port, () => console.log(`Arzon × Woxsen site on http://localhost:${cfg.port}  (admin: /admin)`));

const stop = () => { server.close(() => { try { app.locals.db.close(); } catch (_) {} process.exit(0); }); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
