'use strict';
// Entry point. Vercel imports the exported Express app; `npm start` runs it as a normal server.
const cfg = require('./server/config');
const { createApp } = require('./server/app');

const app = createApp(cfg);
module.exports = app;

if (require.main === module) {
  const server = app.listen(cfg.port, () => console.log(`Arzon × Woxsen site on http://localhost:${cfg.port}  (admin: /admin)`));
  const stop = () => server.close(async () => { try { const db = await app.locals.getDb(); await db.close(); } catch (_) {} process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
