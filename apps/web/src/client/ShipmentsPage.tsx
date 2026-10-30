import { useState } from 'react';
import { Link } from 'react-router';
import { useGet } from '../shared/app';
import { formatDateTime } from '../shared/format';
import { StatusBadge } from '../shared/shipment-parts';
import { ShipmentSummary } from '../shared/types';
import { Badge, Empty, ErrorBox, Loading } from '../shared/ui';

export function ShipmentsPage() {
  const [filter, setFilter] = useState<'active' | 'done'>('active');
  const q = useGet<ShipmentSummary[]>('/shipments');
  const rows = (q.data ?? []).filter((s) =>
    filter === 'active' ? !s.closedAt && s.overall.status !== 'operationally_complete' : s.closedAt || s.overall.status === 'operationally_complete',
  );
  return (
    <div className="stack">
      <div className="row between">
        <h1>Your shipments</h1>
        <div className="segmented" role="group" aria-label="Filter">
          <button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>
            Active
          </button>
          <button type="button" aria-pressed={filter === 'done'} onClick={() => setFilter('done')}>
            Completed
          </button>
        </div>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !rows.length && <Empty>{filter === 'active' ? 'No active shipments.' : 'No completed shipments yet.'}</Empty>}
      {rows.map((s) => (
        <Link key={s.id} to={`/shipments/${s.id}`} className="card link stack" style={{ gap: 6 }}>
          <div className="row between">
            <strong>{s.reference}</strong>
            <StatusBadge overall={s.overall} />
          </div>
          <div className="small muted wrap">
            {s.origin} → {s.destination}
          </div>
          <div className="small mono wrap">{s.containers.map((c) => c.containerNumber).join(', ')}</div>
          <div className="row between small">
            <span>ETA {formatDateTime(s.currentEta)}</span>
            {s.openExceptions > 0 && <Badge tone="warn">{s.openExceptions} issue{s.openExceptions > 1 ? 's' : ''}</Badge>}
          </div>
        </Link>
      ))}
    </div>
  );
}
