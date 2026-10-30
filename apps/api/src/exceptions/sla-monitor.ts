// Periodic checks from FRS section 8. Each opens an exception with a dedupe key, so running
// the monitor every minute never opens the same exception twice. Thresholds come from the
// shipment's route, with the spec's suggested defaults when no route is set.

import { and, eq, isNull, lt } from 'drizzle-orm';
import { Db, SYSTEM, withContext } from '../db/client';
import { containers, invoices, routes, shipments, transportAssignments, assignmentContainers } from '../db/schema';
import { FinanceService } from '../finance/finance.service';
import { openException } from './exceptions.repo';

const HOUR = 3_600_000;
const DEFAULTS = { portProcessingHours: 96, silenceAlertHours: 24 };

export async function runSlaChecks(db: Db, now = new Date()) {
  return withContext(db, SYSTEM, async (tx) => {
    const opened: string[] = [];
    const rows = await tx
      .select({ c: containers, s: shipments, r: routes })
      .from(containers)
      .innerJoin(shipments, eq(shipments.id, containers.shipmentId))
      .leftJoin(routes, eq(routes.id, shipments.routeId))
      .where(isNull(shipments.closedAt));

    for (const { c, s, r } of rows) {
      const portHours = r?.portProcessingHours ?? DEFAULTS.portProcessingHours;
      const silenceHours = r?.silenceAlertHours ?? DEFAULTS.silenceAlertHours;

      if (['discharged', 'truck_assigned', 'loaded'].includes(c.journey) && c.dischargeAt) {
        const waited = now.getTime() - c.dischargeAt.getTime();
        if (waited > portHours * HOUR) {
          const ex = await openException(tx, {
            organizationId: c.organizationId,
            shipmentId: s.id,
            containerId: c.id,
            type: 'port_processing_overdue',
            reason: `${c.containerNumber} discharged ${Math.floor(waited / HOUR)} h ago; the estimate is ${portHours} h. Last step: ${c.journey.replace(/_/g, ' ')}.`,
            nextAction: s.customsStatus === 'released' ? 'Assign and dispatch a truck' : 'Chase customs release',
            dueAt: new Date(now.getTime() + 24 * HOUR),
            source: 'system',
            dedupeKey: `port:${c.id}`,
          });
          if (ex) opened.push(ex.id);
        }
      }

      // Silence is not a delay: the spec says not to label a shipment delayed without confirmation.
      if (['in_transit', 'at_border'].includes(c.journey) && c.lastEventAt) {
        const silent = now.getTime() - c.lastEventAt.getTime();
        if (silent > silenceHours * HOUR) {
          const [driver] = await tx
            .select({ name: transportAssignments.driverName, phone: transportAssignments.driverPhone })
            .from(assignmentContainers)
            .innerJoin(transportAssignments, eq(transportAssignments.id, assignmentContainers.assignmentId))
            .where(eq(assignmentContainers.containerId, c.id));
          const ex = await openException(tx, {
            organizationId: c.organizationId,
            shipmentId: s.id,
            containerId: c.id,
            type: 'transit_update_missing',
            reason: `No update on ${c.containerNumber} for ${Math.floor(silent / HOUR)} h.`,
            nextAction: driver ? `Call ${driver.name}${driver.phone ? ` on ${driver.phone}` : ''} for a position update` : 'Request an update from the transporter',
            dueAt: new Date(now.getTime() + 2 * HOUR),
            source: 'system',
            dedupeKey: `silence:${c.id}:${c.lastEventAt.getTime()}`,
          });
          if (ex) opened.push(ex.id);
        }
      }

      if (c.returnStatus === 'awaiting_return' && c.returnDueAt && c.returnDueAt < now) {
        await tx.update(containers).set({ returnStatus: 'return_overdue' }).where(eq(containers.id, c.id));
        const ex = await openException(tx, {
          organizationId: c.organizationId,
          shipmentId: s.id,
          containerId: c.id,
          type: 'container_return_overdue',
          reason: `${c.containerNumber} was due back at the depot on ${c.returnDueAt.toISOString().slice(0, 10)}. Demurrage or detention may apply.`,
          nextAction: 'Confirm the return with the transporter and tell the client',
          dueAt: new Date(now.getTime() + 24 * HOUR),
          source: 'system',
          clientVisible: true,
          dedupeKey: `return:${c.id}`,
        });
        if (ex) opened.push(ex.id);
      }
    }
    return opened;
  });
}

/** Sends at most one reminder per invoice and stage (AC-13). */
export async function runInvoiceReminders(db: Db, finance: FinanceService, now = new Date()) {
  return withContext(db, SYSTEM, async (tx) => {
    const open = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.status, 'issued'), eq(invoices.disputed, false), lt(invoices.issueDate, now)));
    const sent = [];
    for (const { id } of open) {
      const result = await finance.remind(tx, id, now);
      if (result.sent) sent.push({ id, stage: result.stage });
    }
    return sent;
  });
}

