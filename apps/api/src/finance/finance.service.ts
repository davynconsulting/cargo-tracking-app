import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { AuthUser, contextFor } from '../auth/auth.types';
import { DB } from '../common/config';
import { NotFound, RuleViolation } from '../common/errors';
import { audit, enqueue, nextNumber } from '../common/journal';
import { Db, Tx, withContext } from '../db/client';
import { invoiceLines, invoiceReminders, invoices, invoiceShipments, payments, shipments } from '../db/schema';
import { checkNewPayment, CURRENCIES, fromMinor, reminderStage, toMinor } from '../domain/money';
import { openException, resolveExceptions } from '../exceptions/exceptions.repo';
import { loadInvoiceWithBalance } from './finance.repo';

const amount = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use a plain decimal amount such as 1250.00');

export const CreateInvoiceBody = z.object({
  organizationId: z.string().uuid(),
  shipmentIds: z.array(z.string().uuid()).min(1),
  currency: z.enum(CURRENCIES),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date(),
  lines: z.array(z.object({ description: z.string().min(2).max(200), amount })).min(1),
  tax: amount.default('0'),
});
export type CreateInvoiceBody = z.infer<typeof CreateInvoiceBody>;

export const RecordPaymentBody = z.object({
  amount,
  paidAt: z.coerce.date(),
  method: z.enum(['bank_transfer', 'mobile_money', 'cash', 'other']),
  transactionReference: z.string().min(3).max(128),
});
export type RecordPaymentBody = z.infer<typeof RecordPaymentBody>;

export const DisputeBody = z.object({ disputed: z.boolean(), reason: z.string().min(3).max(500) });
export const CreditBody = z.object({ reason: z.string().min(3).max(500) });

