import { sql } from 'drizzle-orm';
import { Tx } from '../db/client';
import { auditLog, outboxEvents } from '../db/schema';

export type OutboxKind =
  | 'shipment.registered'
  | 'milestone.recorded'
  | 'eta.revised'
  | 'invoice.issued'
  | 'payment.verified'
  | 'invoice.reminder'
  | 'shipment.closed';

/** Called inside the same transaction as the change, so the change and its messages commit together. */
export async function enqueue(tx: Tx, organizationId: string, kind: OutboxKind, payload: Record<string, unknown>) {
  await tx.insert(outboxEvents).values({ organizationId, kind, payload });
}

export async function audit(
  tx: Tx,
  entry: { actorUserId?: string | null; organizationId?: string | null; action: string; entity: string; entityId: string; details?: Record<string, unknown> },
) {
  await tx.insert(auditLog).values({ ...entry, details: entry.details ?? {} });
}

/** Next number in a named sequence, e.g. shipment references per year. */
export async function nextNumber(tx: Tx, name: string, start: number): Promise<number> {
  const result = await tx.execute<{ value: number }>(
    // Raw SQL keeps the increment atomic under concurrent requests.
    sql`insert into sequences (name, value) values (${name}, ${start})
      on conflict (name) do update set value = sequences.value + 1 returning value`,
  );
  return Number(result.rows[0].value);
}
