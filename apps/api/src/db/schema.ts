// Logical model from FRS section 6, with the additions listed in the architecture doc:
// contacts and consents, exceptions as records, ETA history, assignment-to-container links,
// invoice lines, reminders and a transactional outbox. Column names are snake_case in
// PostgreSQL (drizzle `casing: 'snake_case'`).
//
// Every table holding client data has organization_id so row-level security can scope it
// (see drizzle/0001_security.sql).

import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().default(sql`gen_random_uuid()`);
const ts = () => timestamp({ withTimezone: true, mode: 'date' });
const money = () => numeric({ precision: 18, scale: 2 });
const created = () => ts().notNull().defaultNow();

export const organizations = pgTable('organizations', {
  id: id(),
  legalName: text().notNull(),
  clientCode: text().notNull().unique(),
  taxId: text(),
  billingAddress: text(),
  billingTermsDays: integer(),
  creditLimit: money(),
  creditCurrency: text(),
  preferredLanguage: text().notNull().default('en'),
  timezone: text().notNull().default('Africa/Dar_es_Salaam'),
  accountManagerId: uuid(),
  isActive: boolean().notNull().default(true),
  createdAt: created(),
  updatedAt: created(),
});

export const users = pgTable('users', {
  id: id(),
  email: text().notNull().unique(),
  name: text().notNull(),
  role: text().notNull(),
  organizationId: uuid().references(() => organizations.id),
  phone: text(),
  passwordHash: text().notNull(),
  isActive: boolean().notNull().default(true),
  lastLoginAt: ts(),
  createdAt: created(),
});

export const contacts = pgTable('contacts', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  userId: uuid().references(() => users.id),
  name: text().notNull(),
  phone: text().notNull(),
  email: text(),
  locale: text().notNull().default('en'),
  timezone: text().notNull().default('Africa/Dar_es_Salaam'),
  isPrimary: boolean().notNull().default(false),
  whatsappOptIn: boolean().notNull().default(false),
  pushEnabled: boolean().notNull().default(false),
  emailOptIn: boolean().notNull().default(false),
  createdAt: created(),
});

/** Append-only record of every opt-in and opt-out (FRS 7.1). */
export const consents = pgTable('consents', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  contactId: uuid().notNull().references(() => contacts.id),
  channel: text().notNull(),
  optedIn: boolean().notNull(),
  phone: text(),
  source: text().notNull(),
  recordedBy: uuid().references(() => users.id),
  recordedAt: created(),
});

export const locations = pgTable('locations', {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  kind: text().notNull(), // port | terminal | icd | depot | border | city
  country: text().notNull(),
});

export const routes = pgTable('routes', {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  originLocationId: uuid().references(() => locations.id),
  destinationLocationId: uuid().references(() => locations.id),
  portProcessingHours: integer().notNull().default(96),
  transitHours: integer().notNull().default(72),
  silenceAlertHours: integer().notNull().default(24),
});

export const shipments = pgTable(
  'shipments',
  {
    id: id(),
    organizationId: uuid().notNull().references(() => organizations.id),
    reference: text().notNull().unique(),
    bookingReference: text(),
    blNumber: text(),
    shippingLine: text(),
    vesselName: text(),
    voyageNumber: text(),
    originPort: text().notNull(),
    originTerminal: text(),
    destinationCountry: text().notNull(),
    destinationCity: text().notNull(),
    deliveryAddress: text(),
    cargoDescription: text(),
    packageCount: integer(),
    grossWeightKg: numeric({ precision: 12, scale: 2 }),
    routeId: uuid().references(() => routes.id),
    plannedVesselArrival: ts(),
    vesselArrivedAt: ts(),
    docsStatus: text().notNull().default('missing'),
    customsStatus: text().notNull().default('not_started'),
    currentEta: ts(),
    etaUpdatedAt: ts(),
    etaReason: text(),
    assignedOpsUserId: uuid().references(() => users.id),
    assignedAgentUserId: uuid().references(() => users.id),
    closedAt: ts(),
    closeReason: text(),
    createdBy: uuid().references(() => users.id),
    createdAt: created(),
    updatedAt: created(),
  },
  (t) => [index().on(t.organizationId), uniqueIndex().on(t.blNumber)],
);

