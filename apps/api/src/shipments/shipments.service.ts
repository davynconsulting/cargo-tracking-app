import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { AuthUser, contextFor } from '../auth/auth.types';
import { DB } from '../common/config';
import { isUniqueViolation, NotFound, RuleViolation } from '../common/errors';
import { audit, enqueue, nextNumber } from '../common/journal';
import { Db, Tx, withContext } from '../db/client';
import {
  assignmentContainers,
  containers,
  documents,
  etaRevisions,
  exceptions,
  invoiceShipments,
  milestoneEvents,
  organizations,
  routes,
  shipments,
  transportAssignments,
  users,
} from '../db/schema';
import { checkContainerNumber } from '../domain/container-number';
import { isMaterialEtaChange } from '../domain/eta';
import {
  applyTransition,
  closureChecks,
  ContainerState,
  deriveOverallStatus,
  MILESTONE_TYPES,
  MILESTONES,
  MilestoneDef,
  MilestoneType,
  planTransition,
  Role,
  ShipmentState,
} from '../domain/workflow';
import { openException, resolveExceptions } from '../exceptions/exceptions.repo';
import { invoiceSettled } from '../finance/finance.repo';
import {
  AssignTruckBody,
  CloseShipmentBody,
  CorrectEventBody,
  CreateShipmentBody,
  RecordMilestoneBody,
  ReviseEtaBody,
} from './shipments.schemas';

type ShipmentRow = typeof shipments.$inferSelect;
type ContainerRow = typeof containers.$inferSelect;
type EventRow = typeof milestoneEvents.$inferSelect;

const FUTURE_TOLERANCE_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

/** Container timestamp columns kept in step with the ledger. */
const CONTAINER_TIME_FIELD: Partial<Record<MilestoneType, 'dischargeAt' | 'gateOutAt' | 'deliveryAt' | 'emptyReturnAt'>> = {
  discharged: 'dischargeAt',
  gate_out: 'gateOutAt',
  delivered: 'deliveryAt',
  empty_returned: 'emptyReturnAt',
};

/** Exceptions that clear on their own when the matching milestone is recorded. */
const AUTO_RESOLVE: Partial<Record<MilestoneType, Parameters<typeof resolveExceptions>[1]['types']>> = {
  documents_complete: ['missing_document'],
  customs_released: ['customs_hold'],
  gate_out: ['port_processing_overdue'],
  empty_returned: ['container_return_overdue'],
};

const shipmentState = (s: ShipmentRow): ShipmentState => ({
  docsStatus: s.docsStatus as ShipmentState['docsStatus'],
  customsStatus: s.customsStatus as ShipmentState['customsStatus'],
  vesselArrivedAt: s.vesselArrivedAt,
  closedAt: s.closedAt,
});

const containerState = (c: ContainerRow): ContainerState => ({
  journey: c.journey as ContainerState['journey'],
  returnStatus: c.returnStatus as ContainerState['returnStatus'],
});

