import { useGet } from '../shared/app';
import { formatDate, formatDateTime, formatMoney, humanize } from '../shared/format';
import { Invoice } from '../shared/types';
import { Badge, Empty, ErrorBox, Loading } from '../shared/ui';

export function invoiceTone(status: string) {
  if (status === 'paid' || status === 'credit_approved') return 'ok' as const;
  if (status === 'overdue' || status === 'disputed') return 'bad' as const;
  if (status === 'partially_paid') return 'warn' as const;
  return 'info' as const;
}

export function InvoicesPage() {
  const q = useGet<Invoice[]>('/invoices');
  return (
    <div className="stack">
      <h1>Invoices</h1>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !q.data.length && <Empty>No invoices yet.</Empty>}
      {q.data?.map((inv) => (
        <div key={inv.id} className="card stack" style={{ gap: 8 }}>
          <div className="row between">
            <strong>{inv.invoiceNumber}</strong>
            <Badge tone={invoiceTone(inv.status)}>{humanize(inv.status)}</Badge>
          </div>
          <div className="small muted">
            Issued {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)} · {inv.shipments.map((s) => s.reference).join(', ')}
          </div>
          <dl className="kv">
            <dt>Total</dt>
            <dd>{formatMoney(inv.totals.total, inv.currency)}</dd>
            <dt>Paid</dt>
            <dd>{formatMoney(inv.totals.paid, inv.currency)}</dd>
            <dt>Balance</dt>
            <dd>
              <strong>{formatMoney(inv.totals.balance, inv.currency)}</strong>
            </dd>
          </dl>
          {inv.payments.length > 0 && (
            <details>
              <summary className="small">Payments ({inv.payments.length})</summary>
              <ul className="small">
                {inv.payments.map((p) => (
                  <li key={p.id}>
                    {formatMoney(p.amount, p.currency)} on {formatDateTime(p.paidAt)} · {humanize(p.method)} · ref {p.transactionReference}
                    {p.receiptNumber && ` · receipt ${p.receiptNumber}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Payments show here once NGB finance has verified them.
          </p>
        </div>
      ))}
    </div>
  );
}
