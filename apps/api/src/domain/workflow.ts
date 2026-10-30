// Status model from FRS section 4. Each track is independent: documents, customs and
// vessel arrival live on the shipment; journey and empty return live on each container.
// The overall shipment status is derived, never stored by hand.

export const ROLES = [
  'admin',
  'ops_manager',
  'documentation',
  'clearing_agent',
  'transport',
  'driver',
  'finance',
  'client',
] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['admin', 'ops_manager', 'documentation', 'clearing_agent', 'transport', 'finance'];

export const JOURNEY = [
  'at_sea',
  'discharged',
  'truck_assigned',
  'loaded',
  'in_transit',
  'at_border',
  'arrived',
  'delivered',
] as const;
export type Journey = (typeof JOURNEY)[number];

export const DOCS_STATUSES = ['missing', 'received', 'under_review', 'complete', 'rejected'] as const;
export type DocsStatus = (typeof DOCS_STATUSES)[number];

export const CUSTOMS_STATUSES = [
  'not_started',
  'entry_in_preparation',
  'submitted',
  'inspection',
  'duties_pending',
  'released',
  'on_hold',
] as const;
export type CustomsStatus = (typeof CUSTOMS_STATUSES)[number];

export const RETURN_STATUSES = ['not_due', 'awaiting_return', 'returned', 'return_overdue', 'dispute'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export interface ShipmentState {
  docsStatus: DocsStatus;
  customsStatus: CustomsStatus;
  vesselArrivedAt: Date | null;
  closedAt: Date | null;
}

export interface ContainerState {
  journey: Journey;
  returnStatus: ReturnStatus;
}

type Track = 'documents' | 'customs' | 'vessel' | 'journey' | 'return' | 'none';

export interface MilestoneDef {
  label: string;
  scope: 'shipment' | 'container';
  track: Track;
  roles: Role[];
  from?: readonly string[];
  to?: string;
  guard?: (s: ShipmentState, c?: ContainerState) => string | null;
  /** Only ops managers may override a failed guard, and only with a reason. */
  overridable?: boolean;
  /** Template sent to the client when the event is client-visible. */
  notify?: string;
  /** Opens an exception of this type when recorded. */
  opensException?: string;
}

const OPS: Role[] = ['ops_manager'];

export const MILESTONES = {
  documents_missing: {
    label: 'Document missing',
    scope: 'shipment',
    track: 'documents',
    roles: [...OPS, 'documentation'],
    from: ['missing', 'received', 'under_review', 'complete'],
    to: 'missing',
    notify: 'document_missing',
    opensException: 'missing_document',
  },
  documents_rejected: {
    label: 'Document rejected',
    scope: 'shipment',
    track: 'documents',
    roles: [...OPS, 'documentation'],
    from: ['received', 'under_review'],
    to: 'rejected',
    notify: 'document_missing',
    opensException: 'missing_document',
  },
  documents_complete: {
    label: 'Documents complete',
    scope: 'shipment',
    track: 'documents',
    roles: [...OPS, 'documentation'],
    from: ['missing', 'received', 'under_review', 'rejected'],
    to: 'complete',
    notify: 'documents_complete',
  },
  vessel_arrived: {
    label: 'Vessel arrived',
    scope: 'shipment',
    track: 'vessel',
    roles: [...OPS, 'documentation'],
    from: ['expected'],
    to: 'arrived',
    notify: 'vessel_arrived',
  },
  customs_entry_submitted: {
    label: 'Customs entry submitted',
    scope: 'shipment',
    track: 'customs',
    roles: [...OPS, 'clearing_agent'],
    from: ['not_started', 'entry_in_preparation'],
    to: 'submitted',
    notify: 'customs_update',
  },
  customs_inspection: {
    label: 'Customs inspection',
    scope: 'shipment',
    track: 'customs',
    roles: [...OPS, 'clearing_agent'],
    from: ['submitted', 'duties_pending'],
    to: 'inspection',
    notify: 'customs_update',
  },
  customs_duties_pending: {
    label: 'Duties pending',
    scope: 'shipment',
    track: 'customs',
    roles: [...OPS, 'clearing_agent'],
    from: ['submitted', 'inspection'],
    to: 'duties_pending',
    notify: 'customs_update',
  },
  customs_hold: {
    label: 'Customs hold',
    scope: 'shipment',
    track: 'customs',
    roles: [...OPS, 'clearing_agent'],
    from: ['submitted', 'inspection', 'duties_pending'],
    to: 'on_hold',
    notify: 'customs_update',
    opensException: 'customs_hold',
  },
  customs_released: {
    label: 'Customs released',
    scope: 'shipment',
    track: 'customs',
    roles: [...OPS, 'clearing_agent'],
    from: ['submitted', 'inspection', 'duties_pending', 'on_hold'],
    to: 'released',
    notify: 'customs_released',
  },
  discharged: {
    label: 'Container discharged',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'documentation'],
    from: ['at_sea'],
    to: 'discharged',
    guard: (s) => (s.vesselArrivedAt ? null : 'Record the vessel arrival before discharge.'),
    overridable: true,
    notify: 'container_discharged',
  },
  truck_assigned: {
    label: 'Truck assigned',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'transport'],
    from: ['discharged'],
    to: 'truck_assigned',
    notify: 'truck_assigned',
  },
  loaded: {
    label: 'Loaded',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'transport', 'driver'],
    from: ['truck_assigned'],
    to: 'loaded',
    notify: 'container_loaded',
  },
  gate_out: {
    label: 'Gate-out',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'clearing_agent'],
    from: ['loaded'],
    to: 'in_transit',
    guard: (s) => (s.customsStatus === 'released' ? null : 'Customs release is not confirmed, so gate-out is blocked.'),
    overridable: true,
    notify: 'gate_out',
  },
  checkpoint_passed: {
    label: 'Checkpoint passed',
    scope: 'container',
    track: 'none',
    roles: [...OPS, 'transport', 'driver'],
    from: ['in_transit'],
  },
  border_arrived: {
    label: 'At border',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'transport', 'driver'],
    from: ['in_transit'],
    to: 'at_border',
  },
  border_crossed: {
    label: 'Border crossed',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'transport', 'driver'],
    from: ['in_transit', 'at_border'],
    to: 'in_transit',
    notify: 'border_crossed',
  },
  arrived: {
    label: 'Arrived at destination',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'transport', 'driver'],
    from: ['in_transit', 'at_border'],
    to: 'arrived',
    notify: 'arrived',
  },
  delivered: {
    label: 'Delivered, POD received',
    scope: 'container',
    track: 'journey',
    roles: [...OPS, 'transport', 'driver'],
    from: ['arrived'],
    to: 'delivered',
    notify: 'delivered',
  },
  empty_returned: {
    label: 'Empty container returned',
    scope: 'container',
    track: 'return',
    roles: [...OPS, 'transport', 'driver'],
    from: ['awaiting_return', 'return_overdue', 'dispute'],
    to: 'returned',
    notify: 'empty_returned',
  },
} satisfies Record<string, MilestoneDef>;

