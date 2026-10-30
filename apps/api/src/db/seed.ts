// Development data: staff for every role, two clients, two drivers and four shipments at
// different stages. Shipments are created through the real services, so the seed also
// exercises the workflow rules. Every account's password is "prototype-password".
//
// Never run against production: it resets the app role's password.

import 'reflect-metadata';
import { sql } from 'drizzle-orm';
import { AuthUser } from '../auth/auth.types';
import { hashPassword } from '../common/password';
import { Role } from '../domain/workflow';
import { FinanceService } from '../finance/finance.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { periodicTick, workerTick } from '../worker';
import { LogSender } from '../notifications/senders';
import { createDb, Db } from './client';
import { runMigrations } from './migrate';
import { consents, contacts, locations, organizations, routes, users } from './schema';

export const SEED_PASSWORD = 'prototype-password';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export async function seed(ownerDb: Db, appDb: Db, now = new Date()) {
  const hash = await hashPassword(SEED_PASSWORD);
  const staff = async (email: string, name: string, role: Role, phone?: string) => {
    const [u] = await ownerDb.insert(users).values({ email, name, role, phone, passwordHash: hash }).returning();
    return { id: u.id, name, role, organizationId: null } satisfies AuthUser;
  };
  const ops = await staff('ops@ngb.test', 'Neema Kweka', 'ops_manager');
  await staff('admin@ngb.test', 'System Admin', 'admin');
  await staff('docs@ngb.test', 'Rehema Ally', 'documentation');
  const agent = await staff('agent@ngb.test', 'Saidi Omari', 'clearing_agent');
  const transport = await staff('transport@ngb.test', 'Peter Massawe', 'transport');
  const finance = await staff('finance@ngb.test', 'Grace Mollel', 'finance');
  const juma = await staff('juma@ngb.test', 'Juma Hassan', 'driver', '+255713440218');
  const hamisi = await staff('hamisi@ngb.test', 'Hamisi Said', 'driver', '+255682310774');

  const [khl] = await ownerDb
    .insert(organizations)
    .values({ legalName: 'Kigali Hardware Ltd', clientCode: 'KHL', timezone: 'Africa/Kigali', billingTermsDays: 14, accountManagerId: ops.id })
    .returning();
  const [mas] = await ownerDb
    .insert(organizations)
    .values({ legalName: 'Mwanza Agro Supplies', clientCode: 'MAS', preferredLanguage: 'sw', billingTermsDays: 30, accountManagerId: ops.id })
    .returning();

  const [aline] = await ownerDb
    .insert(users)
    .values({ email: 'aline@khl.test', name: 'Aline Uwase', role: 'client', organizationId: khl.id, passwordHash: hash })
    .returning();
  const [baraka] = await ownerDb
    .insert(users)
    .values({ email: 'baraka@mas.test', name: 'Baraka Mushi', role: 'client', organizationId: mas.id, passwordHash: hash })
    .returning();
  const people = await ownerDb
    .insert(contacts)
    .values([
      { organizationId: khl.id, userId: aline.id, name: 'Aline Uwase', phone: '+250788123456', email: 'aline@khl.test', timezone: 'Africa/Kigali', isPrimary: true, whatsappOptIn: true, pushEnabled: true },
      // No opt-in on record, so Eric receives nothing.
      { organizationId: khl.id, name: 'Eric Mugisha', phone: '+250722555019', timezone: 'Africa/Kigali' },
      { organizationId: mas.id, userId: baraka.id, name: 'Baraka Mushi', phone: '+255754987321', locale: 'sw', isPrimary: true, whatsappOptIn: true },
    ])
    .returning();
  await ownerDb.insert(consents).values(
    people
      .filter((p) => p.whatsappOptIn)
      .map((p) => ({ organizationId: p.organizationId, contactId: p.id, channel: 'whatsapp', optedIn: true, phone: p.phone, source: 'Signed onboarding form (seed data)' })),
  );

  await ownerDb.insert(locations).values([
    { code: 'TZDAR', name: 'Dar es Salaam port', kind: 'port', country: 'TZ' },
    { code: 'KEMBA', name: 'Mombasa port', kind: 'port', country: 'KE' },
    { code: 'RUSUMO', name: 'Rusumo border post', kind: 'border', country: 'TZ/RW' },
    { code: 'MALABA', name: 'Malaba border post', kind: 'border', country: 'KE/UG' },
    { code: 'RWKGL', name: 'Kigali', kind: 'city', country: 'RW' },
    { code: 'TZMWZ', name: 'Mwanza', kind: 'city', country: 'TZ' },
  ]);
  await ownerDb.insert(routes).values([
    { code: 'DAR-KGL', name: 'Dar es Salaam to Kigali via Rusumo', portProcessingHours: 96, transitHours: 72, silenceAlertHours: 24 },
    { code: 'MBA-KGL', name: 'Mombasa to Kigali via Malaba', portProcessingHours: 96, transitHours: 96, silenceAlertHours: 24 },
    { code: 'DAR-MWZ', name: 'Dar es Salaam to Mwanza', portProcessingHours: 96, transitHours: 48, silenceAlertHours: 24 },
  ]);

  const shipmentsSvc = new ShipmentsService(appDb);
  const financeSvc = new FinanceService(appDb);
  let key = 0;
  const at = (offset: number) => new Date(now.getTime() + offset);
  const record = (user: AuthUser, shipmentId: string, type: Parameters<ShipmentsService['recordMilestone']>[2]['type'], eventAt: Date, extra: Record<string, unknown> = {}) =>
    shipmentsSvc.recordMilestone(user, shipmentId, { type, eventAt, idempotencyKey: `seed-${++key}-${now.getTime()}`, visibility: 'client', data: {}, evidenceDocumentIds: [], ...extra });

  // 1. Two containers to Kigali: one in transit, one loaded and waiting for gate-out.
  const s1 = await shipmentsSvc.create(ops, {
    organizationId: khl.id,
    blNumber: 'DAR0482117',
    shippingLine: 'Example Line',
    vesselName: 'MV Pemba Star',
    voyageNumber: '214E',
    originPort: 'Dar es Salaam',
    destinationCountry: 'Rwanda',
    destinationCity: 'Kigali',
    deliveryAddress: 'KHL warehouse, Kigali Special Economic Zone',
    cargoDescription: 'Steel roofing sheets',
    routeCode: 'DAR-KGL',
    assignedAgentUserId: agent.id,
    currentEta: at(2 * DAY + 5 * HOUR),
    containers: [
      { containerNumber: 'MSCU4821171', sizeType: '40ft dry', freeDays: 14 },
      { containerNumber: 'MSCU4821206', sizeType: '40ft dry', freeDays: 14 },
    ],
  });
  const [k1, k2] = s1.containers;
  await record(ops, s1.id, 'documents_complete', at(-8 * DAY));
  await record(ops, s1.id, 'vessel_arrived', at(-6 * DAY), { location: 'Dar es Salaam, TICTS terminal' });
  await record(ops, s1.id, 'discharged', at(-5 * DAY), { containerId: k1.id, location: 'Dar es Salaam terminal' });
  await record(ops, s1.id, 'discharged', at(-5 * DAY), { containerId: k2.id, location: 'Dar es Salaam terminal' });
  await record(agent, s1.id, 'customs_entry_submitted', at(-5 * DAY + 4 * HOUR));
  await record(agent, s1.id, 'customs_released', at(-3 * DAY));
  await shipmentsSvc.assignTruck(transport, s1.id, { containerIds: [k1.id], truckRegistration: 'T 517 DLM', driverUserId: hamisi.id, driverName: hamisi.name, driverPhone: '+255682310774', borderCrossing: 'Rusumo', idempotencyKey: `seed-assign-1-${now.getTime()}` });
  await record(hamisi, s1.id, 'loaded', at(-26 * HOUR), { containerId: k1.id, data: { sealNumber: 'TZ4471820' } });
  await record(agent, s1.id, 'gate_out', at(-20 * HOUR), { containerId: k1.id });
  await shipmentsSvc.assignTruck(transport, s1.id, { containerIds: [k2.id], truckRegistration: 'T 482 DKL', driverUserId: juma.id, driverName: juma.name, driverPhone: '+255713440218', borderCrossing: 'Rusumo', idempotencyKey: `seed-assign-2-${now.getTime()}` });
  await record(juma, s1.id, 'loaded', at(-3 * HOUR), { containerId: k2.id, data: { sealNumber: 'TZ4471833' } });

  // 2. Mombasa to Kigali, stuck in port processing with customs submitted.
  const s2 = await shipmentsSvc.create(ops, {
    organizationId: khl.id,
    blNumber: 'MBA0613390',
    vesselName: 'MV Lamu Trader',
    voyageNumber: '088N',
    originPort: 'Mombasa',
    destinationCountry: 'Rwanda',
    destinationCity: 'Kigali',
    cargoDescription: 'PVC pipes',
    routeCode: 'MBA-KGL',
    assignedAgentUserId: agent.id,
    currentEta: at(5 * DAY),
    containers: [{ containerNumber: 'CMAU7713306', sizeType: '20ft dry', freeDays: 10 }],
  });
  await record(ops, s2.id, 'documents_complete', at(-7 * DAY));
  await record(ops, s2.id, 'vessel_arrived', at(-5 * DAY));
  await record(ops, s2.id, 'discharged', at(-4 * DAY - 5 * HOUR), { containerId: s2.containers[0].id, location: 'Embakasi ICD' });
  await record(agent, s2.id, 'customs_entry_submitted', at(-4 * DAY));

  // 3. Domestic delivery done; empty container due back tomorrow; invoice partly paid.
  const s3 = await shipmentsSvc.create(ops, {
    organizationId: mas.id,
    blNumber: 'DAR0477812',
    vesselName: 'MV Pemba Star',
    voyageNumber: '212E',
    originPort: 'Dar es Salaam',
    destinationCountry: 'Tanzania',
    destinationCity: 'Mwanza',
    cargoDescription: 'Fertiliser, 1,040 bags',
    routeCode: 'DAR-MWZ',
    currentEta: at(-2 * DAY),
    containers: [{ containerNumber: 'TGHU2290550', sizeType: '20ft dry' }],
  });
  const k4 = s3.containers[0];
  await record(ops, s3.id, 'documents_complete', at(-12 * DAY));
  await record(ops, s3.id, 'vessel_arrived', at(-10 * DAY));
  await record(ops, s3.id, 'discharged', at(-9 * DAY), { containerId: k4.id });
  await record(ops, s3.id, 'customs_entry_submitted', at(-9 * DAY));
  await record(ops, s3.id, 'customs_released', at(-7 * DAY));
  await shipmentsSvc.assignTruck(transport, s3.id, { containerIds: [k4.id], truckRegistration: 'T 482 DKL', driverUserId: juma.id, driverName: juma.name, idempotencyKey: `seed-assign-3-${now.getTime()}` });
  await record(juma, s3.id, 'loaded', at(-5 * DAY), { containerId: k4.id, data: { sealNumber: 'TZ4401177' } });
  await record(ops, s3.id, 'gate_out', at(-5 * DAY + 3 * HOUR), { containerId: k4.id });
  await record(juma, s3.id, 'arrived', at(-2 * DAY - 3 * HOUR), { containerId: k4.id });
  await record(juma, s3.id, 'delivered', at(-2 * DAY), { containerId: k4.id, data: { receivedBy: 'Store manager, MAS Mwanza' } });
  await ownerDb.execute(sql`update containers set return_due_at = ${at(20 * HOUR)} where id = ${k4.id}`);
  const inv = await financeSvc.create(finance, {
    organizationId: mas.id,
    shipmentIds: [s3.id],
    currency: 'TZS',
    issueDate: at(-2 * DAY),
    dueDate: at(12 * DAY),
    lines: [
      { description: 'Clearing and documentation', amount: '1200000' },
      { description: 'Port handling', amount: '950000' },
      { description: 'Transport Dar es Salaam to Mwanza', amount: '2700000' },
    ],
    tax: '873000',
  });
  const paid = await financeSvc.recordPayment(finance, inv.id, { amount: '2000000', paidAt: at(-1 * DAY), method: 'mobile_money', transactionReference: 'MPESA 9KQ2X71' });
  await financeSvc.verifyPayment(finance, paid.id);
  await financeSvc.recordPayment(finance, inv.id, { amount: '1500000', paidAt: at(-5 * HOUR), method: 'bank_transfer', transactionReference: 'CRDB TT2610294' });

  // 4. Registered, waiting for the packing list.
  const s4 = await shipmentsSvc.create(ops, {
    organizationId: mas.id,
    blNumber: 'DAR0490031',
    vesselName: 'MV Kilwa Bay',
    originPort: 'Dar es Salaam',
    destinationCountry: 'Tanzania',
    destinationCity: 'Mwanza',
    plannedVesselArrival: at(3 * DAY),
    currentEta: at(6 * DAY),
    routeCode: 'DAR-MWZ',
    containers: [{ containerNumber: 'MSCU4821211' }, { containerNumber: 'MSCU4821232' }],
  });
  await record(ops, s4.id, 'documents_missing', at(-1 * DAY), { data: { document: 'packing list' }, notes: 'Please send it by Monday.' });

  await financeSvc.create(finance, {
    organizationId: khl.id,
    shipmentIds: [s1.id],
    currency: 'USD',
    dueDate: at(2 * DAY),
    lines: [
      { description: 'Clearing and documentation', amount: '850.00' },
      { description: 'Port handling', amount: '640.00' },
      { description: 'Transport Dar es Salaam to Kigali, 2 x 40ft', amount: '1940.00' },
    ],
    tax: '0',
  });

  await workerTick(appDb, new LogSender({ quiet: true }));
  await periodicTick(appDb);
  return { ops, agent, transport, finance, juma, hamisi, clients: { khl, mas }, shipments: { s1, s2, s3, s4 } };
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed production.');
  const ownerUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  if (!ownerUrl || !appUrl) throw new Error('DATABASE_URL and APP_DATABASE_URL are required');
  await runMigrations(ownerUrl);
  const owner = createDb(ownerUrl);
  await owner.db.execute(sql`alter role ngb_app password 'ngb_app'`);
  const app = createDb(appUrl);
  await seed(owner.db, app.db);
  await owner.pool.end();
  await app.pool.end();
  console.log(`Seeded. Sign in as ops@ngb.test, agent@ngb.test, juma@ngb.test, finance@ngb.test or aline@khl.test with "${SEED_PASSWORD}".`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
