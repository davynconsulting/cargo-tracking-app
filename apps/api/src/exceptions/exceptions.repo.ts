import { and, eq, inArray, SQL } from 'drizzle-orm';
import { Tx } from '../db/client';
import { exceptions } from '../db/schema';
import { Role } from '../domain/workflow';

export const EXCEPTION_TYPES = {
  missing_document: { label: 'Missing or rejected document', owner: 'documentation' },
  customs_hold: { label: 'Customs hold', owner: 'clearing_agent' },
  port_processing_overdue: { label: 'Port processing over estimate', owner: 'ops_manager' },
  transit_update_missing: { label: 'Transit update missing', owner: 'transport' },
  container_return_overdue: { label: 'Empty return overdue', owner: 'ops_manager' },
  notification_failure: { label: 'Message not delivered', owner: 'ops_manager' },
  delay: { label: 'Delay', owner: 'ops_manager' },
  delivery_discrepancy: { label: 'Delivery discrepancy or damaged seal', owner: 'ops_manager' },
  truck_unavailable: { label: 'Truck unavailable or loading missed', owner: 'transport' },
  payment_dispute: { label: 'Payment disputed', owner: 'finance' },
  other: { label: 'Other', owner: 'ops_manager' },
} satisfies Record<string, { label: string; owner: Role }>;
export type ExceptionType = keyof typeof EXCEPTION_TYPES;

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

