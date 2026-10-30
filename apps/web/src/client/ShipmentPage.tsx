import { Link, useParams } from 'react-router';
import { useGet } from '../shared/app';
import { formatDateTime, humanize } from '../shared/format';
import { ContainerCard, DocumentList, EtaBlock, EtaHistory, ExceptionList, StatusBadge, Timeline } from '../shared/shipment-parts';
import { ShipmentDetail } from '../shared/types';
import { ErrorBox, Loading } from '../shared/ui';

export function ShipmentPage() {
  const { id } = useParams();
  const q = useGet<ShipmentDetail>(`/shipments/${id}`, { refetchInterval: 60_000 });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const tz = s.client.timezone;
  return (
    <div className="stack">
      <Link to="/" className="small">
        ← All shipments
      </Link>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{s.reference}</h1>
        <StatusBadge overall={s.overall} />
      </div>
      <div className="card">
        <EtaBlock eta={s.currentEta} history={s.etaHistory} timeZone={tz} />
      </div>
      <ExceptionList items={s.exceptions.filter((x) => x.status === 'open')} />

      <div className="card">
        <dl className="kv">
          <dt>Route</dt>
          <dd>
            {s.originPort} → {s.destinationCity}, {s.destinationCountry}
          </dd>
          {s.blNumber && (
            <>
              <dt>B/L</dt>
              <dd className="mono">{s.blNumber}</dd>
            </>
          )}
          {s.vesselName && (
            <>
              <dt>Vessel</dt>
              <dd>
                {s.vesselName} {s.voyageNumber}
              </dd>
            </>
          )}
          <dt>Vessel arrival</dt>
          <dd>{s.vesselArrivedAt ? formatDateTime(s.vesselArrivedAt, tz) : `Planned ${formatDateTime(s.plannedVesselArrival, tz)}`}</dd>
          <dt>Documents</dt>
          <dd>{humanize(s.docsStatus)}</dd>
          <dt>Customs</dt>
          <dd>{humanize(s.customsStatus)}</dd>
          {s.cargoDescription && (
            <>
              <dt>Cargo</dt>
              <dd>{s.cargoDescription}</dd>
            </>
          )}
        </dl>
      </div>

      <h2 className="section-title">Containers</h2>
      {s.containers.map((c) => (
        <ContainerCard key={c.id} c={c} timeZone={tz} />
      ))}

      <h2 className="section-title">Documents</h2>
      <DocumentList docs={s.documents} />

      <h2 className="section-title">Updates</h2>
      <div className="card">
        <Timeline events={s.events} containers={s.containers} timeZone={tz} />
      </div>

      {s.etaHistory.length > 1 && (
        <>
          <h2 className="section-title">ETA changes</h2>
          <div className="card">
            <EtaHistory history={s.etaHistory} timeZone={tz} />
          </div>
        </>
      )}
    </div>
  );
}
