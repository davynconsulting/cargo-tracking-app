// Money is held as integer minor units (2 decimal places, matching numeric(18,2) in the
// database) so no floating-point arithmetic touches a balance. FRS section 9 rules 2 and 3.

export const CURRENCIES = ['USD', 'TZS', 'KES', 'RWF', 'UGX'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function toMinor(amount: string | number): bigint {
  const text = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Not a valid amount: "${amount}"`);
  const [, sign, whole, fraction = ''] = match;
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign ? -minor : minor;
}

export function fromMinor(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export interface InvoiceForBalance {
  totalAmount: string;
  status: 'draft' | 'issued' | 'void';
  disputed: boolean;
  dueDate: Date;
  creditApproved: boolean;
}

export interface PaymentForBalance {
  amount: string;
  verified: boolean;
}

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'disputed' | 'void';

/** Only verified payments reduce the balance (FRS 4.2 transition controls, AC-12). */
export function invoiceBalance(invoice: InvoiceForBalance, payments: PaymentForBalance[], now: Date) {
  const total = toMinor(invoice.totalAmount);
  const paid = payments.filter((p) => p.verified).reduce((sum, p) => sum + toMinor(p.amount), 0n);
  const pending = payments.filter((p) => !p.verified).reduce((sum, p) => sum + toMinor(p.amount), 0n);
  const balance = total - paid;
  let status: InvoiceStatus;
  if (invoice.status === 'void') status = 'void';
  else if (invoice.status === 'draft') status = 'draft';
  else if (invoice.disputed) status = 'disputed';
  else if (balance <= 0n) status = 'paid';
  else if (now > invoice.dueDate) status = 'overdue';
  else if (paid > 0n) status = 'partially_paid';
  else status = 'issued';
  return { total, paid, pending, balance, status };
}

/** A new payment may not take the balance below zero, counting payments not yet verified. */
export function checkNewPayment(balance: bigint, pending: bigint, amount: bigint): string | null {
  if (amount <= 0n) return 'The amount must be more than zero.';
  if (amount > balance - pending) {
    return 'This payment would take the balance below zero. Record a credit or refund instead.';
  }
  return null;
}

export type ReminderStage = 'due_soon' | 'overdue' | 'overdue_7d';

const DAY = 86_400_000;

export function reminderStage(status: InvoiceStatus, dueDate: Date, now: Date): ReminderStage | null {
  if (status === 'paid' || status === 'void' || status === 'disputed' || status === 'draft') return null;
  const untilDue = dueDate.getTime() - now.getTime();
  if (untilDue < -7 * DAY) return 'overdue_7d';
  if (untilDue < 0) return 'overdue';
  if (untilDue <= 3 * DAY) return 'due_soon';
  return null;
}
