import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.guard';
import { AuthUser, contextFor } from '../auth/auth.types';
import { DB } from '../common/config';
import { NotFound } from '../common/errors';
import { audit } from '../common/journal';
import { ZodPipe } from '../common/zod.pipe';
import { Db, withContext } from '../db/client';
import { containers, exceptions, shipments } from '../db/schema';
import { ROLES, STAFF_ROLES } from '../domain/workflow';
import { EXCEPTION_TYPES, ExceptionType, openException } from './exceptions.repo';

const OpenBody = z.object({
  type: z.enum(Object.keys(EXCEPTION_TYPES) as [ExceptionType, ...ExceptionType[]]),
  containerId: z.string().uuid().optional(),
  reason: z.string().min(3).max(1000),
  nextAction: z.string().min(3).max(500),
  dueAt: z.coerce.date().optional(),
  ownerRole: z.enum(ROLES).optional(),
  clientVisible: z.boolean().default(false),
});
const ResolveBody = z.object({ resolution: z.string().min(3).max(1000) });
const ListQuery = z.object({
  status: z.enum(['open', 'resolved']).default('open'),
  ownerRole: z.enum(ROLES).optional(),
  shipmentId: z.string().uuid().optional(),
});

@Controller()
export class ExceptionsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The operations queue (US-05, AC-10): owner, reason, last event and next action. */
  @Roles(...STAFF_ROLES)
  @Get('exceptions')
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const where: SQL[] = [eq(exceptions.status, q.status)];
      if (q.ownerRole) where.push(eq(exceptions.ownerRole, q.ownerRole));
      if (q.shipmentId) where.push(eq(exceptions.shipmentId, q.shipmentId));
      if (user.role === 'clearing_agent') where.push(eq(shipments.assignedAgentUserId, user.id));
      return tx
        .select({
          exception: exceptions,
          shipmentReference: shipments.reference,
          containerNumber: containers.containerNumber,
          lastEventAt: containers.lastEventAt,
          journey: containers.journey,
        })
        .from(exceptions)
        .innerJoin(shipments, eq(shipments.id, exceptions.shipmentId))
        .leftJoin(containers, eq(containers.id, exceptions.containerId))
        .where(and(...where))
        .orderBy(desc(exceptions.openedAt))
        .limit(500);
    });
  }

  @Roles('ops_manager', 'documentation', 'clearing_agent', 'transport', 'finance', 'driver')
  @Post('shipments/:id/exceptions')
  open(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) shipmentId: string,
    @Body(new ZodPipe(OpenBody)) body: z.infer<typeof OpenBody>,
  ) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId));
      if (!shipment) throw new NotFound('Shipment');
      const ex = await openException(tx, {
        ...body,
        organizationId: shipment.organizationId,
        shipmentId,
        source: user.role === 'driver' ? 'driver' : 'staff',
        openedBy: user.id,
        dedupeKey: `manual:${shipmentId}:${Date.now()}:${user.id}`,
      });
      await audit(tx, { actorUserId: user.id, organizationId: shipment.organizationId, action: 'exception.open', entity: 'exception', entityId: ex!.id });
      return ex;
    });
  }

  @Roles('ops_manager', 'documentation', 'clearing_agent', 'transport', 'finance')
  @Post('exceptions/:id/resolve')
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ResolveBody)) body: z.infer<typeof ResolveBody>,
  ) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const [row] = await tx
        .update(exceptions)
        .set({ status: 'resolved', resolvedAt: new Date(), resolvedBy: user.id, resolution: body.resolution })
        .where(and(eq(exceptions.id, id), eq(exceptions.status, 'open')))
        .returning();
      if (!row) throw new NotFound('Open exception');
      await audit(tx, { actorUserId: user.id, organizationId: row.organizationId, action: 'exception.resolve', entity: 'exception', entityId: id });
      return row;
    });
  }
}
