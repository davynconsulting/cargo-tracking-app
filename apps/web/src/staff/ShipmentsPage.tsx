import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useGet } from '../shared/app';
import { formatDateTime, humanize } from '../shared/format';
import { StatusBadge } from '../shared/shipment-parts';
import { ShipmentSummary } from '../shared/types';
import { Badge, Empty, ErrorBox, Loading } from '../shared/ui';
import { useRole } from './StaffShell';

export function ShipmentsPage() {
  const nav = useNavigate();
  const role = useRole();
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const q = useGet<ShipmentSummary[]>('/shipments', { refetchInterval: 60_000 });
  const term = search.trim().toUpperCase();
  const rows = (q.data ?? [])
    .filter((s) => show === 'all' || !s.closedAt)
    .filter(
      (s) =>
        !term ||
        s.reference.includes(term) ||
        s.client.name.toUpperCase().includes(term) ||
        s.client.code.includes(term) ||
        s.containers.some((c) => c.containerNumber.includes(term.replace(/\s/g, ''))),
    );
  return (
    <div className="stack">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Shipments</h1>
        {(role === 'ops_manager' || role === 'documentation') && (
          <Link to="/shipments/new" className="button primary">
            New shipment
          </Link>
        )}
      </div>
      <div className="row">
        <input
          type="search"
          placeholder="Search reference, client or container"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 240px', width: 'auto' }}
          aria-label="Search shipments"
        />
        <div className="segmented" role="group" aria-label="Show">
          <button type="button" aria-pressed={show === 'open'} onClick={() => setShow('open')}>
            Open
          </button>
          <button type="button" aria-pressed={show === 'all'} onClick={() => setShow('all')}>
            All
          </button>
        </div>
      </div>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !rows.length && <Empty>No shipments match.</Empty>}
      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Client</th>
              <th>Status</th>
              <th>Docs / customs</th>
              <th>Containers</th>
              <th>ETA</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/shipments/${s.id}`)}>
                <td>
                  <Link to={`/shipments/${s.id}`} onClick={(e) => e.stopPropagation()}>
                    <strong>{s.reference}</strong>
                  </Link>
                  <div className="small muted">{s.destination}</div>
                </td>
                <td data-label="Client">{s.client.name}</td>
                <td data-label="Status">
                  <StatusBadge overall={s.overall} />
                </td>
                <td data-label="Docs / customs" className="small">
                  {humanize(s.docsStatus)} / {humanize(s.customsStatus)}
                </td>
                <td data-label="Containers" className="small mono">
                  {s.containers.map((c) => c.containerNumber).join(', ')}
                </td>
                <td data-label="ETA" className="small">
                  {formatDateTime(s.currentEta)}
                </td>
                <td data-label="Issues">{s.openExceptions > 0 ? <Badge tone="warn">{s.openExceptions} open</Badge> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
