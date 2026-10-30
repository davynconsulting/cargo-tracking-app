import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbContext {
  kind: 'staff' | 'client' | 'driver' | 'system';
  userId?: string;
  orgId?: string | null;
}

export function createDb(url: string): { pool: Pool; db: Db } {
  const pool = new Pool({ connectionString: url, max: 10 });
  // An idle client can be dropped by the server (restart, failover); without a listener that crashes the process.
  pool.on('error', (err) => console.error('Idle database connection closed', err.message));
  return { pool, db: drizzle(pool, { schema, casing: 'snake_case' }) };
}

/**
 * Runs `fn` in one transaction with the caller's identity set for row-level security.
 * Every read and write in a request goes through here, so a query that forgets a
 * tenant filter still cannot cross into another client's rows.
 */
export async function withContext<T>(db: Db, ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_kind', ${ctx.kind}, true),
                 set_config('app.user_id', ${ctx.userId ?? ''}, true),
                 set_config('app.org_id', ${ctx.orgId ?? ''}, true)`,
    );
    return fn(tx);
  });
}

export const SYSTEM: DbContext = { kind: 'system' };