export const containers = pgTable(
  'containers',
  {
    id: id(),
    organizationId: uuid().notNull().references(() => organizations.id),
    shipmentId: uuid().notNull().references(() => shipments.id),
    containerNumber: text().notNull(),
    sizeType: text(),
    sealNumber: text(),
    terminalOrIcd: text(),
    journey: text().notNull().default('at_sea'),
    returnStatus: text().notNull().default('not_due'),
    dischargeAt: ts(),
    gateOutAt: ts(),
    deliveryAt: ts(),
    emptyReturnAt: ts(),
    returnDueAt: ts(),
    freeDays: integer(),
    condition: text(),
    returnDepot: text(),
    lastEventAt: ts(),
    createdAt: created(),
  },
  (t) => [index().on(t.shipmentId), index().on(t.organizationId), index().on(t.containerNumber)],
);

export const transportAssignments = pgTable('transport_assignments', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  shipmentId: uuid().notNull().references(() => shipments.id),
  truckRegistration: text().notNull(),
  trailerRegistration: text(),
  driverUserId: uuid().references(() => users.id),
  driverName: text().notNull(),
  driverPhone: text(),
  transporterName: text(),
  plannedLoadingAt: ts(),
  actualLoadingAt: ts(),
  routeId: uuid().references(() => routes.id),
  borderCrossing: text(),
  transitDocumentRefs: text(),
  status: text().notNull().default('assigned'), // assigned | completed | cancelled
  assignedBy: uuid().references(() => users.id),
  assignedAt: created(),
});

/** One truck can carry one or two containers; one shipment can use several trucks (US-06). */
export const assignmentContainers = pgTable(
  'assignment_containers',
  {
    assignmentId: uuid().notNull().references(() => transportAssignments.id),
    containerId: uuid().notNull().references(() => containers.id),
    organizationId: uuid().notNull().references(() => organizations.id),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.containerId] })],
);

/** The ledger. Insert-only for the application role; corrections are new rows. */
export const milestoneEvents = pgTable(
  'milestone_events',
  {
    id: id(),
    organizationId: uuid().notNull().references(() => organizations.id),
    shipmentId: uuid().notNull().references(() => shipments.id),
    containerId: uuid().references(() => containers.id),
    milestoneType: text().notNull(),
    previousStatus: text(),
    newStatus: text(),
    eventAt: ts().notNull(),
    recordedAt: created(),
    recordedBy: uuid().references(() => users.id),
    source: text().notNull(), // staff | driver | integration | system
    location: text(),
    notes: text(),
    reasonCode: text(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    evidenceDocumentIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    visibility: text().notNull().default('client'), // client | internal
    correctionOfEventId: uuid(),
    overrideReason: text(),
    idempotencyKey: text().notNull().unique(),
  },
  (t) => [index().on(t.shipmentId, t.eventAt), index().on(t.organizationId)],
);

export const etaRevisions = pgTable('eta_revisions', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  shipmentId: uuid().notNull().references(() => shipments.id),
  previousEta: ts(),
  newEta: ts().notNull(),
  reason: text().notNull(),
  notes: text(),
  material: boolean().notNull(),
  revisedBy: uuid().references(() => users.id),
  revisedAt: created(),
});

export const exceptions = pgTable(
  'exceptions',
  {
    id: id(),
    organizationId: uuid().notNull().references(() => organizations.id),
    shipmentId: uuid().notNull().references(() => shipments.id),
    containerId: uuid().references(() => containers.id),
    type: text().notNull(),
    dedupeKey: text().unique(),
    ownerRole: text().notNull(),
    ownerUserId: uuid().references(() => users.id),
    reason: text().notNull(),
    nextAction: text().notNull(),
    dueAt: ts(),
    status: text().notNull().default('open'), // open | resolved
    clientVisible: boolean().notNull().default(false),
    source: text().notNull(), // system | staff | driver
    openedBy: uuid().references(() => users.id),
    openedAt: created(),
    resolvedAt: ts(),
    resolvedBy: uuid().references(() => users.id),
    resolution: text(),
  },
  (t) => [index().on(t.status, t.ownerRole), index().on(t.shipmentId)],
);

