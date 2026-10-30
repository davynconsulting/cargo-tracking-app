import { Role } from './workflow';

// Exception types and their default owners (FRS 8). Shared with the web apps for labels.
export const EXCEPTION_TYPES = {
  missing_document: { label: 'Missing or rejected document', owner: 'documentation' },
  customs_hold: { label: 'Customs hold', owner: 'clearing_agent' },
  port_processing_overdue: { label: 'Port processing over estimate', owner: 'ops_manager' },
  transit_update_missing: { label: 'Transit update missing', owner: 'transport' },
  container_return_overdue: { label: 'Empty return overdue', owner: 'ops_manager' },
  notification_failure: { label: 'Message not delivered', owner: 'ops_manager' },
  delay: { label: 'Delay', owner: 'ops_manager' },
  delivery_discrepancy: { label: 'Delivery discrepancy or damaged seal', owner: 'ops_manager' },
  truck_unavailable: { label: 'Truck unavailable or loading missed', owner: 'transport' },
  payment_dispute: { label: 'Payment disputed', owner: 'finance' },
  other: { label: 'Other', owner: 'ops_manager' },
} satisfies Record<string, { label: string; owner: Role }>;
export type ExceptionType = keyof typeof EXCEPTION_TYPES;