export type MilestoneType = keyof typeof MILESTONES;
export const MILESTONE_TYPES = Object.keys(MILESTONES) as MilestoneType[];

export function currentValue(def: MilestoneDef, s: ShipmentState, c?: ContainerState): string {
  switch (def.track) {
    case 'documents':
      return s.docsStatus;
    case 'customs':
      return s.customsStatus;
    case 'vessel':
      return s.vesselArrivedAt ? 'arrived' : 'expected';
    case 'journey':
    case 'none':
      return c!.journey;
    case 'return':
      return c!.returnStatus;
  }
}

export type TransitionResult =
  | { ok: true; from: string; to: string; overridden: boolean }
  | { ok: false; code: 'forbidden' | 'scope' | 'invalid_transition' | 'guard_failed' | 'closed'; message: string; overridable?: boolean };

export function planTransition(input: {
  type: MilestoneType;
  role: Role;
  shipment: ShipmentState;
  container?: ContainerState;
  overrideReason?: string;
}): TransitionResult {
  const def: MilestoneDef = MILESTONES[input.type];
  const { shipment: s, container: c } = input;
  if (!def.roles.includes(input.role)) {
    return { ok: false, code: 'forbidden', message: `Your role cannot record "${def.label}".` };
  }
  if (s.closedAt) return { ok: false, code: 'closed', message: 'The shipment is closed. Reopen it first.' };
  if (def.scope === 'container' && !c) {
    return { ok: false, code: 'scope', message: `"${def.label}" must name a container.` };
  }
  if (def.track === 'return' && c!.journey !== 'delivered') {
    return { ok: false, code: 'invalid_transition', message: 'The container must be delivered before its empty return.' };
  }
  const from = currentValue(def, s, c);
  if (def.from && !def.from.includes(from)) {
    return { ok: false, code: 'invalid_transition', message: `"${def.label}" is not allowed while the status is "${from}".` };
  }
  const blocked = def.guard?.(s, c) ?? null;
  let overridden = false;
  if (blocked) {
    const canOverride = !!def.overridable && input.role === 'ops_manager';
    if (!canOverride || !input.overrideReason?.trim()) {
      return { ok: false, code: 'guard_failed', message: blocked, overridable: canOverride };
    }
    overridden = true;
  }
  return { ok: true, from, to: def.to ?? from, overridden };
}