export const documents = pgTable('documents', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  shipmentId: uuid().notNull().references(() => shipments.id),
  documentType: text().notNull(),
  fileStorageKey: text().notNull(),
  fileName: text().notNull(),
  mimeType: text().notNull(),
  sizeBytes: integer().notNull(),
  sha256: text().notNull(),
  clientVisible: boolean().notNull().default(true),
  uploadedBy: uuid().references(() => users.id),
  uploadedAt: created(),
  verificationStatus: text().notNull().default('pending'),
  verifiedBy: uuid().references(() => users.id),
  verifiedAt: ts(),
  version: integer().notNull().default(1),
  replacesDocumentId: uuid(),
});

export const invoices = pgTable('invoices', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  invoiceNumber: text().notNull().unique(),
  issueDate: ts().notNull(),
  dueDate: ts().notNull(),
  currency: text().notNull(),
  subtotal: money().notNull(),
  tax: money().notNull(),
  totalAmount: money().notNull(),
  status: text().notNull().default('issued'), // draft | issued | void
  disputed: boolean().notNull().default(false),
  disputeReason: text(),
  creditApprovedBy: uuid().references(() => users.id),
  creditApprovalReason: text(),
  createdBy: uuid().references(() => users.id),
  createdAt: created(),
});

export const invoiceLines = pgTable('invoice_lines', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  invoiceId: uuid().notNull().references(() => invoices.id),
  description: text().notNull(),
  amount: money().notNull(),
});

export const invoiceShipments = pgTable(
  'invoice_shipments',
  {
    invoiceId: uuid().notNull().references(() => invoices.id),
    shipmentId: uuid().notNull().references(() => shipments.id),
    organizationId: uuid().notNull().references(() => organizations.id),
  },
  (t) => [primaryKey({ columns: [t.invoiceId, t.shipmentId] })],
);

export const payments = pgTable('payments', {
  id: id(),
  organizationId: uuid().notNull().references(() => organizations.id),
  invoiceId: uuid().notNull().references(() => invoices.id),
  amount: money().notNull(),
  currency: text().notNull(),
  paidAt: ts().notNull(),
  method: text().notNull(), // bank_transfer | mobile_money | cash | other
  transactionReference: text().notNull(),
  recordedBy: uuid().references(() => users.id),
  recordedAt: created(),
  verifiedBy: uuid().references(() => users.id),
  verifiedAt: ts(),
  receiptNumber: text().unique(),
});

export const invoiceReminders = pgTable(
  'invoice_reminders',
  {
    id: id(),
    organizationId: uuid().notNull().references(() => organizations.id),
    invoiceId: uuid().notNull().references(() => invoices.id),
    stage: text().notNull(),
    sentAt: created(),
  },
  (t) => [uniqueIndex().on(t.invoiceId, t.stage)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    organizationId: uuid().notNull().references(() => organizations.id),
    recipientContactId: uuid().notNull().references(() => contacts.id),
    shipmentId: uuid().references(() => shipments.id),
    sourceId: text().notNull(),
    channel: text().notNull(),
    template: text().notNull(),
    locale: text().notNull(),
    body: text().notNull(),
    dedupeKey: text().notNull().unique(),
    status: text().notNull().default('queued'), // queued | sent | delivered | failed
    providerMessageId: text(),
    attemptCount: integer().notNull().default(0),
    nextAttemptAt: ts().notNull().defaultNow(),
    lastAttemptAt: ts(),
    errorCode: text(),
    createdAt: created(),
  },
  (t) => [index().on(t.status, t.nextAttemptAt), index().on(t.organizationId)],
);

/** Written in the same transaction as the change it describes; drained by the worker. */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    organizationId: uuid().references(() => organizations.id),
    kind: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: created(),
    processedAt: ts(),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (t) => [index().on(t.processedAt, t.id)],
);

export const auditLog = pgTable('audit_log', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  organizationId: uuid().references(() => organizations.id),
  actorUserId: uuid().references(() => users.id),
  action: text().notNull(),
  entity: text().notNull(),
  entityId: text().notNull(),
  details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  at: created(),
});

export const sequences = pgTable('sequences', {
  name: text().primaryKey(),
  value: integer().notNull(),
});
