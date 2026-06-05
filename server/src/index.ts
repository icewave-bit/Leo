import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { closePool } from './db.js';
import { runMigrations } from './migrate.js';

async function main() {
  const config = loadConfig();
  await runMigrations(config.DATABASE_URL);
  const app = await createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`Server listening on port ${config.PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
