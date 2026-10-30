// Response shapes from the API, kept to the fields the apps read.

export interface Overall {
  status: string;
  ahead: number;
  total: number;
}

export interface Action {
  type: string;
  label: string;
  blockedReason: string | null;
  overridable: boolean;
}

export interface ShipmentSummary {
  id: string;
  reference: string;
  client: { id: string; name: string; code: string };
  origin: string;
  destination: string;
  docsStatus: string;
  customsStatus: string;
  currentEta: string | null;
  overall: Overall;
  containers: { id: string; containerNumber: string; journey: string; returnStatus: string }[];
  openExceptions: number;
  closedAt: string | null;
}

export interface Assignment {
  id?: string;
  truckRegistration: string;
  trailerRegistration?: string | null;
  driverName?: string;
  driverPhone?: string | null;
  driverUserId?: string | null;
  transporterName?: string | null;
}

export interface Container {
  id: string;
  containerNumber: string;
  sizeType: string | null;
  journey: string;
  returnStatus: string;
  sealNumber: string | null;
  returnDueAt?: string | null;
  returnDepot?: string | null;
  lastEventAt?: string | null;
  assignment: Assignment | null;
  actions: Action[];
}

export interface MilestoneEvent {
  id: string;
  milestoneType: string;
  label?: string;
  containerId: string | null;
  newStatus: string | null;
  eventAt: string;
  recordedAt?: string;
  location: string | null;
  notes: string | null;
  data: Record<string, unknown>;
  visibility?: string;
  recordedByName?: string | null;
  source?: string;
  overrideReason?: string | null;
  correctionOfEventId: string | null;
  corrected?: boolean;
}

export interface ExceptionRow {
  id: string;
  type: string;
  reason: string;
  status: string;
  openedAt: string;
  ownerRole?: string;
  nextAction?: string | null;
  dueAt?: string | null;
  clientVisible?: boolean;
  containerId?: string | null;
  resolution?: string | null;
}

export interface DocumentRow {
  id: string;
  documentType: string;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  verificationStatus: string;
  clientVisible: boolean;
  version: number;
}

export interface EtaRevision {
  id?: string;
  previousEta: string | null;
  newEta: string;
  reason: string;
  revisedAt: string;
  material?: boolean;
  notes?: string | null;
}

export interface ShipmentDetail {
  id: string;
  reference: string;
  organizationId: string;
  bookingReference: string | null;
  blNumber: string | null;
  shippingLine: string | null;
  vesselName: string | null;
  voyageNumber: string | null;
  originPort: string;
  destinationCity: string;
  destinationCountry: string;
  deliveryAddress: string | null;
  cargoDescription: string | null;
  docsStatus: string;
  customsStatus: string;
  plannedVesselArrival: string | null;
  vesselArrivedAt: string | null;
  currentEta: string | null;
  closedAt: string | null;
  client: { id: string; name: string; code: string; timezone: string };
  overall: Overall;
  actions: Action[];
  containers: Container[];
  events: MilestoneEvent[];
  exceptions: ExceptionRow[];
  etaHistory: EtaRevision[];
  documents: DocumentRow[];
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  organizationId: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: string;
  disputed: boolean;
  creditApproved: boolean;
  totals: { total: string; paid: string; pendingVerification: string; balance: string };
  lines: { description: string; amount: string }[];
  shipments: { id: string; reference: string }[];
  payments: {
    id: string;
    amount: string;
    currency: string;
    paidAt: string;
    method: string;
    transactionReference: string;
    verified: boolean;
    verifiedAt: string | null;
    receiptNumber: string | null;
  }[];
  reminders: { stage: string; sentAt: string }[];
}

export interface NotificationRow {
  id: string;
  shipmentId: string | null;
  channel: string;
  template: string;
  locale: string;
  body: string;
  status: string;
  attemptCount: number;
  errorCode: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  recipient: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  whatsappOptIn: boolean;
  pushEnabled: boolean;
  emailOptIn: boolean;
  locale: string;
}

export interface DriverJob {
  shipmentId: string;
  reference: string;
  origin: string;
  destination: string;
  deliveryAddress: string | null;
  truckRegistration: string;
  borderCrossing: string | null;
  container: { id: string; containerNumber: string; journey: string; returnStatus: string; sealNumber: string | null };
  actions: Action[];
}
