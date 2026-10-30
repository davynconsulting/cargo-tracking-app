import { and, eq, inArray, SQL } from 'drizzle-orm';
import { Tx } from '../db/client';
import { exceptions } from '../db/schema';
import { EXCEPTION_TYPES, ExceptionType } from '../domain/exceptions';
import { Role } from '../domain/workflow';

export { EXCEPTION_TYPES, ExceptionType };


/** Opens an exception unless one with the same dedupe key already exists. */
export async function openException(
  tx: Tx,
  input: {
    organizationId: string;
    shipmentId: string;
    containerId?: string | null;
    type: ExceptionType;
    reason: string;
    nextAction: string;
    dueAt?: Date | null;
    ownerRole?: Role;
    source: 'system' | 'staff' | 'driver';
    openedBy?: string | null;
    clientVisible?: boolean;
    dedupeKey?: string;
  },
) {
  const [row] = await tx
    .insert(exceptions)
    .values({ ...input, ownerRole: input.ownerRole ?? EXCEPTION_TYPES[input.type].owner })
    .onConflictDoNothing({ target: exceptions.dedupeKey })
    .returning();
  return row ?? null;
}

/** Resolves open exceptions of the given types once the condition behind them clears. */
export async function resolveExceptions(
  tx: Tx,
  where: { shipmentId: string; containerId?: string; types: ExceptionType[] },
  resolution: string,
  userId?: string | null,
) {
  const conditions: SQL[] = [
    eq(exceptions.shipmentId, where.shipmentId),
    eq(exceptions.status, 'open'),
    inArray(exceptions.type, where.types),
  ];
  if (where.containerId) conditions.push(eq(exceptions.containerId, where.containerId));
  await tx
    .update(exceptions)
    .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: userId ?? null, resolution })
    .where(and(...conditions));
}