@Injectable()
export class FinanceService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(user: AuthUser, body: CreateInvoiceBody) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const ships = await tx.select().from(shipments).where(inArray(shipments.id, body.shipmentIds));
      if (ships.length !== body.shipmentIds.length || ships.some((s) => s.organizationId !== body.organizationId)) {
        throw new RuleViolation('invalid_shipments', 'Every shipment must exist and belong to the invoiced client.');
      }
      const subtotal = body.lines.reduce((sum, l) => sum + toMinor(l.amount), 0n);
      const tax = toMinor(body.tax);
      const issueDate = body.issueDate ?? new Date();
      if (body.dueDate < issueDate) throw new RuleViolation('invalid_due_date', 'The due date is before the issue date.');

      const year = issueDate.getUTCFullYear();
      const n = await nextNumber(tx, `invoice:${year}`, 1);
      const [invoice] = await tx
        .insert(invoices)
        .values({
          organizationId: body.organizationId,
          invoiceNumber: `INV-${year}-${String(n).padStart(4, '0')}`,
          issueDate,
          dueDate: body.dueDate,
          currency: body.currency,
          subtotal: fromMinor(subtotal),
          tax: fromMinor(tax),
          totalAmount: fromMinor(subtotal + tax),
          createdBy: user.id,
        })
        .returning();
      await tx.insert(invoiceLines).values(body.lines.map((l) => ({ ...l, organizationId: body.organizationId, invoiceId: invoice.id })));
      await tx
        .insert(invoiceShipments)
        .values(body.shipmentIds.map((shipmentId) => ({ invoiceId: invoice.id, shipmentId, organizationId: body.organizationId })));
      await enqueue(tx, body.organizationId, 'invoice.issued', { invoiceId: invoice.id });
      await audit(tx, { actorUserId: user.id, organizationId: body.organizationId, action: 'invoice.issue', entity: 'invoice', entityId: invoice.id });
      return this.detail(tx, invoice.id);
    });
  }

  async list(user: AuthUser) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const rows = await tx.select({ id: invoices.id }).from(invoices).orderBy(desc(invoices.issueDate)).limit(200);
      return Promise.all(rows.map((r) => this.detail(tx, r.id, user.role === 'client')));
    });
  }

  async get(user: AuthUser, id: string) {
    return withContext(this.db, contextFor(user), (tx) => this.detail(tx, id, user.role === 'client'));
  }

  async recordPayment(user: AuthUser, invoiceId: string, body: RecordPaymentBody) {
    return withContext(this.db, contextFor(user), async (tx) => {
      await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for('update');
      const loaded = await loadInvoiceWithBalance(tx, invoiceId);
      if (!loaded) throw new NotFound('Invoice');
      if (loaded.invoice.status === 'void') throw new RuleViolation('void', 'The invoice is void.');
      const problem = checkNewPayment(loaded.balance.balance, loaded.balance.pending, toMinor(body.amount));
      if (problem) throw new RuleViolation('invalid_payment', problem);
      const [payment] = await tx
        .insert(payments)
        .values({ ...body, organizationId: loaded.invoice.organizationId, invoiceId, currency: loaded.invoice.currency, recordedBy: user.id })
        .returning();
      await audit(tx, { actorUserId: user.id, organizationId: loaded.invoice.organizationId, action: 'payment.record', entity: 'payment', entityId: payment.id, details: { amount: body.amount } });
      return payment;
    });
  }

  /** Only finance may verify, and only a verified payment reduces the balance (AC-12). */
  async verifyPayment(user: AuthUser, paymentId: string) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
      if (!payment) throw new NotFound('Payment');
      if (payment.verifiedAt) throw new RuleViolation('already_verified', 'This payment is already verified.');
      const year = new Date().getUTCFullYear();
      const n = await nextNumber(tx, `receipt:${year}`, 1);
      const [verified] = await tx
        .update(payments)
        .set({ verifiedBy: user.id, verifiedAt: new Date(), receiptNumber: `RCT-${year}-${String(n).padStart(5, '0')}` })
        .where(eq(payments.id, paymentId))
        .returning();
      await enqueue(tx, payment.organizationId, 'payment.verified', { paymentId });
      await audit(tx, { actorUserId: user.id, organizationId: payment.organizationId, action: 'payment.verify', entity: 'payment', entityId: paymentId });
      return verified;
    });
  }

  async setDispute(user: AuthUser, invoiceId: string, body: z.infer<typeof DisputeBody>) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const [invoice] = await tx
        .update(invoices)
        .set({ disputed: body.disputed, disputeReason: body.disputed ? body.reason : null })
        .where(eq(invoices.id, invoiceId))
        .returning();
      if (!invoice) throw new NotFound('Invoice');
      const [link] = await tx.select().from(invoiceShipments).where(eq(invoiceShipments.invoiceId, invoiceId));
      if (body.disputed) {
        await openException(tx, {
          organizationId: invoice.organizationId,
          shipmentId: link.shipmentId,
          type: 'payment_dispute',
          reason: `${invoice.invoiceNumber}: ${body.reason}`,
          nextAction: 'Agree the disputed amount with the client',
          source: 'staff',
          openedBy: user.id,
          dedupeKey: `dispute:${invoiceId}:${Date.now()}`,
        });
      } else {
        await resolveExceptions(tx, { shipmentId: link.shipmentId, types: ['payment_dispute'] }, body.reason, user.id);
      }
      await audit(tx, { actorUserId: user.id, organizationId: invoice.organizationId, action: body.disputed ? 'invoice.dispute' : 'invoice.undispute', entity: 'invoice', entityId: invoiceId, details: { reason: body.reason } });
      return invoice;
    });
  }

  async approveCredit(user: AuthUser, invoiceId: string, reason: string) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const [invoice] = await tx
        .update(invoices)
        .set({ creditApprovedBy: user.id, creditApprovalReason: reason })
        .where(eq(invoices.id, invoiceId))
        .returning();
      if (!invoice) throw new NotFound('Invoice');
      await audit(tx, { actorUserId: user.id, organizationId: invoice.organizationId, action: 'invoice.credit_approve', entity: 'invoice', entityId: invoiceId, details: { reason } });
      return invoice;
    });
  }

  /**
   * Sends the reminder for the invoice's current stage once. The unique (invoice, stage) row
   * is what stops a second reminder, whether it comes from the worker or a person (AC-13).
   */
  async remind(tx: Tx, invoiceId: string, now = new Date()) {
    const loaded = await loadInvoiceWithBalance(tx, invoiceId, now);
    if (!loaded) return { sent: false, stage: null, reason: 'not_found' as const };
    const stage = reminderStage(loaded.balance.status, loaded.invoice.dueDate, now);
    if (!stage) return { sent: false, stage, reason: 'no_stage' as const };
    const inserted = await tx
      .insert(invoiceReminders)
      .values({ organizationId: loaded.invoice.organizationId, invoiceId, stage })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return { sent: false, stage, reason: 'already_sent' as const };
    await enqueue(tx, loaded.invoice.organizationId, 'invoice.reminder', { invoiceId, stage });
    return { sent: true, stage, reason: null };
  }

  async remindNow(user: AuthUser, invoiceId: string) {
    return withContext(this.db, contextFor(user), (tx) => this.remind(tx, invoiceId));
  }

  private async detail(tx: Tx, id: string, forClient = false) {
    const loaded = await loadInvoiceWithBalance(tx, id);
    if (!loaded) throw new NotFound('Invoice');
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    const links = await tx
      .select({ id: shipments.id, reference: shipments.reference })
      .from(invoiceShipments)
      .innerJoin(shipments, eq(shipments.id, invoiceShipments.shipmentId))
      .where(eq(invoiceShipments.invoiceId, id));
    const reminders = await tx.select().from(invoiceReminders).where(and(eq(invoiceReminders.invoiceId, id)));
    const { total, paid, pending, balance, status } = loaded.balance;
    return {
      ...loaded.invoice,
      status,
      totals: { total: fromMinor(total), paid: fromMinor(paid), pendingVerification: fromMinor(pending), balance: fromMinor(balance) },
      lines: lines.map((l) => ({ description: l.description, amount: l.amount })),
      shipments: links,
      payments: loaded.payments
        .filter((p) => !forClient || p.verifiedAt)
        .map((p) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          paidAt: p.paidAt,
          method: p.method,
          transactionReference: p.transactionReference,
          verified: !!p.verifiedAt,
          verifiedAt: p.verifiedAt,
          receiptNumber: p.receiptNumber,
        })),
      reminders: reminders.map((r) => ({ stage: r.stage, sentAt: r.sentAt })),
    };
  }
}
