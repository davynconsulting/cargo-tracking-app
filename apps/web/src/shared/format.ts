import { JOURNEY, MILESTONES, OverallStatus } from '@domain/workflow';
import { EXCEPTION_TYPES } from '@domain/exceptions';

const STATUS_LABELS: Record<OverallStatus, string> = {
  registered: 'Registered',
  awaiting_documents: 'Awaiting documents',
  vessel_arrived: 'Vessel arrived',
  container_discharged: 'Container discharged',
  port_processing: 'Port processing',
  ready_for_dispatch: 'Ready for dispatch',
  truck_assigned: 'Truck assigned',
  loaded: 'Loaded',
  in_transit: 'In transit',
  arrived_at_destination: 'Arrived at destination',
  delivered: 'Delivered',
  operationally_complete: 'Empty returned',
  closed: 'Closed',
};

export function statusLabel(s: string) {
  return STATUS_LABELS[s as OverallStatus] ?? humanize(s);
}

export function overallLabel(o: { status: string; ahead: number; total: number }) {
  const base = statusLabel(o.status);
  return o.ahead > 0 ? `${base} (${o.ahead} of ${o.total} containers ahead)` : base;
}

const SYSTEM_EVENTS: Record<string, string> = {
  shipment_registered: 'Shipment registered',
  shipment_closed: 'Shipment closed',
  correction: 'Time corrected',
};

export function milestoneLabel(type: string) {
  return (MILESTONES as Record<string, { label: string }>)[type]?.label ?? SYSTEM_EVENTS[type] ?? humanize(type);
}

export function exceptionLabel(type: string) {
  return (EXCEPTION_TYPES as Record<string, { label: string }>)[type]?.label ?? humanize(type);
}

const JOURNEY_LABELS: Record<string, string> = {
  at_sea: 'At sea',
  discharged: 'Discharged',
  truck_assigned: 'Truck assigned',
  loaded: 'Loaded',
  in_transit: 'In transit',
  at_border: 'At border',
  arrived: 'Arrived',
  delivered: 'Delivered',
};
export function journeyLabel(j: string) {
  return JOURNEY_LABELS[j] ?? humanize(j);
}
/** 0..1 progress along the container journey, for the progress bar. */
export function journeyProgress(j: string) {
  const i = (JOURNEY as readonly string[]).indexOf(j);
  return i < 0 ? 0 : i / (JOURNEY.length - 1);
}

export function humanize(s: string) {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Dates are shown in the client's timezone (FRS 7.1), defaulting to East Africa Time. */
export function formatDateTime(value: string | Date | null | undefined, timeZone = 'Africa/Dar_es_Salaam') {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(d);
}

export function formatDate(value: string | Date | null | undefined, timeZone = 'Africa/Dar_es_Salaam') {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone }).format(d);
}

/** Money arrives as decimal strings; format without converting through floating point. */
export function formatMoney(amount: string, currency: string) {
  const negative = amount.startsWith('-');
  const [whole, frac = ''] = amount.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currency} ${grouped}.${(frac + '00').slice(0, 2)}`;
}

/** For <input type="datetime-local">, which works in local browser time. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
