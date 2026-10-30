import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { checkContainerNumber } from '@domain/container-number';
import { useApi, useGet } from '../shared/app';
import { ErrorBox, Field } from '../shared/ui';

interface Row {
  containerNumber: string;
  sizeType: string;
  freeDays: string;
}

/** Shipment registration (FRS 5, US-01). Container numbers are checked as they are typed (AC-01). */
export function NewShipmentPage() {
  const api = useApi();
  const nav = useNavigate();
  const qc = useQueryClient();
  const clients = useGet<{ id: string; legalName: string; clientCode: string }[]>('/clients');
  const agents = useGet<{ id: string; name: string }[]>('/users?role=clearing_agent');
  const [f, setF] = useState({
    organizationId: '',
    blNumber: '',
    bookingReference: '',
    shippingLine: '',
    vesselName: '',
    voyageNumber: '',
    originPort: 'Dar es Salaam',
    destinationCountry: '',
    destinationCity: '',
    deliveryAddress: '',
    cargoDescription: '',
    plannedVesselArrival: '',
    currentEta: '',
    assignedAgentUserId: '',
  });
  const [rows, setRows] = useState<Row[]>([{ containerNumber: '', sizeType: '40HC', freeDays: '14' }]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const checks = rows.map((r) => (r.containerNumber.trim() ? checkContainerNumber(r.containerNumber) : null));
  const dupes = new Set(checks.map((c, i) => (c?.valid && checks.findIndex((d) => d?.valid && d.value === c.value) !== i ? i : -1)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (checks.some((c) => !c || !c.valid) || dupes.size > 1) return setError(new Error('Fix the container numbers first.'));
    setBusy(true);
    setError(null);
    const opt = (v: string) => v.trim() || undefined;
    try {
      const created = await api.post<{ id: string; reference: string }>('/shipments', {
        organizationId: f.organizationId,
        blNumber: opt(f.blNumber),
        bookingReference: opt(f.bookingReference),
        shippingLine: opt(f.shippingLine),
        vesselName: opt(f.vesselName),
        voyageNumber: opt(f.voyageNumber),
        originPort: f.originPort.trim(),
        destinationCountry: f.destinationCountry.trim(),
        destinationCity: f.destinationCity.trim(),
        deliveryAddress: opt(f.deliveryAddress),
        cargoDescription: opt(f.cargoDescription),
        plannedVesselArrival: f.plannedVesselArrival ? new Date(f.plannedVesselArrival).toISOString() : undefined,
        currentEta: f.currentEta ? new Date(f.currentEta).toISOString() : undefined,
        assignedAgentUserId: opt(f.assignedAgentUserId),
        containers: rows.map((r, i) => ({
          containerNumber: (checks[i] as { value: string }).value,
          sizeType: opt(r.sizeType),
          freeDays: r.freeDays ? Number(r.freeDays) : undefined,
        })),
      });
      qc.invalidateQueries({ queryKey: ['/shipments'] });
      nav(`/shipments/${created.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 760 }}>
      <Link to="/" className="small">
        ← Shipments
      </Link>
      <h1>New shipment</h1>
      <div className="card stack">
        <Field label="Client">
          <select required value={f.organizationId} onChange={set('organizationId')}>
            <option value="">Choose…</option>
            {clients.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName} ({c.clientCode})
              </option>
            ))}
          </select>
        </Field>
        <div className="grid2">
          <Field label="B/L number">
            <input value={f.blNumber} onChange={set('blNumber')} />
          </Field>
          <Field label="Booking reference">
            <input value={f.bookingReference} onChange={set('bookingReference')} />
          </Field>
          <Field label="Shipping line">
            <input value={f.shippingLine} onChange={set('shippingLine')} />
          </Field>
          <Field label="Vessel and voyage">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input value={f.vesselName} onChange={set('vesselName')} placeholder="Vessel" />
              <input value={f.voyageNumber} onChange={set('voyageNumber')} placeholder="Voyage" style={{ maxWidth: 110 }} />
            </div>
          </Field>
          <Field label="Port of discharge">
            <input required minLength={2} value={f.originPort} onChange={set('originPort')} />
          </Field>
          <Field label="Planned vessel arrival">
            <input type="datetime-local" value={f.plannedVesselArrival} onChange={set('plannedVesselArrival')} />
          </Field>
          <Field label="Destination city">
            <input required minLength={2} value={f.destinationCity} onChange={set('destinationCity')} />
          </Field>
          <Field label="Destination country">
            <input required minLength={2} value={f.destinationCountry} onChange={set('destinationCountry')} />
          </Field>
          <Field label="Delivery ETA">
            <input type="datetime-local" value={f.currentEta} onChange={set('currentEta')} />
          </Field>
          <Field label="Clearing agent">
            <select value={f.assignedAgentUserId} onChange={set('assignedAgentUserId')}>
              <option value="">Not yet</option>
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Delivery address">
          <input value={f.deliveryAddress} onChange={set('deliveryAddress')} />
        </Field>
        <Field label="Cargo description">
          <textarea value={f.cargoDescription} onChange={set('cargoDescription')} />
        </Field>
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Containers</h2>
        {rows.map((r, i) => {
          const c = checks[i];
          const err = c && !c.valid ? c.reason : dupes.has(i) ? 'Listed twice.' : null;
          return (
            <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: '2 1 200px' }}>
                <Field label={`Container ${i + 1}`} error={err} hint={c?.valid ? `✓ ${c.value}` : 'Four letters, six digits and a check digit, e.g. MSCU4821171'}>
                  <input
                    required
                    className="mono"
                    value={r.containerNumber}
                    aria-invalid={!!err}
                    autoCapitalize="characters"
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, containerNumber: e.target.value } : x)))}
                  />
                </Field>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <Field label="Size/type">
                  <select value={r.sizeType} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, sizeType: e.target.value } : x)))}>
                    {['20GP', '40GP', '40HC', '20RF', '40RF', '20OT', '40FR'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div style={{ flex: '1 1 90px' }}>
                <Field label="Free days">
                  <input type="number" min={0} max={60} value={r.freeDays} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, freeDays: e.target.value } : x)))} />
                </Field>
              </div>
              {rows.length > 1 && (
                <button type="button" aria-label={`Remove container ${i + 1}`} style={{ marginTop: 24 }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setRows([...rows, { containerNumber: '', sizeType: '40HC', freeDays: '14' }])}>
          + Add container
        </button>
      </div>
      <ErrorBox error={error} />
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create shipment'}
        </button>
        <Link to="/" className="button">
          Cancel
        </Link>
      </div>
    </form>
  );
}
