import { useApi } from './app';
import { exceptionLabel, fileSize, formatDateTime, humanize, journeyLabel, journeyProgress, milestoneLabel, overallLabel } from './format';
import { Container, DocumentRow, EtaRevision, ExceptionRow, MilestoneEvent, Overall } from './types';
import { Badge, Empty, Progress, useToast } from './ui';

export function statusTone(status: string): 'ok' | 'warn' | 'bad' | 'info' {
  if (['delivered', 'operationally_complete', 'closed'].includes(status)) return 'ok';
  if (['awaiting_documents', 'port_processing'].includes(status)) return 'warn';
  return 'info';
}

export function StatusBadge({ overall }: { overall: Overall }) {
  return <Badge tone={statusTone(overall.status)}>{overallLabel(overall)}</Badge>;
}

/** Current ETA plus the reason for the latest change (US-02, AC-08). */
export function EtaBlock({ eta, history, timeZone }: { eta: string | null; history: EtaRevision[]; timeZone?: string }) {
  const latest = history[0];
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="muted small">Estimated delivery</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{eta ? formatDateTime(eta, timeZone) : 'Not set yet'}</div>
      {latest && (
        <div className="small">
          {latest.previousEta ? (
            <>
              Changed from {formatDateTime(latest.previousEta, timeZone)}: <strong>{latest.reason}</strong>
            </>
          ) : (
            <>Set: {latest.reason}</>
          )}
        </div>
      )}
    </div>
  );
}

export function EtaHistory({ history, timeZone }: { history: EtaRevision[]; timeZone?: string }) {
  if (!history.length) return <Empty>No ETA changes.</Empty>;
  return (
    <ul className="timeline">
      {history.map((r, i) => (
        <li key={r.id ?? i}>
          <div>
            <strong>{formatDateTime(r.newEta, timeZone)}</strong> {r.material === false && <Badge>Minor, client not notified</Badge>}
          </div>
          <div className="small">{r.reason}</div>
          <div className="small muted">
            Revised {formatDateTime(r.revisedAt, timeZone)}
            {r.previousEta && <> · was {formatDateTime(r.previousEta, timeZone)}</>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function returnTone(s: string) {
  return s === 'returned' ? 'ok' : s === 'return_overdue' || s === 'dispute' ? 'bad' : s === 'awaiting_return' ? 'warn' : undefined;
}

export function ContainerCard({ c, children, timeZone }: { c: Container; children?: React.ReactNode; timeZone?: string }) {
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row between">
        <strong className="mono">{c.containerNumber}</strong>
        <span className="row" style={{ gap: 4 }}>
          <Badge tone="info">{journeyLabel(c.journey)}</Badge>
          {c.returnStatus !== 'not_due' && <Badge tone={returnTone(c.returnStatus)}>Empty: {humanize(c.returnStatus)}</Badge>}
        </span>
      </div>
      <Progress value={journeyProgress(c.journey)} label={`${c.containerNumber} journey progress`} />
      <div className="small muted">
        {[c.sizeType, c.assignment && `Truck ${c.assignment.truckRegistration}`, c.sealNumber && `Seal ${c.sealNumber}`].filter(Boolean).join(' · ') || 'No truck yet'}
        {c.returnDueAt && c.returnStatus !== 'returned' && <> · Empty due back {formatDateTime(c.returnDueAt, timeZone)}</>}
      </div>
      {children}
    </div>
  );
}

export function Timeline({
  events,
  containers,
  timeZone,
  renderExtra,
}: {
  events: MilestoneEvent[];
  containers: { id: string; containerNumber: string }[];
  timeZone?: string;
  renderExtra?: (e: MilestoneEvent) => React.ReactNode;
}) {
  if (!events.length) return <Empty>No updates yet.</Empty>;
  const num = (id: string | null) => containers.find((c) => c.id === id)?.containerNumber;
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id} className={e.corrected ? 'corrected' : ''}>
          <div className="what">
            <strong>{milestoneLabel(e.milestoneType)}</strong>
            {num(e.containerId) && <span className="mono small"> · {num(e.containerId)}</span>}
            {e.visibility === 'internal' && <> <Badge>Internal</Badge></>}
            {e.overrideReason && <> <Badge tone="warn">Override</Badge></>}
            {e.correctionOfEventId && <> <Badge tone="warn">Correction</Badge></>}
          </div>
          <div className="small muted">
            {formatDateTime(e.eventAt, timeZone)}
            {e.location && ` · ${e.location}`}
            {e.recordedByName && ` · ${e.recordedByName}`}
            {e.source && e.source !== 'staff' && ` (${e.source})`}
          </div>
          {eventDetails(e) && <div className="small">{eventDetails(e)}</div>}
          {e.notes && <div className="small">{e.notes}</div>}
          {e.overrideReason && <div className="small">Override reason: {e.overrideReason}</div>}
          {renderExtra?.(e)}
        </li>
      ))}
    </ul>
  );
}

function eventDetails(e: MilestoneEvent) {
  const d = e.data ?? {};
  const parts: string[] = [];
  if (d.sealNumber) parts.push(`Seal ${d.sealNumber}`);
  if (d.border) parts.push(`Border ${d.border}`);
  if (d.receivedBy) parts.push(`Received by ${d.receivedBy}`);
  if (d.depot) parts.push(`Depot ${d.depot}`);
  if (d.document) parts.push(`Document: ${d.document}`);
  if (e.correctionOfEventId && d.correctsType) parts.push(`Corrects the time of "${milestoneLabel(String(d.correctsType))}"`);
  return parts.join(' · ');
}

export function DocumentList({ docs, staff }: { docs: DocumentRow[]; staff?: boolean }) {
  const api = useApi();
  const toast = useToast();
  if (!docs.length) return <Empty>No documents yet.</Empty>;
  return (
    <>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
        {docs.map((d) => (
          <li key={d.id} className="row between card" style={{ padding: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="wrap">
                <strong>{humanize(d.documentType)}</strong> <span className="small muted">v{d.version}</span>
              </div>
              <div className="small muted wrap">
                {d.fileName} · {fileSize(d.sizeBytes)} · {formatDateTime(d.uploadedAt)}
              </div>
              {staff && (
                <div className="row small" style={{ gap: 4, marginTop: 4 }}>
                  <Badge tone={d.verificationStatus === 'verified' ? 'ok' : 'warn'}>{humanize(d.verificationStatus)}</Badge>
                  <Badge>{d.clientVisible ? 'Client can see' : 'Staff only'}</Badge>
                </div>
              )}
            </div>
            <button type="button" onClick={() => api.openDocument(d.id).catch(toast.bad)}>
              Open
            </button>
          </li>
        ))}
      </ul>
      {toast.node}
    </>
  );
}

export function ExceptionList({ items, children }: { items: ExceptionRow[]; children?: (x: ExceptionRow) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.map((x) => (
        <div key={x.id} className={`alert ${x.status === 'open' ? 'warn' : ''}`}>
          <div className="row between">
            <strong>{exceptionLabel(x.type)}</strong>
            <Badge tone={x.status === 'open' ? 'warn' : 'ok'}>{humanize(x.status)}</Badge>
          </div>
          <div className="small">{x.reason}</div>
          {x.nextAction && <div className="small">Next: {x.nextAction}</div>}
          {x.resolution && <div className="small">Resolved: {x.resolution}</div>}
          {children?.(x)}
        </div>
      ))}
    </div>
  );
}
