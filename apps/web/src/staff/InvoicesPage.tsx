import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { CURRENCIES } from '@domain/money';
import { useApi, useGet } from '../shared/app';
import { formatDate, formatDateTime, formatMoney, humanize, toLocalInput } from '../shared/format';
import { Invoice, ShipmentSummary } from '../shared/types';
import { Badge, Dialog, Empty, ErrorBox, Field, Loading, useToast } from '../shared/ui';
import { invoiceTone } from '../client/InvoicesPage';
import { useRole } from './StaffShell';

type Open = { kind: 'create' } | { kind: 'pay' | 'dispute' | 'credit'; invoice: Invoice } | null;

/** Finance (FRS 9): only verified payments reduce the balance; reminders stop while disputed. */
export function InvoicesPage() {
  const api = useApi();
  const role = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useGet<Invoice[]>('/invoices');
  const clients = useGet<{ id: string; legalName: string }[]>('/clients');
  const [open, setOpen] = useState<Open>(null);
  const finance = role === 'finance';
  const name = (orgId: string) => clients.data?.find((c) => c.id === orgId)?.legalName ?? '';

  const done = (msg: string) => {
    setOpen(null);
    toast.ok(msg);
    qc.invalidateQueries({ queryKey: ['/invoices'] });
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      done(msg);
    } catch (e) {
      toast.bad(e);
    }
  };

  return (
    <div className="stack">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Invoices</h1>
        {finance && (
          <button type="button" className="primary" onClick={() => setOpen({ kind: 'create' })}>
            New invoice
          </button>
        )}
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !q.data.length && <Empty>No invoices.</Empty>}
      {q.data?.map((inv) => (
        <div key={inv.id} className="card stack" style={{ gap: 8 }}>
          <div className="row between">
            <div>
              <strong>{inv.invoiceNumber}</strong> <span className="muted">{name(inv.organizationId)}</span>
            </div>
            <span className="row" style={{ gap: 4 }}>
              <Badge tone={invoiceTone(inv.status)}>{humanize(inv.status)}</Badge>
              {inv.disputed && <Badge tone="bad">Disputed</Badge>}
              {inv.creditApproved && <Badge tone="ok">Credit approved</Badge>}
            </span>
          </div>
          <div className="small muted">
            Issued {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)} ·{' '}
            {inv.shipments.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <Link to={`/shipments/${s.id}`}>{s.reference}</Link>
              </span>
            ))}
          </div>
          <dl className="kv small">
            <dt>Total</dt>
            <dd>{formatMoney(inv.totals.total, inv.currency)}</dd>
            <dt>Verified paid</dt>
            <dd>{formatMoney(inv.totals.paid, inv.currency)}</dd>
            <dt>Awaiting verification</dt>
            <dd>{formatMoney(inv.totals.pendingVerification, inv.currency)}</dd>
            <dt>Balance</dt>
            <dd>
              <strong>{formatMoney(inv.totals.balance, inv.currency)}</strong>
            </dd>
          </dl>
          {inv.payments.length > 0 && (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {inv.payments.map((p) => (
                <li key={p.id}>
                  {formatMoney(p.amount, p.currency)} · {humanize(p.method)} · ref {p.transactionReference} · {formatDateTime(p.paidAt)}{' '}
                  {p.verified ? (
                    <Badge tone="ok">Verified{p.receiptNumber && ` · ${p.receiptNumber}`}</Badge>
                  ) : finance ? (
                    <button type="button" className="link" onClick={() => act(() => api.post(`/payments/${p.id}/verify`), 'Payment verified, receipt issued.')}>
                      Verify
                    </button>
                  ) : (
                    <Badge tone="warn">Unverified</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          {inv.reminders.length > 0 && (
            <div className="small muted">Reminders: {inv.reminders.map((r) => `${humanize(r.stage)} ${formatDate(r.sentAt)}`).join(', ')}</div>
          )}
          <div className="row">
            {finance && inv.status !== 'paid' && (
              <button type="button" onClick={() => setOpen({ kind: 'pay', invoice: inv })}>
                Record payment
              </button>
            )}
            {finance && inv.status !== 'paid' && !inv.disputed && (
              <button type="button" onClick={() => act(() => api.post(`/invoices/${inv.id}/reminders`), 'Reminder sent.')}>
                Send reminder
              </button>
            )}
            {finance && (
              <button type="button" onClick={() => setOpen({ kind: 'dispute', invoice: inv })}>
                {inv.disputed ? 'End dispute' : 'Mark disputed'}
              </button>
            )}
            {!inv.creditApproved && inv.status !== 'paid' && (
              <button type="button" onClick={() => setOpen({ kind: 'credit', invoice: inv })}>
                Approve credit
              </button>
            )}
          </div>
        </div>
      ))}
      {open?.kind === 'create' && <CreateInvoiceDialog onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'pay' && <PaymentDialog invoice={open.invoice} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'dispute' && (
        <ReasonDialog
          title={open.invoice.disputed ? 'End dispute' : 'Mark disputed'}
          hint={open.invoice.disputed ? 'Reminders start again.' : 'Reminders stop while disputed.'}
          onClose={() => setOpen(null)}
          submit={(reason) => api.post(`/invoices/${open.invoice.id}/dispute`, { disputed: !open.invoice.disputed, reason })}
          onDone={() => done(open.invoice.disputed ? 'Dispute ended.' : 'Marked disputed.')}
        />
      )}
      {open?.kind === 'credit' && (
        <ReasonDialog
          title="Approve credit"
          hint="Lets the shipment close before the invoice is paid."
          onClose={() => setOpen(null)}
          submit={(reason) => api.post(`/invoices/${open.invoice.id}/credit-approval`, { reason })}
          onDone={() => done('Credit approved.')}
        />
      )}
      {toast.node}
    </div>
  );
}

function SimpleForm({ title, onClose, onSubmit, children, label }: { title: string; onClose: () => void; onSubmit: () => Promise<void>; children: ReactNode; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {children}
        <ErrorBox error={error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {label}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ReasonDialog({ title, hint, onClose, submit, onDone }: { title: string; hint: string; onClose: () => void; submit: (r: string) => Promise<unknown>; onDone: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <SimpleForm title={title} label="Save" onClose={onClose} onSubmit={async () => (await submit(reason.trim()), onDone())}>
      <p className="small muted" style={{ margin: 0 }}>
        {hint}
      </p>
      <Field label="Reason">
        <textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </SimpleForm>
  );
}

const AMOUNT = '^\\d+(\\.\\d{1,2})?$';

function PaymentDialog({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: (m: string) => void }) {
  const api = useApi();
  const [amount, setAmount] = useState(invoice.totals.balance);
  const [paidAt, setPaidAt] = useState(toLocalInput(new Date()));
  const [method, setMethod] = useState('bank_transfer');
  const [ref, setRef] = useState('');
  return (
    <SimpleForm
      title={`Record payment · ${invoice.invoiceNumber}`}
      label="Record"
      onClose={onClose}
      onSubmit={async () => {
        await api.post(`/invoices/${invoice.id}/payments`, { amount, paidAt: new Date(paidAt).toISOString(), method, transactionReference: ref.trim() });
        onDone('Payment recorded. It reduces the balance once verified.');
      }}
    >
      <Field label={`Amount (${invoice.currency})`} hint={`Balance ${formatMoney(invoice.totals.balance, invoice.currency)}`}>
        <input required inputMode="decimal" pattern={AMOUNT} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Paid on">
        <input type="datetime-local" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </Field>
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {['bank_transfer', 'mobile_money', 'cash', 'other'].map((m) => (
            <option key={m} value={m}>
              {humanize(m)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Transaction reference">
        <input required minLength={3} value={ref} onChange={(e) => setRef(e.target.value)} />
      </Field>
    </SimpleForm>
  );
}

function CreateInvoiceDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const api = useApi();
  const clients = useGet<{ id: string; legalName: string }[]>('/clients');
  const shipments = useGet<ShipmentSummary[]>('/shipments');
  const [orgId, setOrgId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [currency, setCurrency] = useState<string>('USD');
  const [due, setDue] = useState(() => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  const [lines, setLines] = useState([{ description: 'Clearing and forwarding', amount: '' }]);
  const [tax, setTax] = useState('0');
  const own = (shipments.data ?? []).filter((s) => s.client.id === orgId);

  return (
    <SimpleForm
      title="New invoice"
      label="Issue invoice"
      onClose={onClose}
      onSubmit={async () => {
        if (!picked.length) throw new Error('Pick at least one shipment.');
        await api.post('/invoices', {
          organizationId: orgId,
          shipmentIds: picked,
          currency,
          dueDate: new Date(`${due}T23:59:00`).toISOString(),
          lines: lines.filter((l) => l.description.trim() && l.amount),
          tax: tax || '0',
        });
        onDone('Invoice issued.');
      }}
    >
      <Field label="Client">
        <select required value={orgId} onChange={(e) => (setOrgId(e.target.value), setPicked([]))}>
          <option value="">Choose…</option>
          {clients.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legalName}
            </option>
          ))}
        </select>
      </Field>
      {orgId && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 0 }}>
          <legend className="small muted">Shipments</legend>
          {!own.length && <span className="small muted">No shipments for this client.</span>}
          {own.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
              <span>{s.reference}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="grid2">
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 180px' }}>
            <Field label={`Line ${i + 1}`}>
              <input required={i === 0} value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            </Field>
          </div>
          <div style={{ flex: '1 1 110px' }}>
            <Field label="Amount">
              <input
                required={i === 0}
                inputMode="decimal"
                pattern={AMOUNT}
                value={l.amount}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
            </Field>
          </div>
        </div>
      ))}
      <button type="button" className="link" onClick={() => setLines([...lines, { description: '', amount: '' }])}>
        + Add line
      </button>
      <Field label="Tax">
        <input inputMode="decimal" pattern={AMOUNT} value={tax} onChange={(e) => setTax(e.target.value)} />
      </Field>
    </SimpleForm>
  );
}
