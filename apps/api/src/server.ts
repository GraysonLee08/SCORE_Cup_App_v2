import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
const app = createApp(config, db);

const server = app.listen(config.PORT, () => {
  console.log(`API listening on :${config.PORT} (${config.NODE_ENV})`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down.`);
    server.close(() => {
      void db.end().then(() => process.exit(0));
    });
  });
}
