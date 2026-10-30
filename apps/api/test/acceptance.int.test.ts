// FRS section 12 acceptance criteria, run against a real PostgreSQL database with the
// restricted application role, so row-level security is part of what is tested.

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { withContext } from '../src/db/client';
import { containerCheckDigit } from '../src/domain/container-number';
import { contacts, exceptions, milestoneEvents, notifications, outboxEvents } from '../src/db/schema';
import { runSlaChecks } from '../src/exceptions/sla-monitor';
import { periodicTick, workerTick } from '../src/worker';
import { describeDb, Harness, startHarness } from './harness';

const HOUR = 3_600_000;
const key = () => randomUUID();
const containerNo = (first10: string) => first10 + containerCheckDigit(first10);

describeDb('acceptance criteria', () => {
  let h: Harness;
  let ops: string, agent: string, transport: string, finance: string, juma: string, aline: string, baraka: string;

  beforeAll(async () => {
    h = await startHarness();
    [ops, agent, transport, finance, juma, aline, baraka] = await Promise.all(
      ['ops@ngb.test', 'agent@ngb.test', 'transport@ngb.test', 'finance@ngb.test', 'juma@ngb.test', 'aline@khl.test', 'baraka@mas.test'].map((e) => h.token(e)),
    );
  }, 60_000);
  afterAll(() => h?.close());

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (token: string, url: string, body: object) => h.http.post(url).set(auth(token)).send(body);
  const get = (token: string, url: string) => h.http.get(url).set(auth(token));

  it('AC-01 creates a shipment with a unique reference and rejects bad or duplicate input', async () => {
    const body = {
      organizationId: h.data.clients.khl.id,
      blNumber: 'TEST-BL-001',
      originPort: 'Dar es Salaam',
      destinationCountry: 'Rwanda',
      destinationCity: 'Kigali',
      containers: [{ containerNumber: 'CSQU3054383' }],
    };
    const created = await post(ops, '/shipments', body).expect(201);
    expect(created.body.reference).toMatch(/^NGB-\d{4}-\d{5}$/);

    const dupBl = await post(ops, '/shipments', { ...body, containers: [{ containerNumber: containerNo('TGHU990001') }] }).expect(422);
    expect(dupBl.body.code).toBe('duplicate_bl');

    const badDigit = await post(ops, '/shipments', { ...body, blNumber: 'TEST-BL-002', containers: [{ containerNumber: 'CSQU3054384' }] }).expect(422);
    expect(badDigit.body.problems[0]).toMatch(/Check digit should be 3/);

    const inUse = await post(ops, '/shipments', { ...body, blNumber: 'TEST-BL-003' }).expect(422);
    expect(inUse.body.code).toBe('container_in_use');

    await post(finance, '/shipments', { ...body, blNumber: 'TEST-BL-004' }).expect(403);
  });

  it('AC-02 tracks each container of a shipment separately', async () => {
    const res = await get(ops, `/shipments/${h.data.shipments.s1.id}`).expect(200);
    const journeys = res.body.containers.map((c: { journey: string }) => c.journey).sort();
    expect(journeys).toEqual(['in_transit', 'loaded']);
    expect(res.body.overall).toEqual({ status: 'loaded', ahead: 1, total: 2 });
    const perContainer = new Set(res.body.events.filter((e: { containerId: string | null }) => e.containerId).map((e: { containerId: string }) => e.containerId));
    expect(perContainer.size).toBe(2);
  });

  it('AC-03 stores event time, recorded time, user and source; corrections append and the ledger cannot be edited', async () => {
    const s = h.data.shipments.s2;
    const eventAt = new Date(Date.now() - 2 * HOUR).toISOString();
    const res = await post(agent, `/shipments/${s.id}/milestones`, { type: 'customs_inspection', eventAt, idempotencyKey: key() }).expect(201);
    const e = res.body.event;
    expect(e).toMatchObject({ milestoneType: 'customs_inspection', previousStatus: 'submitted', newStatus: 'inspection', source: 'staff', recordedBy: h.data.agent.id });
    expect(new Date(e.eventAt).toISOString()).toBe(eventAt);
    expect(new Date(e.recordedAt).getTime()).toBeGreaterThan(new Date(eventAt).getTime());

    const fixed = new Date(Date.now() - 3 * HOUR).toISOString();
    const corr = await post(ops, `/events/${e.id}/corrections`, { eventAt: fixed, reason: 'Agent logged the wrong hour' }).expect(201);
    expect(corr.body).toMatchObject({ milestoneType: 'correction', correctionOfEventId: e.id, previousStatus: eventAt, newStatus: fixed });
    await post(agent, `/events/${e.id}/corrections`, { eventAt: fixed, reason: 'no' }).expect(403);

    const detail = await get(ops, `/shipments/${s.id}`).expect(200);
    const original = detail.body.events.find((x: { id: string }) => x.id === e.id);
    expect(original.corrected).toBe(true);
    expect(new Date(original.eventAt).toISOString()).toBe(eventAt);

    const dbError = (p: Promise<unknown>) => p.then(() => 'no error', (err) => String(err.cause?.message ?? err.message));
    expect(
      await dbError(withContext(h.appDb, { kind: 'staff' }, (tx) => tx.update(milestoneEvents).set({ notes: 'tampered' }).where(eq(milestoneEvents.id, e.id)))),
    ).toMatch(/permission denied/);
    expect(await dbError(h.ownerDb.delete(milestoneEvents).where(eq(milestoneEvents.id, e.id)))).toMatch(/append-only/);
  });

  it('AC-04 blocks invalid transitions and gate-out before customs release unless an ops manager overrides with a reason', async () => {
    const s = h.data.shipments.s2;
    const [c] = s.containers;
    const early = await post(ops, `/shipments/${s.id}/milestones`, { type: 'arrived', containerId: c.id, idempotencyKey: key() }).expect(422);
    expect(early.body.code).toBe('invalid_transition');

    await post(transport, `/shipments/${s.id}/assignments`, { containerIds: [c.id], truckRegistration: 'KCX 221Q', driverName: 'Otieno', idempotencyKey: key() }).expect(201);
    await post(transport, `/shipments/${s.id}/milestones`, { type: 'loaded', containerId: c.id, data: { sealNumber: 'KE1' }, idempotencyKey: key() }).expect(201);

    const blocked = await post(agent, `/shipments/${s.id}/milestones`, { type: 'gate_out', containerId: c.id, idempotencyKey: key() }).expect(422);
    expect(blocked.body).toMatchObject({ code: 'guard_failed', overridable: false });
    const agentOverride = await post(agent, `/shipments/${s.id}/milestones`, { type: 'gate_out', containerId: c.id, overrideReason: 'please', idempotencyKey: key() }).expect(422);
    expect(agentOverride.body.code).toBe('guard_failed');

    const ok = await post(ops, `/shipments/${s.id}/milestones`, {
      type: 'gate_out',
      containerId: c.id,
      overrideReason: 'Release confirmed by KRA officer by phone; paper copy follows',
      idempotencyKey: key(),
    }).expect(201);
    expect(ok.body.event.overrideReason).toMatch(/confirmed by KRA/);
    const audit = await h.ownerDb.execute(sql`select action from audit_log where entity_id = ${ok.body.event.id}`);
    expect(audit.rows).toEqual([{ action: 'milestone.override' }]);
  });

  it('AC-05 isolates clients from each other in the API and in the database', async () => {
    const theirs = h.data.shipments.s3.id; // belongs to Mwanza Agro
    await get(aline, `/shipments/${theirs}`).expect(404);
    const list = await get(aline, '/shipments').expect(200);
    expect(list.body.every((s: { client: { code: string } }) => s.client.code === 'KHL')).toBe(true);
    const inv = await get(aline, '/invoices').expect(200);
    expect(inv.body.every((i: { organizationId: string }) => i.organizationId === h.data.clients.khl.id)).toBe(true);
    const theirInvoice = (await get(baraka, '/invoices').expect(200)).body[0];
    await get(aline, `/invoices/${theirInvoice.id}`).expect(404);
    const msgs = await get(aline, '/notifications').expect(200);
    expect(msgs.body.length).toBeGreaterThan(0);
    expect(msgs.body.every((n: { recipient: string }) => ['Aline Uwase', 'Eric Mugisha'].includes(n.recipient))).toBe(true);
    await post(aline, `/shipments/${theirs}/milestones`, { type: 'empty_returned', containerId: h.data.shipments.s3.containers[0].id, idempotencyKey: key() }).expect(403);

    // Even a query with no tenant filter only sees the caller's rows.
    const rows = await withContext(h.appDb, { kind: 'client', userId: randomUUID(), orgId: h.data.clients.khl.id }, (tx) =>
      tx.execute(sql`select distinct organization_id from milestone_events`),
    );
    expect(rows.rows).toEqual([{ organization_id: h.data.clients.khl.id }]);
  });

  it('AC-05 also hides internal detail from clients', async () => {
    const res = await get(aline, `/shipments/${h.data.shipments.s1.id}`).expect(200);
    expect(res.body.assignedOpsUserId).toBeUndefined();
    const assigned = res.body.containers.find((c: { assignment: unknown }) => c.assignment);
    expect(assigned.assignment).toEqual({ truckRegistration: expect.any(String) });
    expect(JSON.stringify(res.body.events)).not.toMatch(/driverPhone|recordedBy/);
  });

  it('AC-06/AC-07 sends push and WhatsApp to opted-in contacts only, and logs the result', async () => {
    const s = h.data.shipments.s1;
    const k2 = s.containers.find((c) => c.containerNumber === 'MSCU4821206')!;
    const res = await post(agent, `/shipments/${s.id}/milestones`, { type: 'gate_out', containerId: k2.id, idempotencyKey: key() }).expect(201);
    await workerTick(h.appDb, h.sender);
    const rows = await h.ownerDb
      .select({ channel: notifications.channel, status: notifications.status, name: contacts.name, body: notifications.body })
      .from(notifications)
      .innerJoin(contacts, eq(contacts.id, notifications.recipientContactId))
      .where(eq(notifications.sourceId, res.body.event.id));
    expect(rows.map((r) => `${r.name}:${r.channel}:${r.status}`).sort()).toEqual(['Aline Uwase:push:sent', 'Aline Uwase:whatsapp:sent']);
    expect(rows[0].body).toMatch(/left the port on .* CAT/);
  });

  it('AC-08 never sends twice: replays and retried submissions are deduplicated', async () => {
    const s = h.data.shipments.s1;
    const k1 = s.containers.find((c) => c.containerNumber === 'MSCU4821171')!;
    const idem = key();
    const first = await post(juma, `/shipments/${s.id}/milestones`, { type: 'checkpoint_passed', containerId: k1.id, idempotencyKey: idem }).expect(403);
    expect(first.body.message).toMatch(/not on your truck/);

    const body = { type: 'border_crossed', containerId: k1.id, data: { border: 'Rusumo' }, idempotencyKey: idem };
    const a = await post(ops, `/shipments/${s.id}/milestones`, body).expect(201);
    const b = await post(ops, `/shipments/${s.id}/milestones`, body).expect(201);
    expect(b.body).toMatchObject({ duplicate: true, event: { id: a.body.event.id } });

    await workerTick(h.appDb, h.sender);
    const before = await h.ownerDb.select().from(notifications).where(eq(notifications.sourceId, a.body.event.id));
    // Replay the same outbox event, as if the worker crashed after sending.
    await h.ownerDb.insert(outboxEvents).values({ organizationId: h.data.clients.khl.id, kind: 'milestone.recorded', payload: { eventId: a.body.event.id } });
    await workerTick(h.appDb, h.sender);
    const after = await h.ownerDb.select().from(notifications).where(eq(notifications.sourceId, a.body.event.id));
    expect(after.length).toBe(before.length);
    expect(after.length).toBe(2);
  });

  it('AC-09 keeps ETA history and notifies only for material changes', async () => {
    const s = h.data.shipments.s1;
    const detail = await get(ops, `/shipments/${s.id}`).expect(200);
    const current = new Date(detail.body.currentEta).getTime();

    const small = await post(ops, `/shipments/${s.id}/eta`, { eta: new Date(current + 3 * HOUR), reason: 'Slow convoy' }).expect(201);
    expect(small.body).toMatchObject({ notified: false, thresholdHours: 6 });
    const big = await post(ops, `/shipments/${s.id}/eta`, { eta: new Date(current + 15 * HOUR), reason: 'Border queue at Rusumo' }).expect(201);
    expect(big.body.notified).toBe(true);

    const clientView = await get(aline, `/shipments/${s.id}`).expect(200);
    expect(clientView.body.etaHistory).toHaveLength(1);
    expect(clientView.body.etaHistory[0].reason).toBe('Border queue at Rusumo');
    const staffView = await get(ops, `/shipments/${s.id}`).expect(200);
    expect(staffView.body.etaHistory.length).toBeGreaterThanOrEqual(2);

    await workerTick(h.appDb, h.sender);
    const sent = await h.ownerDb.select().from(notifications).where(and(eq(notifications.template, 'eta_changed'), eq(notifications.shipmentId, s.id)));
    expect(sent.map((n) => n.body)).toEqual(expect.arrayContaining([expect.stringMatching(/Reason: Border queue at Rusumo/)]));
    expect(sent).toHaveLength(2); // push + WhatsApp for one material change
  });

  it('AC-10 puts silent containers in the operations queue with owner, reason and next action', async () => {
    const opened = await runSlaChecks(h.appDb, new Date(Date.now() + 30 * HOUR));
    expect(opened.length).toBeGreaterThan(0);
    const queue = await get(ops, '/exceptions?ownerRole=transport').expect(200);
    const silent = queue.body.find(
      (r: { exception: { type: string; nextAction: string } }) => r.exception.type === 'transit_update_missing' && r.exception.nextAction.includes('Hamisi'),
    );
    expect(silent.exception.reason).toMatch(/No update on .* for \d+ h/);
    expect(silent.exception.nextAction).toMatch(/Call Hamisi Said on \+255682310774/);
    expect(silent.lastEventAt).toBeTruthy();

    const again = await runSlaChecks(h.appDb, new Date(Date.now() + 31 * HOUR));
    expect(again.filter((id) => id === silent.exception.id)).toHaveLength(0);
  });

  it('AC-11/AC-12 records partial payments; only finance can verify, and only verified payments reduce the balance', async () => {
    const inv = (await get(finance, '/invoices').expect(200)).body.find((i: { currency: string }) => i.currency === 'TZS');
    expect(inv.totals).toMatchObject({ total: '5723000.00', paid: '2000000.00', pendingVerification: '1500000.00', balance: '3723000.00' });
    expect(inv.status).toBe('partially_paid');

    const pending = inv.payments.find((p: { verified: boolean }) => !p.verified);
    await post(ops, `/payments/${pending.id}/verify`, {}).expect(403);
    await post(baraka, `/payments/${pending.id}/verify`, {}).expect(403);
    const verified = await post(finance, `/payments/${pending.id}/verify`, {}).expect(201);
    expect(verified.body).toMatchObject({ verifiedBy: h.data.finance.id, receiptNumber: expect.stringMatching(/^RCT-/) });
    await post(finance, `/payments/${pending.id}/verify`, {}).expect(422);

    const over = await post(finance, `/invoices/${inv.id}/payments`, { amount: '4000000', paidAt: new Date(), method: 'cash', transactionReference: 'CASH-1' }).expect(422);
    expect(over.body.message).toMatch(/below zero/);
    const after = await get(finance, `/invoices/${inv.id}`).expect(200);
    expect(after.body.totals.balance).toBe('2223000.00');
  });

  it('AC-13 sends each reminder stage once', async () => {
    const usd = (await get(finance, '/invoices').expect(200)).body.find((i: { currency: string }) => i.currency === 'USD');
    // The seed's periodic tick already sent the due-soon reminder for this invoice.
    expect(usd.reminders.map((r: { stage: string }) => r.stage)).toEqual(['due_soon']);
    const again = await post(finance, `/invoices/${usd.id}/reminders`, {}).expect(201);
    expect(again.body).toMatchObject({ sent: false, reason: 'already_sent' });

    const later = new Date(Date.now() + 3 * 24 * HOUR);
    const first = await periodicTick(h.appDb, later);
    const second = await periodicTick(h.appDb, later);
    expect(first.reminders).toEqual(expect.arrayContaining([{ id: usd.id, stage: 'overdue' }]));
    expect(second.reminders.find((r) => r.id === usd.id)).toBeUndefined();
  });

  it('AC-14 keeps delivery and empty return separate', async () => {
    const s = h.data.shipments.s3;
    const [c] = s.containers;
    const before = await get(baraka, `/shipments/${s.id}`).expect(200);
    // An earlier test moved the clock past the return deadline, so it may already be overdue.
    expect(before.body.containers[0].journey).toBe('delivered');
    expect(['awaiting_return', 'return_overdue']).toContain(before.body.containers[0].returnStatus);
    expect(before.body.overall.status).toBe('delivered');

    await post(juma, `/shipments/${s.id}/milestones`, { type: 'empty_returned', containerId: c.id, data: { depot: 'Kurasini empty depot' }, idempotencyKey: key() }).expect(201);
    const after = await get(baraka, `/shipments/${s.id}`).expect(200);
    expect(after.body.containers[0]).toMatchObject({ journey: 'delivered', returnStatus: 'returned', returnDepot: 'Kurasini empty depot' });
    expect(after.body.overall.status).toBe('operationally_complete');
  });

  it('AC-15 blocks closure until checks pass, unless an ops manager records an approved exception', async () => {
    const s = h.data.shipments.s4;
    const blocked = await post(ops, `/shipments/${s.id}/close`, {}).expect(422);
    expect(blocked.body.code).toBe('closure_blocked');
    expect(blocked.body.checks.filter((c: { passed: boolean }) => !c.passed).map((c: { key: string }) => c.key)).toEqual(['delivered', 'returned', 'exceptions', 'finance']);
    await post(finance, `/shipments/${s.id}/close`, { overrideReason: 'x' }).expect(403);
    const closed = await post(ops, `/shipments/${s.id}/close`, { overrideReason: 'Client cancelled the order; cargo returned to shipper' }).expect(201);
    expect(closed.body.closeReason).toMatch(/^Approved exception/);
    const late = await post(ops, `/shipments/${s.id}/milestones`, { type: 'documents_complete', idempotencyKey: key() }).expect(422);
    expect(late.body.code).toBe('closed');
  });

  it('AC-16 serves documents through short-lived links issued after an access check', async () => {
    const s = h.data.shipments.s1;
    const pdf = Buffer.from('%PDF-1.7\n% test bill of lading\n');
    const up = await h.http
      .post(`/shipments/${s.id}/documents`)
      .set(auth(ops))
      .field('documentType', 'bill_of_lading')
      .attach('file', pdf, { filename: 'BL DAR0482117.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(up.body.fileStorageKey).toBeUndefined();

    const fake = await h.http
      .post(`/shipments/${s.id}/documents`)
      .set(auth(ops))
      .field('documentType', 'other')
      .attach('file', Buffer.from('MZ not really a pdf'), { filename: 'invoice.pdf', contentType: 'application/pdf' })
      .expect(422);
    expect(fake.body.code).toBe('unsupported_file');

    const link = await get(aline, `/documents/${up.body.id}/link`).expect(200);
    const file = await h.http
      .get(link.body.url)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((file.body as Buffer).toString('latin1')).toContain('%PDF-1.7');

    await get(baraka, `/documents/${up.body.id}/link`).expect(404);
    await h.http.get('/files/not-a-real-token').expect(401);
    const sessionToken = await h.token('aline@khl.test');
    await h.http.get(`/files/${sessionToken}`).expect(401);
  });

  it('AC-18 keeps the milestone through a WhatsApp outage, retries, then fails visibly', async () => {
    h.sender.setWhatsappOutage(true);
    const s = h.data.shipments.s1;
    const k2 = s.containers.find((c) => c.containerNumber === 'MSCU4821206')!;
    const res = await post(ops, `/shipments/${s.id}/milestones`, { type: 'border_crossed', containerId: k2.id, data: { border: 'Rusumo' }, idempotencyKey: key() }).expect(201);
    await workerTick(h.appDb, h.sender);

    const wa = async () =>
      (await h.ownerDb.select().from(notifications).where(and(eq(notifications.sourceId, res.body.event.id), eq(notifications.channel, 'whatsapp'))))[0];
    expect(await wa()).toMatchObject({ status: 'queued', attemptCount: 1, errorCode: 'provider_unavailable' });
    const push = (await h.ownerDb.select().from(notifications).where(and(eq(notifications.sourceId, res.body.event.id), eq(notifications.channel, 'push'))))[0];
    expect(push.status).toBe('sent');

    for (let i = 1; i <= 6; i++) await workerTick(h.appDb, h.sender, new Date(Date.now() + i * 2 * HOUR));
    const failed = await wa();
    expect(failed).toMatchObject({ status: 'failed', attemptCount: 6 });
    const [ex] = await h.ownerDb.select().from(exceptions).where(eq(exceptions.dedupeKey, `notify:${failed.id}`));
    expect(ex).toMatchObject({ type: 'notification_failure', status: 'open' });

    h.sender.setWhatsappOutage(false);
    await post(ops, `/notifications/${failed.id}/retry`, {}).expect(201);
    await workerTick(h.appDb, h.sender);
    expect((await wa()).status).toBe('sent');
  });

  it('lets drivers see and act on their own containers only', async () => {
    const jobs = await get(juma, '/driver/jobs').expect(200);
    expect(jobs.body.map((j: { container: { containerNumber: string } }) => j.container.containerNumber).sort()).toEqual(['MSCU4821206', 'TGHU2290550']);
    await get(juma, `/shipments/${h.data.shipments.s2.id}`).expect(404);
    await get(juma, '/invoices').expect(403);
  });

  it('records consent changes with their source', async () => {
    const [eric] = await h.ownerDb.select().from(contacts).where(eq(contacts.name, 'Eric Mugisha'));
    await h.http.put(`/contacts/${eric.id}/consent`).set(auth(aline)).send({ channel: 'whatsapp', optedIn: true, source: 'Client portal settings' }).expect(200);
    const rows = await h.ownerDb.execute(sql`select channel, opted_in, source from consents where contact_id = ${eric.id}`);
    expect(rows.rows).toEqual([{ channel: 'whatsapp', opted_in: true, source: 'Client portal settings' }]);
    const [mas] = await h.ownerDb.select().from(contacts).where(eq(contacts.name, 'Baraka Mushi'));
    await h.http.put(`/contacts/${mas.id}/consent`).set(auth(aline)).send({ channel: 'whatsapp', optedIn: false, source: 'Client portal settings' }).expect(404);
  });

  it('rejects requests without a valid session', async () => {
    await h.http.get('/shipments').expect(401);
    await h.http.post('/auth/login').send({ email: 'ops@ngb.test', password: 'wrong-password' }).expect(401);
    await h.http.get('/health').expect(200);
  });
});
