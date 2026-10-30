import 'reflect-metadata';
import { createApp } from './bootstrap';
import { loadConfig } from './common/config';
import { createDb } from './db/client';

async function main() {
  const config = loadConfig();
  const { db } = createDb(config.appDatabaseUrl);
  const app = await createApp(config, db);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API on http://localhost:${port} (OpenAPI at /docs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
