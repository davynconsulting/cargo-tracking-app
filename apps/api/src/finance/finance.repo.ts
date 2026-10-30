import { eq } from 'drizzle-orm';
import { Tx } from '../db/client';
import { invoices, payments } from '../db/schema';
import { invoiceBalance } from '../domain/money';

export async function loadInvoiceWithBalance(tx: Tx, invoiceId: string, now = new Date()) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) return null;
  const pays = await tx.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  const balance = invoiceBalance(
    {
      totalAmount: invoice.totalAmount,
      status: invoice.status as 'draft' | 'issued' | 'void',
      disputed: invoice.disputed,
      dueDate: invoice.dueDate,
      creditApproved: !!invoice.creditApprovedBy,
    },
    pays.map((p) => ({ amount: p.amount, verified: !!p.verifiedAt })),
    now,
  );
  return { invoice, payments: pays, balance };
}

/** Paid, void, or carrying an approved credit term (FRS section 9 rule 8). */
export async function invoiceSettled(tx: Tx, invoiceId: string): Promise<boolean> {
  const loaded = await loadInvoiceWithBalance(tx, invoiceId);
  if (!loaded) return false;
  return loaded.balance.status === 'paid' || loaded.balance.status === 'void' || !!loaded.invoice.creditApprovedBy;
}