@Injectable()
export class ShipmentsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ---------- Registration ----------

  async create(user: AuthUser, body: CreateShipmentBody) {
    const problems: string[] = [];
    const numbers = body.containers.map((c) => checkContainerNumber(c.containerNumber));
    numbers.forEach((n, i) => {
      if (!n.valid) problems.push(`Container ${i + 1} (${n.value}): ${n.reason}`);
    });
    const seen = new Set<string>();
    numbers.forEach((n) => {
      if (seen.has(n.value)) problems.push(`Container ${n.value} is listed twice.`);
      seen.add(n.value);
    });
    if (problems.length) throw new RuleViolation('invalid_containers', 'Some container numbers are invalid.', { problems });

    return withContext(this.db, contextFor(user), async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, body.organizationId));
      if (!org) throw new NotFound('Client');

      const active = await tx
        .select({ number: containers.containerNumber, reference: shipments.reference })
        .from(containers)
        .innerJoin(shipments, eq(shipments.id, containers.shipmentId))
        .where(and(inArray(containers.containerNumber, [...seen]), sql`${shipments.closedAt} is null`));
      if (active.length) {
        throw new RuleViolation('container_in_use', 'A container is already on an open shipment.', {
          problems: active.map((a) => `${a.number} is on ${a.reference}.`),
        });
      }

      let routeId: string | null = null;
      if (body.routeCode) {
        const [route] = await tx.select().from(routes).where(eq(routes.code, body.routeCode));
        if (!route) throw new RuleViolation('unknown_route', `No route with code ${body.routeCode}.`);
        routeId = route.id;
      }

      const year = new Date().getUTCFullYear();
      const n = await nextNumber(tx, `shipment:${year}`, 1);
      const reference = `NGB-${year}-${String(n).padStart(5, '0')}`;
      const { containers: containerInput, routeCode: _route, grossWeightKg, ...fields } = body;

      let shipment: ShipmentRow;
      try {
        [shipment] = await tx
          .insert(shipments)
          .values({
            ...fields,
            grossWeightKg: grossWeightKg?.toFixed(2),
            reference,
            routeId,
            docsStatus: body.blNumber ? 'received' : 'missing',
            etaUpdatedAt: body.currentEta ? new Date() : null,
            etaReason: body.currentEta ? 'Initial estimate' : null,
            assignedOpsUserId: user.role === 'ops_manager' ? user.id : null,
            createdBy: user.id,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw new RuleViolation('duplicate_bl', 'A shipment with this BL number already exists.');
        throw err;
      }

      const created = await tx
        .insert(containers)
        .values(
          containerInput.map((c, i) => ({
            organizationId: org.id,
            shipmentId: shipment.id,
            containerNumber: numbers[i].value,
            sizeType: c.sizeType,
            freeDays: c.freeDays,
          })),
        )
        .returning();

      const [event] = await tx
        .insert(milestoneEvents)
        .values({
          organizationId: org.id,
          shipmentId: shipment.id,
          milestoneType: 'shipment_registered',
          newStatus: 'registered',
          eventAt: new Date(),
          recordedBy: user.id,
          source: 'staff',
          idempotencyKey: `registered:${shipment.id}`,
        })
        .returning();
      await enqueue(tx, org.id, 'shipment.registered', { shipmentId: shipment.id, eventId: event.id });
      await audit(tx, { actorUserId: user.id, organizationId: org.id, action: 'shipment.create', entity: 'shipment', entityId: shipment.id });
      return { ...shipment, containers: created };
    });
  }

  // ---------- Reading ----------

  async list(user: AuthUser, filter: { status?: 'open' | 'closed' }) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const conditions = [];
      if (filter.status === 'open') conditions.push(sql`${shipments.closedAt} is null`);
      if (filter.status === 'closed') conditions.push(sql`${shipments.closedAt} is not null`);
      if (user.role === 'clearing_agent') conditions.push(eq(shipments.assignedAgentUserId, user.id));

      const rows = await tx
        .select({ shipment: shipments, clientName: organizations.legalName, clientCode: organizations.clientCode })
        .from(shipments)
        .innerJoin(organizations, eq(organizations.id, shipments.organizationId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(shipments.createdAt))
        .limit(200);
      if (!rows.length) return [];

      const ids = rows.map((r) => r.shipment.id);
      const allContainers = await tx.select().from(containers).where(inArray(containers.shipmentId, ids));
      const openCounts = await tx
        .select({ shipmentId: exceptions.shipmentId, n: sql<number>`count(*)::int` })
        .from(exceptions)
        .where(
          and(
            inArray(exceptions.shipmentId, ids),
            eq(exceptions.status, 'open'),
            user.role === 'client' ? eq(exceptions.clientVisible, true) : undefined,
          ),
        )
        .groupBy(exceptions.shipmentId);

      return rows.map(({ shipment, clientName, clientCode }) => {
        const own = allContainers.filter((c) => c.shipmentId === shipment.id);
        return {
          id: shipment.id,
          reference: shipment.reference,
          client: { id: shipment.organizationId, name: clientName, code: clientCode },
          origin: shipment.originPort,
          destination: `${shipment.destinationCity}, ${shipment.destinationCountry}`,
          docsStatus: shipment.docsStatus,
          customsStatus: shipment.customsStatus,
          currentEta: shipment.currentEta,
          overall: deriveOverallStatus(shipmentState(shipment), own.map(containerState)),
          containers: own.map((c) => ({ id: c.id, containerNumber: c.containerNumber, journey: c.journey, returnStatus: c.returnStatus })),
          openExceptions: openCounts.find((o) => o.shipmentId === shipment.id)?.n ?? 0,
          closedAt: shipment.closedAt,
        };
      });
    });
  }

  async get(user: AuthUser, id: string) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const shipment = await this.loadShipment(tx, user, id);
      const isClient = user.role === 'client';
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, shipment.organizationId));
      const ctrs = await tx.select().from(containers).where(eq(containers.shipmentId, id)).orderBy(asc(containers.containerNumber));

      const assignments = await tx
        .select({ link: assignmentContainers, a: transportAssignments })
        .from(assignmentContainers)
        .innerJoin(transportAssignments, eq(transportAssignments.id, assignmentContainers.assignmentId))
        .where(and(eq(transportAssignments.shipmentId, id), sql`${transportAssignments.status} <> 'cancelled'`));

      const events = await tx
        .select({ e: milestoneEvents, byName: users.name })
        .from(milestoneEvents)
        .leftJoin(users, eq(users.id, milestoneEvents.recordedBy))
        .where(and(eq(milestoneEvents.shipmentId, id), isClient ? eq(milestoneEvents.visibility, 'client') : undefined))
        .orderBy(desc(milestoneEvents.eventAt), desc(milestoneEvents.recordedAt));
      const correctedIds = new Set(events.map(({ e }) => e.correctionOfEventId).filter(Boolean));

      const exc = await tx
        .select()
        .from(exceptions)
        .where(and(eq(exceptions.shipmentId, id), isClient ? eq(exceptions.clientVisible, true) : undefined))
        .orderBy(desc(exceptions.openedAt));
      const etaHistory = await tx
        .select()
        .from(etaRevisions)
        .where(and(eq(etaRevisions.shipmentId, id), isClient ? eq(etaRevisions.material, true) : undefined))
        .orderBy(desc(etaRevisions.revisedAt));
      const docs = await tx
        .select({
          id: documents.id,
          documentType: documents.documentType,
          fileName: documents.fileName,
          sizeBytes: documents.sizeBytes,
          uploadedAt: documents.uploadedAt,
          verificationStatus: documents.verificationStatus,
          clientVisible: documents.clientVisible,
          version: documents.version,
        })
        .from(documents)
        .where(and(eq(documents.shipmentId, id), isClient ? eq(documents.clientVisible, true) : undefined))
        .orderBy(desc(documents.uploadedAt));

      const sState = shipmentState(shipment);
      return {
        ...(isClient ? this.clientShipmentFields(shipment) : shipment),
        client: { id: org.id, name: org.legalName, code: org.clientCode, timezone: org.timezone },
        overall: deriveOverallStatus(sState, ctrs.map(containerState)),
        actions: isClient ? [] : this.allowedActions(user.role, sState),
        containers: ctrs.map((c) => {
          const a = assignments.find((x) => x.link.containerId === c.id)?.a;
          return {
            ...c,
            assignment: a
              ? isClient
                ? { truckRegistration: a.truckRegistration }
                : {
                    id: a.id,
                    truckRegistration: a.truckRegistration,
                    trailerRegistration: a.trailerRegistration,
                    driverName: a.driverName,
                    driverPhone: a.driverPhone,
                    driverUserId: a.driverUserId,
                    transporterName: a.transporterName,
                  }
              : null,
            actions: isClient ? [] : this.allowedActions(user.role, sState, containerState(c)),
          };
        }),
        events: events.map(({ e, byName }) => (isClient ? this.clientEvent(e) : { ...e, recordedByName: byName, corrected: correctedIds.has(e.id) })),
        exceptions: exc.map((x) => (isClient ? { id: x.id, type: x.type, reason: x.reason, status: x.status, openedAt: x.openedAt } : x)),
        etaHistory: etaHistory.map((r) => (isClient ? { previousEta: r.previousEta, newEta: r.newEta, reason: r.reason, revisedAt: r.revisedAt } : r)),
        documents: docs,
      };
    });
  }

  // ---------- Milestones ----------

  async recordMilestone(user: AuthUser, shipmentId: string, body: RecordMilestoneBody) {
    if (body.type === 'truck_assigned') {
      throw new RuleViolation('use_assignment', 'Assign trucks through the truck assignment endpoint.');
    }
    const def: MilestoneDef = MILESTONES[body.type];
    const eventAt = body.eventAt ?? new Date();
    if (eventAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new RuleViolation('future_event', 'The event time cannot be in the future.');
    }
    if (body.type === 'border_crossed' && !body.data.border) {
      throw new RuleViolation('missing_field', 'Say which border was crossed (data.border).');
    }

    try {
      return await withContext(this.db, contextFor(user), async (tx) => {
        const existing = await this.findByIdempotencyKey(tx, body.idempotencyKey);
        if (existing) return { event: existing, duplicate: true };

        const shipment = await this.loadShipment(tx, user, shipmentId, true);
        let container: ContainerRow | undefined;
        if (def.scope === 'container') {
          if (!body.containerId) throw new RuleViolation('scope', `"${def.label}" must name a container.`);
          [container] = await tx
            .select()
            .from(containers)
            .where(and(eq(containers.id, body.containerId), eq(containers.shipmentId, shipmentId)))
            .for('update');
          if (!container) throw new NotFound('Container');
        }
        await this.checkAssignment(tx, user, shipment, container);

        const plan = planTransition({
          type: body.type,
          role: user.role,
          shipment: shipmentState(shipment),
          container: container && containerState(container),
          overrideReason: body.overrideReason,
        });
        if (!plan.ok) {
          if (plan.code === 'forbidden') throw new ForbiddenException({ code: 'forbidden', message: plan.message });
          throw new RuleViolation(plan.code, plan.message, { overridable: plan.overridable ?? false });
        }

        const event = await this.writeEvent(tx, user, shipment, container, body.type, plan, eventAt, {
          location: body.location,
          notes: body.notes,
          reasonCode: body.reasonCode,
          data: body.data,
          evidenceDocumentIds: body.evidenceDocumentIds,
          visibility: body.visibility,
          idempotencyKey: body.idempotencyKey,
          overrideReason: plan.overridden ? body.overrideReason!.trim() : null,
        });
        return { event, duplicate: false };
      });
    } catch (err) {
      // Two identical submissions raced; the loser returns the winner's event.
      if (isUniqueViolation(err)) {
        const existing = await withContext(this.db, contextFor(user), (tx) => this.findByIdempotencyKey(tx, body.idempotencyKey));
        if (existing) return { event: existing, duplicate: true };
      }
      throw err;
    }
  }

  async assignTruck(user: AuthUser, shipmentId: string, body: AssignTruckBody) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const already = await this.findByIdempotencyKey(tx, `${body.idempotencyKey}:${body.containerIds[0]}`);
      if (already) return { duplicate: true, events: [already] };

      const shipment = await this.loadShipment(tx, user, shipmentId, true);
      const ctrs = await tx
        .select()
        .from(containers)
        .where(and(inArray(containers.id, body.containerIds), eq(containers.shipmentId, shipmentId)))
        .for('update');
      if (ctrs.length !== body.containerIds.length) throw new NotFound('Container');

      if (body.driverUserId) {
        const [driver] = await tx.select().from(users).where(eq(users.id, body.driverUserId));
        if (!driver || driver.role !== 'driver') throw new RuleViolation('invalid_driver', 'That user is not a driver.');
      }

      const plans = ctrs.map((c) => ({
        c,
        plan: planTransition({ type: 'truck_assigned', role: user.role, shipment: shipmentState(shipment), container: containerState(c) }),
      }));
      const failed = plans.find((p) => !p.plan.ok);
      if (failed && !failed.plan.ok) {
        if (failed.plan.code === 'forbidden') throw new ForbiddenException({ code: 'forbidden', message: failed.plan.message });
        throw new RuleViolation(failed.plan.code, `${failed.c.containerNumber}: ${failed.plan.message}`);
      }

      const { containerIds, idempotencyKey, ...fields } = body;
      const [assignment] = await tx
        .insert(transportAssignments)
        .values({ ...fields, organizationId: shipment.organizationId, shipmentId, assignedBy: user.id })
        .returning();
      await tx
        .insert(assignmentContainers)
        .values(ctrs.map((c) => ({ assignmentId: assignment.id, containerId: c.id, organizationId: shipment.organizationId })));

      const events: EventRow[] = [];
      for (const { c, plan } of plans) {
        if (!plan.ok) continue;
        events.push(
          await this.writeEvent(tx, user, shipment, c, 'truck_assigned', plan, new Date(), {
            data: {
              assignmentId: assignment.id,
              truckRegistration: body.truckRegistration,
              driverName: body.driverName,
              ...(body.driverPhone ? { driverPhone: body.driverPhone } : {}),
            },
            visibility: 'client',
            idempotencyKey: `${idempotencyKey}:${c.id}`,
            evidenceDocumentIds: [],
          }),
        );
      }
      return { duplicate: false, assignment, events };
    });
  }

  async reviseEta(user: AuthUser, shipmentId: string, body: ReviseEtaBody) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const shipment = await this.loadShipment(tx, user, shipmentId, true);
      if (shipment.closedAt) throw new RuleViolation('closed', 'The shipment is closed.');
      const now = new Date();
      const check = isMaterialEtaChange(shipment.currentEta, body.eta, now);
      const [revision] = await tx
        .insert(etaRevisions)
        .values({
          organizationId: shipment.organizationId,
          shipmentId,
          previousEta: shipment.currentEta,
          newEta: body.eta,
          reason: body.reason,
          notes: body.notes,
          material: check.material,
          revisedBy: user.id,
        })
        .returning();
      await tx
        .update(shipments)
        .set({ currentEta: body.eta, etaUpdatedAt: now, etaReason: body.reason, updatedAt: now })
        .where(eq(shipments.id, shipmentId));
      await tx.insert(milestoneEvents).values({
        organizationId: shipment.organizationId,
        shipmentId,
        milestoneType: 'eta_revised',
        previousStatus: shipment.currentEta?.toISOString() ?? null,
        newStatus: body.eta.toISOString(),
        eventAt: now,
        recordedBy: user.id,
        source: 'staff',
        notes: body.notes,
        reasonCode: body.reason,
        data: { material: check.material, deltaHours: Math.round(check.deltaHours * 10) / 10, thresholdHours: check.thresholdHours },
        visibility: check.material ? 'client' : 'internal',
        idempotencyKey: `eta:${revision.id}`,
      });
      if (check.material) await enqueue(tx, shipment.organizationId, 'eta.revised', { revisionId: revision.id });
      return { revision, notified: check.material, ...check };
    });
  }

  /** Appends a correction; the original row is never changed (FRS 4.2, AC-03). */
  async correctEvent(user: AuthUser, eventId: string, body: CorrectEventBody) {
    if (body.eventAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new RuleViolation('future_event', 'The event time cannot be in the future.');
    }
    return withContext(this.db, contextFor(user), async (tx) => {
      const [original] = await tx.select().from(milestoneEvents).where(eq(milestoneEvents.id, eventId));
      if (!original) throw new NotFound('Event');
      if (original.milestoneType === 'correction') throw new RuleViolation('invalid_correction', 'Correct the original event, not a correction.');
      const [correction] = await tx
        .insert(milestoneEvents)
        .values({
          organizationId: original.organizationId,
          shipmentId: original.shipmentId,
          containerId: original.containerId,
          milestoneType: 'correction',
          previousStatus: original.eventAt.toISOString(),
          newStatus: body.eventAt.toISOString(),
          eventAt: body.eventAt,
          recordedBy: user.id,
          source: 'staff',
          notes: body.reason,
          data: { correctsType: original.milestoneType },
          visibility: original.visibility,
          correctionOfEventId: original.id,
          idempotencyKey: `correction:${original.id}:${body.eventAt.toISOString()}`,
        })
        .returning();

      const field = CONTAINER_TIME_FIELD[original.milestoneType as MilestoneType];
      if (field && original.containerId) {
        const [c] = await tx.select().from(containers).where(eq(containers.id, original.containerId));
        if (c && c[field]?.getTime() === original.eventAt.getTime()) {
          await tx.update(containers).set({ [field]: body.eventAt }).where(eq(containers.id, c.id));
        }
      }
      await audit(tx, {
        actorUserId: user.id,
        organizationId: original.organizationId,
        action: 'event.correct',
        entity: 'milestone_event',
        entityId: original.id,
        details: { from: original.eventAt, to: body.eventAt, reason: body.reason },
      });
      return correction;
    });
  }

  // ---------- Closure ----------

  async close(user: AuthUser, shipmentId: string, body: CloseShipmentBody) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const shipment = await this.loadShipment(tx, user, shipmentId, true);
      if (shipment.closedAt) throw new RuleViolation('closed', 'The shipment is already closed.');
      const ctrs = await tx.select().from(containers).where(eq(containers.shipmentId, shipmentId));
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(exceptions)
        .where(and(eq(exceptions.shipmentId, shipmentId), eq(exceptions.status, 'open')));
      const invoiceIds = (await tx.select().from(invoiceShipments).where(eq(invoiceShipments.shipmentId, shipmentId))).map((r) => r.invoiceId);
      const financeSettled = invoiceIds.length > 0 && (await Promise.all(invoiceIds.map((i) => invoiceSettled(tx, i)))).every(Boolean);

      const checks = closureChecks({ containers: ctrs.map(containerState), openExceptions: n, financeSettled });
      const failing = checks.filter((c) => !c.passed);
      if (failing.length && !body.overrideReason?.trim()) {
        throw new RuleViolation('closure_blocked', 'The shipment cannot close yet.', { checks, overridable: true });
      }
      const now = new Date();
      const closeReason = failing.length ? `Approved exception: ${body.overrideReason!.trim()}` : 'All closure checks passed';
      await tx.update(shipments).set({ closedAt: now, closeReason, updatedAt: now }).where(eq(shipments.id, shipmentId));
      const [event] = await tx
        .insert(milestoneEvents)
        .values({
          organizationId: shipment.organizationId,
          shipmentId,
          milestoneType: 'shipment_closed',
          newStatus: 'closed',
          eventAt: now,
          recordedBy: user.id,
          source: 'staff',
          overrideReason: failing.length ? body.overrideReason!.trim() : null,
          data: { failedChecks: failing.map((f) => f.key) },
          idempotencyKey: `closed:${shipmentId}:${now.getTime()}`,
        })
        .returning();
      await enqueue(tx, shipment.organizationId, 'shipment.closed', { shipmentId, eventId: event.id });
      await audit(tx, { actorUserId: user.id, organizationId: shipment.organizationId, action: 'shipment.close', entity: 'shipment', entityId: shipmentId, details: { checks, closeReason } });
      return { closedAt: now, checks, closeReason };
    });
  }

  // ---------- Driver ----------

  async driverJobs(user: AuthUser) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const rows = await tx
        .select({ a: transportAssignments, c: containers, s: shipments })
        .from(transportAssignments)
        .innerJoin(assignmentContainers, eq(assignmentContainers.assignmentId, transportAssignments.id))
        .innerJoin(containers, eq(containers.id, assignmentContainers.containerId))
        .innerJoin(shipments, eq(shipments.id, transportAssignments.shipmentId))
        .where(and(eq(transportAssignments.driverUserId, user.id), sql`${transportAssignments.status} <> 'cancelled'`, sql`${shipments.closedAt} is null`))
        .orderBy(desc(transportAssignments.assignedAt));
      return rows.map(({ a, c, s }) => ({
        shipmentId: s.id,
        reference: s.reference,
        origin: s.originPort,
        destination: `${s.destinationCity}, ${s.destinationCountry}`,
        deliveryAddress: s.deliveryAddress,
        truckRegistration: a.truckRegistration,
        borderCrossing: a.borderCrossing,
        container: { id: c.id, containerNumber: c.containerNumber, journey: c.journey, returnStatus: c.returnStatus, sealNumber: c.sealNumber },
        actions: this.allowedActions('driver', shipmentState(s), containerState(c)),
      }));
    });
  }

  // ---------- Internals ----------

  private async writeEvent(
    tx: Tx,
    user: AuthUser,
    shipment: ShipmentRow,
    container: ContainerRow | undefined,
    type: MilestoneType,
    plan: { from: string; to: string; overridden: boolean },
    eventAt: Date,
    extra: {
      location?: string;
      notes?: string;
      reasonCode?: string;
      data: Record<string, unknown>;
      evidenceDocumentIds: string[];
      visibility: 'client' | 'internal';
      idempotencyKey: string;
      overrideReason?: string | null;
    },
  ): Promise<EventRow> {
    const def: MilestoneDef = MILESTONES[type];
    const change = applyTransition(type, plan.to, eventAt);
    const now = new Date();

    if (change.shipment) {
      await tx.update(shipments).set({ ...change.shipment, updatedAt: now }).where(eq(shipments.id, shipment.id));
    }
    if (container) {
      const patch: Partial<ContainerRow> = { ...change.container };
      const timeField = CONTAINER_TIME_FIELD[type];
      if (timeField) patch[timeField] = eventAt;
      if (type === 'loaded' && typeof extra.data.sealNumber === 'string') patch.sealNumber = extra.data.sealNumber;
      if (type === 'discharged' && extra.location) patch.terminalOrIcd = extra.location;
      if (type === 'empty_returned' && typeof extra.data.depot === 'string') patch.returnDepot = extra.data.depot;
      if (type === 'delivered' && !container.returnDueAt && container.freeDays != null) {
        patch.returnDueAt = new Date((container.dischargeAt ?? eventAt).getTime() + container.freeDays * DAY_MS);
      }
      if (!container.lastEventAt || eventAt > container.lastEventAt) patch.lastEventAt = eventAt;
      await tx.update(containers).set(patch).where(eq(containers.id, container.id));
    }

    const [event] = await tx
      .insert(milestoneEvents)
      .values({
        organizationId: shipment.organizationId,
        shipmentId: shipment.id,
        containerId: container?.id ?? null,
        milestoneType: type,
        previousStatus: plan.from,
        newStatus: plan.to,
        eventAt,
        recordedBy: user.id,
        source: user.role === 'driver' ? 'driver' : 'staff',
        location: extra.location,
        notes: extra.notes,
        reasonCode: extra.reasonCode,
        data: extra.data,
        evidenceDocumentIds: extra.evidenceDocumentIds,
        visibility: extra.visibility,
        overrideReason: extra.overrideReason ?? null,
        idempotencyKey: extra.idempotencyKey,
      })
      .returning();

    if (container) {
      await resolveExceptions(tx, { shipmentId: shipment.id, containerId: container.id, types: ['transit_update_missing'] }, 'Update received', user.id);
    }
    const resolves = AUTO_RESOLVE[type];
    if (resolves) await resolveExceptions(tx, { shipmentId: shipment.id, types: resolves }, `Cleared by "${def.label}"`, user.id);

    if (def.opensException) {
      await openException(tx, {
        organizationId: shipment.organizationId,
        shipmentId: shipment.id,
        containerId: container?.id,
        type: def.opensException as 'missing_document' | 'customs_hold',
        reason: [extra.data.document, extra.notes].filter(Boolean).join(': ') || def.label,
        nextAction: type === 'customs_hold' ? 'Resolve the hold with customs and update the client' : 'Request the document from the client',
        dueAt: new Date(now.getTime() + DAY_MS),
        source: 'staff',
        openedBy: user.id,
        clientVisible: type !== 'customs_hold',
        dedupeKey: `${type}:${event.id}`,
      });
    }

    if (extra.overrideReason) {
      await audit(tx, {
        actorUserId: user.id,
        organizationId: shipment.organizationId,
        action: 'milestone.override',
        entity: 'milestone_event',
        entityId: event.id,
        details: { type, reason: extra.overrideReason },
      });
    }
    if (def.notify && extra.visibility === 'client') {
      await enqueue(tx, shipment.organizationId, 'milestone.recorded', { eventId: event.id });
    }
    return event;
  }

  private async loadShipment(tx: Tx, user: AuthUser, id: string, forUpdate = false): Promise<ShipmentRow> {
    const query = tx.select().from(shipments).where(eq(shipments.id, id));
    const [row] = forUpdate ? await query.for('update') : await query;
    if (!row) throw new NotFound('Shipment');
    if (user.role === 'clearing_agent' && row.assignedAgentUserId !== user.id) throw new NotFound('Shipment');
    return row;
  }

  /** Drivers act only on containers on their own trucks (row-level security also enforces the shipment). */
  private async checkAssignment(tx: Tx, user: AuthUser, shipment: ShipmentRow, container?: ContainerRow) {
    if (user.role !== 'driver') return;
    if (!container) throw new ForbiddenException({ code: 'forbidden', message: 'Drivers record container milestones only.' });
    const [link] = await tx
      .select({ id: transportAssignments.id })
      .from(assignmentContainers)
      .innerJoin(transportAssignments, eq(transportAssignments.id, assignmentContainers.assignmentId))
      .where(
        and(
          eq(assignmentContainers.containerId, container.id),
          eq(transportAssignments.driverUserId, user.id),
          sql`${transportAssignments.status} <> 'cancelled'`,
        ),
      );
    if (!link) throw new ForbiddenException({ code: 'forbidden', message: 'This container is not on your truck.' });
  }

  private async findByIdempotencyKey(tx: Tx, key: string) {
    const [row] = await tx.select().from(milestoneEvents).where(eq(milestoneEvents.idempotencyKey, key));
    return row ?? null;
  }

  /** Milestones the role could record next; guard failures are listed so the UI can explain them. */
  private allowedActions(role: Role, s: ShipmentState, c?: ContainerState) {
    return MILESTONE_TYPES.filter((t) => (MILESTONES[t] as MilestoneDef).scope === (c ? 'container' : 'shipment'))
      .map((type) => ({ type, plan: planTransition({ type, role, shipment: s, container: c }) }))
      .filter(({ plan }) => plan.ok || plan.code === 'guard_failed')
      .map(({ type, plan }) => ({
        type,
        label: MILESTONES[type].label,
        blockedReason: plan.ok ? null : plan.message,
        overridable: plan.ok ? false : (plan.overridable ?? false),
      }));
  }

  private clientShipmentFields(s: ShipmentRow) {
    const { assignedOpsUserId, assignedAgentUserId, createdBy, closeReason, ...rest } = s;
    return rest;
  }

  private clientEvent(e: EventRow) {
    const { driverName, driverPhone, ...data } = e.data as Record<string, unknown>;
    return {
      id: e.id,
      milestoneType: e.milestoneType,
      label: (MILESTONES as Record<string, MilestoneDef>)[e.milestoneType]?.label ?? e.milestoneType,
      containerId: e.containerId,
      newStatus: e.newStatus,
      eventAt: e.eventAt,
      location: e.location,
      notes: e.notes,
      data,
      correctionOfEventId: e.correctionOfEventId,
    };
  }
}
