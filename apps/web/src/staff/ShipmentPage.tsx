import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { MILESTONES } from '@domain/workflow';
import { useGet } from '../shared/app';
import { formatDateTime, humanize } from '../shared/format';
import { ContainerCard, DocumentList, EtaBlock, EtaHistory, ExceptionList, StatusBadge, Timeline } from '../shared/shipment-parts';
import { Action, Container, MilestoneEvent, ShipmentDetail } from '../shared/types';
import { ErrorBox, Loading, useToast } from '../shared/ui';
import {
  AssignTruckDialog,
  CloseDialog,
  CorrectEventDialog,
  EtaDialog,
  MilestoneDialog,
  OpenExceptionDialog,
  ResolveDialog,
  UploadDialog,
} from './ShipmentDialogs';
import { useRole } from './StaffShell';

type Open =
  | { kind: 'milestone'; action: Action; container?: Container }
  | { kind: 'assign' }
  | { kind: 'eta' }
  | { kind: 'correct'; event: MilestoneEvent }
  | { kind: 'close' }
  | { kind: 'upload' }
  | { kind: 'exception' }
  | { kind: 'resolve'; id: string; label: string }
  | null;

const OPS = ['ops_manager'];

export function ShipmentPage() {
  const { id } = useParams();
  const role = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const path = `/shipments/${id}`;
  const q = useGet<ShipmentDetail>(path, { refetchInterval: 30_000 });
  const [open, setOpen] = useState<Open>(null);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const closed = !!s.closedAt;
  const done = (msg: string) => {
    setOpen(null);
    toast.ok(msg);
    qc.invalidateQueries({ queryKey: [path] });
    qc.invalidateQueries({ queryKey: ['/shipments'] });
    qc.invalidateQueries({ queryKey: ['/exceptions?status=open'] });
  };
  const unassigned = s.containers.filter((c) => !c.assignment && c.journey === 'discharged');
  const canAssign = !closed && ['ops_manager', 'transport'].includes(role) && unassigned.length > 0;
  const canEta = !closed && ['ops_manager', 'transport', 'documentation'].includes(role);
  const canResolve = ['ops_manager', 'documentation', 'clearing_agent', 'transport', 'finance'].includes(role);

  return (
    <div className="stack">
      <Link to="/" className="small">
        ← Shipments
      </Link>
      <div className="row between">
        <div>
          <h1 style={{ margin: 0 }}>{s.reference}</h1>
          <div className="muted">
            {s.client.name} ({s.client.code})
          </div>
        </div>
        <StatusBadge overall={s.overall} />
      </div>
      {closed && <div className="alert ok">Closed {formatDateTime(s.closedAt)}. No more milestones can be recorded.</div>}

      <div className="row">
        {canAssign && (
          <button type="button" className="primary" onClick={() => setOpen({ kind: 'assign' })}>
            Assign truck
          </button>
        )}
        {canEta && (
          <button type="button" onClick={() => setOpen({ kind: 'eta' })}>
            Revise ETA
          </button>
        )}
        {!closed && (
          <button type="button" onClick={() => setOpen({ kind: 'upload' })}>
            Upload document
          </button>
        )}
        {!closed && role !== 'finance' && (
          <button type="button" onClick={() => setOpen({ kind: 'exception' })}>
            Raise exception
          </button>
        )}
        {!closed && OPS.includes(role) && (
          <button type="button" onClick={() => setOpen({ kind: 'close' })}>
            Close shipment
          </button>
        )}
      </div>

      <div className="grid2">
        <div className="card">
          <EtaBlock eta={s.currentEta} history={s.etaHistory} timeZone={s.client.timezone} />
        </div>
        <div className="card">
          <dl className="kv small">
            <dt>Route</dt>
            <dd>
              {s.originPort} → {s.destinationCity}, {s.destinationCountry}
            </dd>
            <dt>B/L</dt>
            <dd className="mono">{s.blNumber ?? '—'}</dd>
            <dt>Vessel</dt>
            <dd>{[s.shippingLine, s.vesselName, s.voyageNumber].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Vessel arrival</dt>
            <dd>{s.vesselArrivedAt ? formatDateTime(s.vesselArrivedAt) : `Planned ${formatDateTime(s.plannedVesselArrival)}`}</dd>
            <dt>Documents</dt>
            <dd>{humanize(s.docsStatus)}</dd>
            <dt>Customs</dt>
            <dd>{humanize(s.customsStatus)}</dd>
            <dt>Delivery</dt>
            <dd>{s.deliveryAddress ?? '—'}</dd>
          </dl>
        </div>
      </div>

      {s.actions.length > 0 && !closed && (
        <div className="card stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0 }}>Shipment milestones</h2>
          <ActionButtons actions={s.actions} onPick={(action) => setOpen({ kind: 'milestone', action })} />
        </div>
      )}

      <ExceptionList items={s.exceptions}>
        {(x) =>
          x.status === 'open' && canResolve ? (
            <div style={{ marginTop: 6 }}>
              <button type="button" onClick={() => setOpen({ kind: 'resolve', id: x.id, label: x.reason })}>
                Resolve
              </button>
            </div>
          ) : null
        }
      </ExceptionList>

      <h2 className="section-title">Containers</h2>
      <div className="grid2">
        {s.containers.map((c) => (
          <ContainerCard key={c.id} c={c} timeZone={s.client.timezone}>
            {c.assignment && (
              <div className="small">
                Driver {c.assignment.driverName}
                {c.assignment.driverPhone && (
                  <>
                    {' '}
                    · <a href={`tel:${c.assignment.driverPhone}`}>{c.assignment.driverPhone}</a>
                  </>
                )}
                {c.assignment.transporterName && ` · ${c.assignment.transporterName}`}
              </div>
            )}
            {!closed && <ActionButtons actions={c.actions} onPick={(action) => setOpen({ kind: 'milestone', action, container: c })} />}
          </ContainerCard>
        ))}
      </div>

      <div className="grid2">
        <div>
          <h2 className="section-title">Timeline</h2>
          <div className="card">
            <Timeline
              events={s.events}
              containers={s.containers}
              renderExtra={(e) =>
                OPS.includes(role) && e.milestoneType in MILESTONES && !e.corrected && !closed ? (
                  <button type="button" className="link small" onClick={() => setOpen({ kind: 'correct', event: e })}>
                    Correct time
                  </button>
                ) : null
              }
            />
          </div>
        </div>
        <div>
          <h2 className="section-title">Documents</h2>
          <DocumentList docs={s.documents} staff />
          <h2 className="section-title">ETA history</h2>
          <div className="card">
            <EtaHistory history={s.etaHistory} />
          </div>
        </div>
      </div>

      {open?.kind === 'milestone' && <MilestoneDialog shipment={s} action={open.action} container={open.container} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'assign' && <AssignTruckDialog shipment={s} containers={unassigned} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'eta' && <EtaDialog shipment={s} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'correct' && <CorrectEventDialog event={open.event} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'close' && <CloseDialog shipment={s} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'upload' && <UploadDialog shipment={s} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'exception' && <OpenExceptionDialog shipment={s} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'resolve' && <ResolveDialog id={open.id} label={open.label} onClose={() => setOpen(null)} onDone={done} />}
      {toast.node}
    </div>
  );
}

function ActionButtons({ actions, onPick }: { actions: Action[]; onPick: (a: Action) => void }) {
  if (!actions.length) return null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        {actions
          .filter((a) => !a.blockedReason || a.overridable)
          .map((a) => (
            <button key={a.type} type="button" className={a.blockedReason ? '' : 'primary'} onClick={() => onPick(a)}>
              {a.label}
              {a.blockedReason && ' (override)'}
            </button>
          ))}
      </div>
      {actions
        .filter((a) => a.blockedReason)
        .map((a) => (
          <div key={a.type} className="small muted">
            {a.label}: {a.blockedReason}
          </div>
        ))}
    </div>
  );
}
