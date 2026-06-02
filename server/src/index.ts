import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { closePool } from './db.js';

async function main() {
  const config = loadConfig();
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
