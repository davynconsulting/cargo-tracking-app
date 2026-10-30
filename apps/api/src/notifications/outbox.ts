// The background worker's two jobs:
//  1. drain the outbox: turn each recorded change into notification rows, one per
//     contact and channel, deduplicated by a unique key (AC-08);
//  2. send due notifications with bounded retries, so a provider outage delays
//     messages but never loses a milestone (AC-18).

import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { Db, SYSTEM, Tx, withContext } from '../db/client';
import {
  containers,
  contacts,
  etaRevisions,
  invoiceShipments,
  milestoneEvents,
  notifications,
  outboxEvents,
  payments,
  shipments,
} from '../db/schema';
import { fromMinor } from '../domain/money';
import { channelsFor, dedupeKey, MAX_ATTEMPTS, nextAttemptDelayMs, renderTemplate } from '../domain/notifications';
import { MILESTONES, MilestoneDef } from '../domain/workflow';
import { openException } from '../exceptions/exceptions.repo';
import { loadInvoiceWithBalance } from '../finance/finance.repo';
import { formatMoney, formatTime } from './format';
import { ChannelSender, PermanentSendError } from './senders';

type Contact = typeof contacts.$inferSelect;
type OutboxRow = typeof outboxEvents.$inferSelect;

interface Message {
  template: string;
  shipmentId: string | null;
  sourceId: string;
  /** Variables are built per contact so times show in the contact's own time zone. */
  vars: (contact: Contact) => Record<string, string>;
}

export async function drainOutbox(db: Db, batchSize = 50): Promise<number> {
  return withContext(db, SYSTEM, async (tx) => {
    const batch = await tx
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.processedAt))
      .orderBy(asc(outboxEvents.id))
      .limit(batchSize)
      .for('update', { skipLocked: true });
    for (const row of batch) {
      try {
        await tx.transaction(async (inner) => {
          const message = await buildMessage(inner, row);
          if (message && row.organizationId) await fanOut(inner, row.organizationId, message);
        });
        await tx.update(outboxEvents).set({ processedAt: new Date() }).where(eq(outboxEvents.id, row.id));
      } catch (err) {
        await tx
          .update(outboxEvents)
          .set({ attempts: row.attempts + 1, lastError: String(err), processedAt: row.attempts + 1 >= MAX_ATTEMPTS ? new Date() : null })
          .where(eq(outboxEvents.id, row.id));
      }
    }
    return batch.length;
  });
}

async function fanOut(tx: Tx, organizationId: string, message: Message) {
  const people = await tx.select().from(contacts).where(eq(contacts.organizationId, organizationId));
  for (const contact of people) {
    for (const channel of channelsFor(message.template, contact)) {
      const { text, locale } = renderTemplate(message.template, contact.locale, message.vars(contact));
      await tx
        .insert(notifications)
        .values({
          organizationId,
          recipientContactId: contact.id,
          shipmentId: message.shipmentId,
          sourceId: message.sourceId,
          channel,
          template: message.template,
          locale,
          body: text,
          dedupeKey: dedupeKey(message.sourceId, contact.id, channel, message.template),
        })
        .onConflictDoNothing({ target: notifications.dedupeKey });
    }
  }
}

