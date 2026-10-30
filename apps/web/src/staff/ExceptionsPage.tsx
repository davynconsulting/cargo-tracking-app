import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useGet } from '../shared/app';
import { exceptionLabel, formatDateTime, humanize, journeyLabel } from '../shared/format';
import { ExceptionRow } from '../shared/types';
import { Badge, Empty, ErrorBox, Loading, useToast } from '../shared/ui';
import { ResolveDialog } from './ShipmentDialogs';
import { useRole } from './StaffShell';

interface QueueRow {
  exception: ExceptionRow & { shipmentId: string };
  shipmentReference: string;
  containerNumber: string | null;
  lastEventAt: string | null;
  journey: string | null;
}

/** The operations queue (US-05, AC-10): owner, reason, last event and next action. */
export function ExceptionsPage() {
  const role = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [mine, setMine] = useState(role !== 'ops_manager' && role !== 'admin');
  const path = `/exceptions?status=${status}${mine ? `&ownerRole=${role}` : ''}`;
  const q = useGet<QueueRow[]>(path, { refetchInterval: 30_000 });
  const [resolving, setResolving] = useState<QueueRow | null>(null);
  const overdue = (r: QueueRow) => r.exception.dueAt && new Date(r.exception.dueAt) < new Date();

  return (
    <div className="stack">
      <h1>Exceptions</h1>
      <div className="row">
        <div className="segmented" role="group" aria-label="Status">
          <button type="button" aria-pressed={status === 'open'} onClick={() => setStatus('open')}>
            Open
          </button>
          <button type="button" aria-pressed={status === 'resolved'} onClick={() => setStatus('resolved')}>
            Resolved
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          <span>Only my team ({humanize(role)})</span>
        </label>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !q.data.length && <Empty>{status === 'open' ? 'Nothing open. Good.' : 'Nothing resolved yet.'}</Empty>}
      {!!q.data?.length && (
        <table className="table">
          <thead>
            <tr>
              <th>Exception</th>
              <th>Shipment</th>
              <th>Owner</th>
              <th>Last event</th>
              <th>Next action</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data.map((r) => (
              <tr key={r.exception.id}>
                <td>
                  <strong>{exceptionLabel(r.exception.type)}</strong>
                  {overdue(r) && status === 'open' && (
                    <>
                      {' '}
                      <Badge tone="bad">Overdue</Badge>
                    </>
                  )}
                  <div className="small">{r.exception.reason}</div>
                  <div className="small muted">Opened {formatDateTime(r.exception.openedAt)}</div>
                </td>
                <td data-label="Shipment">
                  <Link to={`/shipments/${r.exception.shipmentId}`}>{r.shipmentReference}</Link>
                  {r.containerNumber && <div className="small mono">{r.containerNumber}</div>}
                </td>
                <td data-label="Owner">{humanize(r.exception.ownerRole ?? '')}</td>
                <td data-label="Last event" className="small">
                  {r.lastEventAt ? formatDateTime(r.lastEventAt) : '—'}
                  {r.journey && <div className="muted">{journeyLabel(r.journey)}</div>}
                </td>
                <td data-label="Next action" className="small">
                  {status === 'open' ? r.exception.nextAction : r.exception.resolution}
                  {r.exception.dueAt && status === 'open' && <div className="muted">Due {formatDateTime(r.exception.dueAt)}</div>}
                </td>
                <td>
                  {status === 'open' && role !== 'admin' && (
                    <button type="button" onClick={() => setResolving(r)}>
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {resolving && (
        <ResolveDialog
          id={resolving.exception.id}
          label={`${exceptionLabel(resolving.exception.type)} on ${resolving.shipmentReference}: ${resolving.exception.reason}`}
          onClose={() => setResolving(null)}
          onDone={(msg) => {
            setResolving(null);
            toast.ok(msg);
            qc.invalidateQueries();
          }}
        />
      )}
      {toast.node}
    </div>
  );
}