/** Applies a planned transition to the in-memory state, returning the field changes. */
export function applyTransition(
  type: MilestoneType,
  to: string,
  eventAt: Date,
): { shipment?: Partial<ShipmentState>; container?: Partial<ContainerState> } {
  const def: MilestoneDef = MILESTONES[type];
  switch (def.track) {
    case 'documents':
      return { shipment: { docsStatus: to as DocsStatus } };
    case 'customs':
      return { shipment: { customsStatus: to as CustomsStatus } };
    case 'vessel':
      return { shipment: { vesselArrivedAt: eventAt } };
    case 'journey':
      return to === 'delivered'
        ? { container: { journey: 'delivered', returnStatus: 'awaiting_return' } }
        : { container: { journey: to as Journey } };
    case 'return':
      return { container: { returnStatus: to as ReturnStatus } };
    case 'none':
      return {};
  }
}

export const OVERALL_STATUSES = [
  'registered',
  'awaiting_documents',
  'vessel_arrived',
  'container_discharged',
  'port_processing',
  'ready_for_dispatch',
  'truck_assigned',
  'loaded',
  'in_transit',
  'arrived_at_destination',
  'delivered',
  'operationally_complete',
  'closed',
] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

/**
 * The spec defines one overall status per shipment, but containers move separately.
 * The least advanced container sets the status; `ahead` says how many have moved on,
 * so a client sees "loaded, 1 of 2 ahead" instead of a status that hides one container.
 */
export function deriveOverallStatus(
  s: ShipmentState,
  containers: ContainerState[],
): { status: OverallStatus; ahead: number; total: number } {
  const total = containers.length;
  if (s.closedAt) return { status: 'closed', ahead: 0, total };
  if (total === 0) {
    return { status: s.docsStatus === 'missing' || s.docsStatus === 'rejected' ? 'awaiting_documents' : 'registered', ahead: 0, total };
  }
  const minIndex = Math.min(...containers.map((c) => JOURNEY.indexOf(c.journey)));
  const ahead = containers.filter((c) => JOURNEY.indexOf(c.journey) > minIndex).length;
  const least = JOURNEY[minIndex];
  let status: OverallStatus;
  switch (least) {
    case 'at_sea':
      status =
        s.docsStatus === 'missing' || s.docsStatus === 'rejected'
          ? 'awaiting_documents'
          : s.vesselArrivedAt
            ? 'vessel_arrived'
            : 'registered';
      break;
    case 'discharged':
      status =
        s.customsStatus === 'released'
          ? 'ready_for_dispatch'
          : s.customsStatus === 'not_started'
            ? 'container_discharged'
            : 'port_processing';
      break;
    case 'truck_assigned':
      status = 'truck_assigned';
      break;
    case 'loaded':
      status = 'loaded';
      break;
    case 'in_transit':
    case 'at_border':
      status = 'in_transit';
      break;
    case 'arrived':
      status = 'arrived_at_destination';
      break;
    case 'delivered':
      status = containers.every((c) => c.returnStatus === 'returned') ? 'operationally_complete' : 'delivered';
      break;
  }
  return { status, ahead, total };
}

export interface ClosureCheck {
  key: 'delivered' | 'returned' | 'exceptions' | 'finance';
  label: string;
  passed: boolean;
}

export function closureChecks(input: {
  containers: ContainerState[];
  openExceptions: number;
  financeSettled: boolean;
}): ClosureCheck[] {
  return [
    { key: 'delivered', label: 'Every container delivered with POD', passed: input.containers.every((c) => c.journey === 'delivered') },
    { key: 'returned', label: 'Every empty container returned', passed: input.containers.every((c) => c.returnStatus === 'returned') },
    { key: 'exceptions', label: 'No open exceptions', passed: input.openExceptions === 0 },
    { key: 'finance', label: 'Invoices paid or credit approved', passed: input.financeSettled },
  ];
}
