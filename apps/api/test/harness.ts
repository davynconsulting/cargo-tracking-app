import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { createDb, Db } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { seed, SEED_PASSWORD } from '../src/db/seed';
import { FileStore } from '../src/documents/storage';
import { LogSender } from '../src/notifications/senders';

/** Integration tests need a PostgreSQL superuser URL, e.g. postgres://postgres:postgres@localhost:5432/postgres */
export const ADMIN_URL = process.env.TEST_DATABASE_URL;
export const describeDb = ADMIN_URL ? describe : describe.skip;

class MemoryFileStore implements FileStore {
  private files = new Map<string, Buffer>();
  async put(content: Buffer) {
    const key = randomUUID();
    this.files.set(key, content);
    return { key, sha256: 'test' };
  }
  async get(key: string) {
    return this.files.get(key)!;
  }
}

function withPath(url: string, database: string, user?: string, password?: string) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (user) {
    u.username = user;
    u.password = password ?? '';
  }
  return u.toString();
}

export interface Harness {
  app: INestApplication;
  http: ReturnType<typeof request>;
  ownerDb: Db;
  appDb: Db;
  sender: LogSender;
  data: Awaited<ReturnType<typeof seed>>;
  token(email: string): Promise<string>;
  close(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const name = `ngb_it_${randomUUID().slice(0, 8)}`;
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(`create database ${name}`);
  const ownerUrl = withPath(ADMIN_URL!, name);
  await runMigrations(ownerUrl);
  const owner = createDb(ownerUrl);
  await owner.db.execute(sql`alter role ngb_app password 'ngb_app'`);
  const appConn = createDb(withPath(ADMIN_URL!, name, 'ngb_app', 'ngb_app'));
  const data = await seed(owner.db, appConn.db);

  const app = await createApp(
    { appDatabaseUrl: '', jwtSecret: 'test-secret-at-least-16', fileStorageDir: '', simulateWhatsappOutage: false },
    appConn.db,
    new MemoryFileStore(),
  );
  await app.init();
  const http = request(app.getHttpServer());
  const tokens = new Map<string, string>();

  return {
    app,
    http,
    ownerDb: owner.db,
    appDb: appConn.db,
    sender: new LogSender({ quiet: true }),
    data,
    async token(email) {
      if (!tokens.has(email)) {
        const res = await http.post('/auth/login').send({ email, password: SEED_PASSWORD }).expect(201);
        tokens.set(email, res.body.token);
      }
      return tokens.get(email)!;
    },
    async close() {
      await app.close();
      await appConn.pool.end();
      await owner.pool.end();
      await admin.query(`drop database ${name}`).catch(() => admin.query(`drop database ${name} with (force)`));
      await admin.end();
    },
  };
}