async function buildMessage(tx: Tx, row: OutboxRow): Promise<Message | null> {
  const p = row.payload as Record<string, string>;
  switch (row.kind) {
    case 'shipment.registered': {
      const [s] = await tx.select().from(shipments).where(eq(shipments.id, p.shipmentId));
      const ctrs = await tx.select().from(containers).where(eq(containers.shipmentId, s.id));
      return {
        template: 'shipment_registered',
        shipmentId: s.id,
        sourceId: p.eventId,
        vars: () => ({
          ref: s.reference,
          containers: ctrs.map((c) => c.containerNumber).join(', '),
          origin: s.originPort,
          destination: `${s.destinationCity}, ${s.destinationCountry}`,
        }),
      };
    }
    case 'milestone.recorded': {
      const [e] = await tx.select().from(milestoneEvents).where(eq(milestoneEvents.id, p.eventId));
      const def: MilestoneDef | undefined = (MILESTONES as Record<string, MilestoneDef>)[e.milestoneType];
      if (!def?.notify || e.visibility !== 'client') return null;
      const [s] = await tx.select().from(shipments).where(eq(shipments.id, e.shipmentId));
      const [c] = e.containerId ? await tx.select().from(containers).where(eq(containers.id, e.containerId)) : [];
      const data = e.data as Record<string, string>;
      return {
        template: def.notify,
        shipmentId: s.id,
        sourceId: e.id,
        vars: (contact) => ({
          ref: s.reference,
          container: c?.containerNumber ?? '',
          time: formatTime(e.eventAt, contact.timezone),
          eta: formatTime(s.currentEta, contact.timezone),
          origin: s.originPort,
          status: (e.newStatus ?? '').replace(/_/g, ' '),
          place: String(data.border ?? e.location ?? ''),
          truck: String(data.truckRegistration ?? ''),
          document: String(data.document ?? 'requested document'),
          note: e.notes ?? '',
        }),
      };
    }
    case 'eta.revised': {
      const [r] = await tx.select().from(etaRevisions).where(eq(etaRevisions.id, p.revisionId));
      const [s] = await tx.select().from(shipments).where(eq(shipments.id, r.shipmentId));
      return {
        template: 'eta_changed',
        shipmentId: s.id,
        sourceId: r.id,
        vars: (contact) => ({
          ref: s.reference,
          previous: formatTime(r.previousEta, contact.timezone),
          next: formatTime(r.newEta, contact.timezone),
          reason: r.reason,
        }),
      };
    }
    case 'invoice.issued':
    case 'invoice.reminder': {
      const loaded = await loadInvoiceWithBalance(tx, p.invoiceId);
      if (!loaded) return null;
      const refs = await invoiceRefs(tx, p.invoiceId);
      const { invoice } = loaded;
      return {
        template: row.kind === 'invoice.issued' ? 'invoice_issued' : 'invoice_reminder',
        shipmentId: refs.firstShipmentId,
        sourceId: row.kind === 'invoice.issued' ? invoice.id : `${invoice.id}:${p.stage}`,
        vars: (contact) => ({
          invoice: invoice.invoiceNumber,
          ref: refs.references,
          amount: formatMoney(invoice.totalAmount, invoice.currency),
          balance: formatMoney(fromMinor(loaded.balance.balance), invoice.currency),
          due: formatTime(invoice.dueDate, contact.timezone),
        }),
      };
    }
    case 'payment.verified': {
      const [pay] = await tx.select().from(payments).where(eq(payments.id, p.paymentId));
      const loaded = await loadInvoiceWithBalance(tx, pay.invoiceId);
      const refs = await invoiceRefs(tx, pay.invoiceId);
      return {
        template: 'payment_verified',
        shipmentId: refs.firstShipmentId,
        sourceId: pay.id,
        vars: () => ({
          amount: formatMoney(pay.amount, pay.currency),
          invoice: loaded!.invoice.invoiceNumber,
          reference: pay.transactionReference,
          balance: formatMoney(fromMinor(loaded!.balance.balance), pay.currency),
        }),
      };
    }
    case 'shipment.closed': {
      const [s] = await tx.select().from(shipments).where(eq(shipments.id, p.shipmentId));
      return { template: 'shipment_closed', shipmentId: s.id, sourceId: p.eventId, vars: () => ({ ref: s.reference }) };
    }
    default:
      return null;
  }
}

async function invoiceRefs(tx: Tx, invoiceId: string) {
  const rows = await tx
    .select({ id: shipments.id, reference: shipments.reference })
    .from(invoiceShipments)
    .innerJoin(shipments, eq(shipments.id, invoiceShipments.shipmentId))
    .where(eq(invoiceShipments.invoiceId, invoiceId));
  return { firstShipmentId: rows[0]?.id ?? null, references: rows.map((r) => r.reference).join(', ') };
}

/** Sends notifications that are due. Holding row locks across the provider call keeps two workers from double-sending. */
export async function sendDue(db: Db, sender: ChannelSender, now = new Date(), batchSize = 20): Promise<number> {
  return withContext(db, SYSTEM, async (tx) => {
    const due = await tx
      .select({ n: notifications, contact: contacts })
      .from(notifications)
      .innerJoin(contacts, eq(contacts.id, notifications.recipientContactId))
      .where(and(eq(notifications.status, 'queued'), lte(notifications.nextAttemptAt, now)))
      .orderBy(asc(notifications.createdAt))
      .limit(batchSize)
      .for('update', { of: notifications, skipLocked: true });

    for (const { n, contact } of due) {
      const attempt = n.attemptCount + 1;
      try {
        const to = n.channel === 'email' ? contact.email! : contact.phone;
        const { providerMessageId } = await sender.send({ id: n.id, channel: n.channel as 'push', to, template: n.template, locale: n.locale, body: n.body });
        await tx
          .update(notifications)
          .set({ status: 'sent', providerMessageId, attemptCount: attempt, lastAttemptAt: now, errorCode: null })
          .where(eq(notifications.id, n.id));
      } catch (err) {
        const permanent = err instanceof PermanentSendError || attempt >= MAX_ATTEMPTS;
        await tx
          .update(notifications)
          .set({
            status: permanent ? 'failed' : 'queued',
            attemptCount: attempt,
            lastAttemptAt: now,
            nextAttemptAt: new Date(now.getTime() + nextAttemptDelayMs(attempt)),
            errorCode: (err as { code?: string }).code ?? 'send_error',
          })
          .where(eq(notifications.id, n.id));
        if (permanent && n.shipmentId) {
          await openException(tx, {
            organizationId: n.organizationId,
            shipmentId: n.shipmentId,
            type: 'notification_failure',
            reason: `${n.channel} message "${n.template}" to ${contact.name} failed after ${attempt} attempts`,
            nextAction: `Contact ${contact.name} on ${contact.phone} and retry the message`,
            source: 'system',
            dedupeKey: `notify:${n.id}`,
          });
        }
      }
    }
    return due.length;
  });
}

/** Staff action: put a failed message back in the queue. */
export async function retryNotification(tx: Tx, id: string) {
  const [row] = await tx
    .update(notifications)
    .set({ status: 'queued', nextAttemptAt: new Date(), attemptCount: 0 })
    .where(and(eq(notifications.id, id), inArray(notifications.status, ['failed'])))
    .returning();
  return row ?? null;
}

