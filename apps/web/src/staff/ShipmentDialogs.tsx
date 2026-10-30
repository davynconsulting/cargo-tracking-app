import { FormEvent, ReactNode, useState } from 'react';
import { EXCEPTION_TYPES } from '@domain/exceptions';
import { ROLES } from '@domain/workflow';
import { ApiError, newKey } from '../shared/api';
import { useApi, useGet } from '../shared/app';
import { formatDateTime, humanize, milestoneLabel, toLocalInput } from '../shared/format';
import { Action, Container, MilestoneEvent, ShipmentDetail } from '../shared/types';
import { Dialog, ErrorBox, Field } from '../shared/ui';

interface DialogProps {
  onClose: () => void;
  onDone: (msg: string) => void;
}

/** Shared form wrapper: submit button, busy state and the API error under the fields. */
function FormDialog({
  title,
  submitLabel,
  onClose,
  run,
  children,
  danger,
}: {
  title: string;
  submitLabel: string;
  onClose: () => void;
  run: () => Promise<void>;
  children: ReactNode;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await run();
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
          <button type="submit" className={danger ? 'danger' : 'primary'} disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const nowInput = () => toLocalInput(new Date());

export function MilestoneDialog({ shipment, action, container, onClose, onDone }: DialogProps & { shipment: ShipmentDetail; action: Action; container?: Container }) {
  const api = useApi();
  const [eventAt, setEventAt] = useState(nowInput);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<'client' | 'internal'>('client');
  const [extra, setExtra] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  // One key per dialog, so a double click or a retry after a timeout records the event once.
  const [idempotencyKey] = useState(newKey);
  const t = action.type;
  const extraField: Record<string, [string, string, boolean]> = {
    documents_missing: ['document', 'Which document?', true],
    documents_rejected: ['document', 'Which document and why?', true],
    loaded: ['sealNumber', 'Seal number', false],
    border_arrived: ['border', 'Border', false],
    border_crossed: ['border', 'Border', true],
    delivered: ['receivedBy', 'Received by', false],
    empty_returned: ['depot', 'Return depot', false],
  };
  const ef = extraField[t];
  const needsOverride = !!action.blockedReason;

  return (
    <FormDialog
      title={`${action.label}${container ? ` · ${container.containerNumber}` : ''}`}
      submitLabel={needsOverride ? 'Record with override' : 'Record'}
      onClose={onClose}
      run={async () => {
        await api.post(`/shipments/${shipment.id}/milestones`, {
          type: t,
          containerId: container?.id,
          eventAt: new Date(eventAt).toISOString(),
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
          visibility,
          data: ef && extra.trim() ? { [ef[0]]: extra.trim() } : {},
          idempotencyKey,
          overrideReason: needsOverride ? overrideReason.trim() : undefined,
        });
        onDone(`${action.label} recorded.`);
      }}
    >
      {needsOverride && (
        <>
          <div className="alert warn">{action.blockedReason}</div>
          <Field label="Override reason" hint="Kept in the audit trail and shown on the timeline.">
            <textarea required minLength={5} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
          </Field>
        </>
      )}
      <Field label="When did it happen?">
        <input type="datetime-local" required value={eventAt} max={nowInput()} onChange={(e) => setEventAt(e.target.value)} />
      </Field>
      {ef && (
        <Field label={ef[1]}>
          <input required={ef[2]} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
      )}
      <Field label="Location (optional)">
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="Notes (optional)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={visibility === 'internal'} onChange={(e) => setVisibility(e.target.checked ? 'internal' : 'client')} />
        <span>Internal only (the client does not see it and is not notified)</span>
      </label>
    </FormDialog>
  );
}

interface UserRow {
  id: string;
  name: string;
  role: string;
  phone: string | null;
}

export function AssignTruckDialog({ shipment, containers, onClose, onDone }: DialogProps & { shipment: ShipmentDetail; containers: Container[] }) {
  const api = useApi();
  const drivers = useGet<UserRow[]>('/users?role=driver');
  const [picked, setPicked] = useState<string[]>(containers.slice(0, 1).map((c) => c.id));
  const [truck, setTruck] = useState('');
  const [trailer, setTrailer] = useState('');
  const [driverUserId, setDriverUserId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [transporter, setTransporter] = useState('');
  const [border, setBorder] = useState('');
  const [plannedLoadingAt, setPlanned] = useState('');
  const [idempotencyKey] = useState(newKey);

  function pickDriver(id: string) {
    setDriverUserId(id);
    const d = drivers.data?.find((x) => x.id === id);
    if (d) {
      setDriverName(d.name);
      setDriverPhone(d.phone ?? '');
    }
  }

  return (
    <FormDialog
      title="Assign truck"
      submitLabel="Assign"
      onClose={onClose}
      run={async () => {
        if (!picked.length) throw new Error('Pick at least one container.');
        await api.post(`/shipments/${shipment.id}/assignments`, {
          containerIds: picked,
          truckRegistration: truck.trim().toUpperCase(),
          trailerRegistration: trailer.trim().toUpperCase() || undefined,
          driverUserId: driverUserId || undefined,
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim() || undefined,
          transporterName: transporter.trim() || undefined,
          borderCrossing: border.trim() || undefined,
          plannedLoadingAt: plannedLoadingAt ? new Date(plannedLoadingAt).toISOString() : undefined,
          idempotencyKey,
        });
        onDone(`Truck ${truck.toUpperCase()} assigned.`);
      }}
    >
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 0 }}>
        <legend className="small muted">Containers on this truck (up to two)</legend>
        {containers.map((c) => (
          <label key={c.id} className="check">
            <input
              type="checkbox"
              checked={picked.includes(c.id)}
              disabled={!picked.includes(c.id) && picked.length >= 2}
              onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))}
            />
            <span className="mono">{c.containerNumber}</span>
            <span className="small muted">{c.sizeType}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid2">
        <Field label="Truck registration">
          <input required minLength={2} value={truck} onChange={(e) => setTruck(e.target.value)} autoCapitalize="characters" />
        </Field>
        <Field label="Trailer (optional)">
          <input value={trailer} onChange={(e) => setTrailer(e.target.value)} autoCapitalize="characters" />
        </Field>
      </div>
      <Field label="Driver with the app" hint="Pick a driver account so the trip shows in their app, or type a name below.">
        <select value={driverUserId} onChange={(e) => pickDriver(e.target.value)}>
          <option value="">No app account</option>
          {drivers.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Driver name">
          <input required minLength={2} value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </Field>
        <Field label="Driver phone">
          <input type="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
        </Field>
        <Field label="Transporter (optional)">
          <input value={transporter} onChange={(e) => setTransporter(e.target.value)} />
        </Field>
        <Field label="Border crossing (optional)">
          <input value={border} onChange={(e) => setBorder(e.target.value)} placeholder="e.g. Rusumo" />
        </Field>
      </div>
      <Field label="Planned loading (optional)">
        <input type="datetime-local" value={plannedLoadingAt} onChange={(e) => setPlanned(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

const ETA_REASONS = ['Port congestion', 'Customs inspection', 'Duties pending', 'Truck delay', 'Border delay', 'Road conditions', 'Client request', 'Other'];

export function EtaDialog({ shipment, onClose, onDone }: DialogProps & { shipment: ShipmentDetail }) {
  const api = useApi();
  const [eta, setEta] = useState(shipment.currentEta ? toLocalInput(new Date(shipment.currentEta)) : '');
  const [reason, setReason] = useState(ETA_REASONS[0]);
  const [other, setOther] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <FormDialog
      title="Revise ETA"
      submitLabel="Save ETA"
      onClose={onClose}
      run={async () => {
        const r = await api.post<{ material: boolean; deltaHours: number; thresholdHours: number }>(`/shipments/${shipment.id}/eta`, {
          eta: new Date(eta).toISOString(),
          reason: reason === 'Other' ? other.trim() : reason,
          notes: notes.trim() || undefined,
        });
        onDone(
          r.material
            ? `ETA saved. The client will be notified (moved ${Math.abs(r.deltaHours).toFixed(1)} h).`
            : `ETA saved. Moved ${Math.abs(r.deltaHours).toFixed(1)} h, under the ${r.thresholdHours} h threshold, so the client is not notified.`,
        );
      }}
    >
      <p className="small muted" style={{ margin: 0 }}>
        Current: {formatDateTime(shipment.currentEta)}. Clients are notified when the ETA moves more than 6 hours, or 2 hours on a same-day delivery.
      </p>
      <Field label="New ETA">
        <input type="datetime-local" required value={eta} onChange={(e) => setEta(e.target.value)} />
      </Field>
      <Field label="Reason (the client sees this)">
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {ETA_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      {reason === 'Other' && (
        <Field label="Describe the reason">
          <input required minLength={3} value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
      <Field label="Internal notes (optional)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export function CorrectEventDialog({ event, onClose, onDone }: DialogProps & { event: MilestoneEvent }) {
  const api = useApi();
  const [eventAt, setEventAt] = useState(toLocalInput(new Date(event.eventAt)));
  const [reason, setReason] = useState('');
  return (
    <FormDialog
      title={`Correct time: ${event.label ?? milestoneLabel(event.milestoneType)}`}
      submitLabel="Save correction"
      onClose={onClose}
      run={async () => {
        await api.post(`/events/${event.id}/corrections`, { eventAt: new Date(eventAt).toISOString(), reason: reason.trim() });
        onDone('Correction recorded. The original entry is kept.');
      }}
    >
      <p className="small muted" style={{ margin: 0 }}>
        Recorded as {formatDateTime(event.eventAt)}. The original stays in the history; the correction is added next to it (FRS 5.2).
      </p>
      <Field label="Correct time">
        <input type="datetime-local" required value={eventAt} max={nowInput()} onChange={(e) => setEventAt(e.target.value)} />
      </Field>
      <Field label="Reason">
        <textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

interface Check {
  key: string;
  label: string;
  passed: boolean;
}

export function CloseDialog({ shipment, onClose, onDone }: DialogProps & { shipment: ShipmentDetail }) {
  const api = useApi();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  return (
    <FormDialog
      title={`Close ${shipment.reference}`}
      submitLabel={checks ? 'Close with approved exception' : 'Close shipment'}
      danger={!!checks}
      onClose={onClose}
      run={async () => {
        try {
          await api.post(`/shipments/${shipment.id}/close`, { overrideReason: checks ? overrideReason.trim() : undefined });
          onDone('Shipment closed.');
        } catch (e) {
          if (e instanceof ApiError && e.code === 'closure_blocked') {
            setChecks(e.details as Check[]);
            throw new Error('Some checks have not passed. Fix them, or give the reason for closing anyway.');
          }
          throw e;
        }
      }}
    >
      {!checks && (
        <p style={{ margin: 0 }}>
          Closing checks delivery, empty return, open exceptions and invoices. Nothing more can be recorded after closing.
        </p>
      )}
      {checks && (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {checks.map((c) => (
            <li key={c.key}>
              {c.passed ? '✓' : '✗'} {c.label}
            </li>
          ))}
        </ul>
      )}
      {checks && (
        <Field label="Reason for closing anyway" hint="Recorded as an approved exception in the audit trail.">
          <textarea required minLength={5} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
        </Field>
      )}
    </FormDialog>
  );
}

const DOC_TYPES = ['bill_of_lading', 'delivery_order', 'customs_entry', 'release_order', 'gate_pass', 'packing_list', 'commercial_invoice', 'pod', 'photo', 'receipt', 'other'];

export function UploadDialog({ shipment, onClose, onDone }: DialogProps & { shipment: ShipmentDetail }) {
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('bill_of_lading');
  const [clientVisible, setClientVisible] = useState(true);
  return (
    <FormDialog
      title="Upload document"
      submitLabel="Upload"
      onClose={onClose}
      run={async () => {
        if (!file) throw new Error('Choose a file.');
        const form = new FormData();
        form.append('file', file);
        form.append('documentType', type);
        form.append('clientVisible', String(clientVisible));
        await api.upload(`/shipments/${shipment.id}/documents`, form);
        onDone(`${file.name} uploaded.`);
      }}
    >
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {DOC_TYPES.map((d) => (
            <option key={d} value={d}>
              {d === 'pod' ? 'Proof of delivery' : humanize(d)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="File" hint="PDF, JPEG, PNG or WebP, up to 20 MB.">
        <input type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
        <span>The client can see this document</span>
      </label>
    </FormDialog>
  );
}

export function OpenExceptionDialog({ shipment, onClose, onDone }: DialogProps & { shipment: ShipmentDetail }) {
  const api = useApi();
  const [type, setType] = useState('delay');
  const [containerId, setContainerId] = useState('');
  const [reason, setReason] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [ownerRole, setOwnerRole] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [clientVisible, setClientVisible] = useState(false);
  const manual = Object.entries(EXCEPTION_TYPES).filter(([k]) => !['notification_failure', 'transit_update_missing', 'port_processing_overdue'].includes(k));
  return (
    <FormDialog
      title="Raise exception"
      submitLabel="Raise"
      onClose={onClose}
      run={async () => {
        await api.post(`/shipments/${shipment.id}/exceptions`, {
          type,
          containerId: containerId || undefined,
          reason: reason.trim(),
          nextAction: nextAction.trim(),
          ownerRole: ownerRole || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          clientVisible,
        });
        onDone('Exception raised.');
      }}
    >
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {manual.map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Container (optional)">
        <select value={containerId} onChange={(e) => setContainerId(e.target.value)}>
          <option value="">Whole shipment</option>
          {shipment.containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.containerNumber}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What happened">
        <textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Next action">
        <input required minLength={3} value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label="Owner" hint={`Default: ${humanize(EXCEPTION_TYPES[type as keyof typeof EXCEPTION_TYPES].owner)}`}>
          <select value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}>
            <option value="">Default</option>
            {ROLES.filter((r) => r !== 'client' && r !== 'driver').map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due (optional)">
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
        <span>Show the reason to the client</span>
      </label>
    </FormDialog>
  );
}

export function ResolveDialog({ id, label, onClose, onDone }: DialogProps & { id: string; label: string }) {
  const api = useApi();
  const [resolution, setResolution] = useState('');
  return (
    <FormDialog
      title="Resolve exception"
      submitLabel="Resolve"
      onClose={onClose}
      run={async () => {
        await api.post(`/exceptions/${id}/resolve`, { resolution: resolution.trim() });
        onDone('Exception resolved.');
      }}
    >
      <p className="small" style={{ margin: 0 }}>
        {label}
      </p>
      <Field label="How was it resolved?">
        <textarea required minLength={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
