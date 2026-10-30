import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

/** Runs migrations as the owner role. The app role never has DDL rights. */
export async function runMigrations(url: string): Promise<void> {
  const { pool, db } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  runMigrations(url)
    .then(() => console.log('Migrations applied'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
