import { checkContainerNumber } from './container-number';
import { isMaterialEtaChange } from './eta';
import { checkNewPayment, fromMinor, invoiceBalance, reminderStage, toMinor } from './money';
import { channelsFor, dedupeKey, renderTemplate } from './notifications';
import { ContainerState, closureChecks, deriveOverallStatus, planTransition, ShipmentState } from './workflow';

const HOUR = 3_600_000;
const ship = (over: Partial<ShipmentState> = {}): ShipmentState => ({
  docsStatus: 'complete',
  customsStatus: 'not_started',
  vesselArrivedAt: new Date('2026-10-20T08:00:00Z'),
  closedAt: null,
  ...over,
});
const ctr = (journey: ContainerState['journey'], returnStatus: ContainerState['returnStatus'] = 'not_due'): ContainerState => ({ journey, returnStatus });

describe('ISO 6346 container numbers', () => {
  it('accepts a valid number and normalises spacing', () => {
    expect(checkContainerNumber('csqu 305438-3')).toEqual({ valid: true, value: 'CSQU3054383' });
  });
  it('rejects a wrong check digit and says which digit is right', () => {
    const r = checkContainerNumber('CSQU3054384');
    expect(r.valid).toBe(false);
    expect(!r.valid && r.reason).toBe('Check digit should be 3.');
  });
  it('rejects the wrong shape', () => {
    expect(checkContainerNumber('CSQ3054383').valid).toBe(false);
  });
});

describe('status transitions (FRS 4, AC-04)', () => {
  it('allows the next step for a permitted role', () => {
    const r = planTransition({ type: 'loaded', role: 'driver', shipment: ship(), container: ctr('truck_assigned') });
    expect(r).toEqual({ ok: true, from: 'truck_assigned', to: 'loaded', overridden: false });
  });
  it('blocks out-of-order steps', () => {
    const r = planTransition({ type: 'arrived', role: 'ops_manager', shipment: ship(), container: ctr('loaded') });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('invalid_transition');
  });
  it('blocks roles the spec does not allow', () => {
    const r = planTransition({ type: 'customs_released', role: 'driver', shipment: ship({ customsStatus: 'submitted' }) });
    expect(!r.ok && r.code).toBe('forbidden');
  });
  it('blocks gate-out until customs release, overridable only by an ops manager with a reason', () => {
    const base = { type: 'gate_out' as const, shipment: ship({ customsStatus: 'submitted' }), container: ctr('loaded') };
    const agent = planTransition({ ...base, role: 'clearing_agent', overrideReason: 'urgent' });
    expect(agent).toMatchObject({ ok: false, code: 'guard_failed', overridable: false });
    const noReason = planTransition({ ...base, role: 'ops_manager' });
    expect(noReason).toMatchObject({ ok: false, code: 'guard_failed', overridable: true });
    const withReason = planTransition({ ...base, role: 'ops_manager', overrideReason: 'Release confirmed by phone, paper copy follows' });
    expect(withReason).toEqual({ ok: true, from: 'loaded', to: 'in_transit', overridden: true });
  });
  it('requires delivery before empty return', () => {
    const r = planTransition({ type: 'empty_returned', role: 'driver', shipment: ship(), container: ctr('arrived', 'not_due') });
    expect(r.ok).toBe(false);
  });
  it('refuses any milestone on a closed shipment', () => {
    const r = planTransition({ type: 'documents_complete', role: 'ops_manager', shipment: ship({ docsStatus: 'missing', closedAt: new Date() }) });
    expect(!r.ok && r.code).toBe('closed');
  });
});

describe('derived overall status', () => {
  it('follows the least advanced container and counts the ones ahead', () => {
    const r = deriveOverallStatus(ship({ customsStatus: 'released' }), [ctr('in_transit'), ctr('loaded')]);
    expect(r).toEqual({ status: 'loaded', ahead: 1, total: 2 });
  });
  it('separates delivery from empty return (AC-14)', () => {
    expect(deriveOverallStatus(ship(), [ctr('delivered', 'awaiting_return')]).status).toBe('delivered');
    expect(deriveOverallStatus(ship(), [ctr('delivered', 'returned')]).status).toBe('operationally_complete');
  });
  it('distinguishes port processing from ready for dispatch', () => {
    expect(deriveOverallStatus(ship({ customsStatus: 'inspection' }), [ctr('discharged')]).status).toBe('port_processing');
    expect(deriveOverallStatus(ship({ customsStatus: 'released' }), [ctr('discharged')]).status).toBe('ready_for_dispatch');
  });
  it('shows missing documents before arrival', () => {
    expect(deriveOverallStatus(ship({ docsStatus: 'missing', vesselArrivedAt: null }), [ctr('at_sea')]).status).toBe('awaiting_documents');
  });
});

describe('closure checks (AC-15)', () => {
  it('lists what is still open', () => {
    const checks = closureChecks({ containers: [ctr('delivered', 'awaiting_return')], openExceptions: 0, financeSettled: false });
    expect(checks.filter((c) => !c.passed).map((c) => c.key)).toEqual(['returned', 'finance']);
  });
});

describe('ETA threshold (FRS 7.1)', () => {
  const now = new Date('2026-10-30T06:00:00Z');
  it('treats a 3 hour move two days out as immaterial', () => {
    const prev = new Date(now.getTime() + 48 * HOUR);
    expect(isMaterialEtaChange(prev, new Date(prev.getTime() + 3 * HOUR), now).material).toBe(false);
  });
  it('treats a 3 hour move on a same-day delivery as material', () => {
    const prev = new Date(now.getTime() + 6 * HOUR);
    expect(isMaterialEtaChange(prev, new Date(prev.getTime() + 3 * HOUR), now)).toMatchObject({ material: true, thresholdHours: 2 });
  });
  it('treats a 7 hour move as material', () => {
    const prev = new Date(now.getTime() + 48 * HOUR);
    expect(isMaterialEtaChange(prev, new Date(prev.getTime() + 7 * HOUR), now).material).toBe(true);
  });
});

describe('money (FRS 9)', () => {
  it('round-trips decimal strings without floating point', () => {
    expect(fromMinor(toMinor('0.10') + toMinor('0.20'))).toBe('0.30');
  });
  it('counts only verified payments toward the balance', () => {
    const due = new Date('2026-11-10T00:00:00Z');
    const b = invoiceBalance(
      { totalAmount: '5723000.00', status: 'issued', disputed: false, dueDate: due, creditApproved: false },
      [
        { amount: '2000000', verified: true },
        { amount: '1500000', verified: false },
      ],
      new Date('2026-10-30T00:00:00Z'),
    );
    expect(fromMinor(b.balance)).toBe('3723000.00');
    expect(fromMinor(b.pending)).toBe('1500000.00');
    expect(b.status).toBe('partially_paid');
  });
  it('refuses a payment that would overpay, counting unverified payments', () => {
    expect(checkNewPayment(toMinor('100'), toMinor('60'), toMinor('50'))).toMatch(/below zero/);
    expect(checkNewPayment(toMinor('100'), toMinor('60'), toMinor('40'))).toBeNull();
  });
  it('picks one reminder stage at a time and none while disputed', () => {
    const due = new Date('2026-11-10T00:00:00Z');
    expect(reminderStage('issued', due, new Date('2026-11-01T00:00:00Z'))).toBeNull();
    expect(reminderStage('issued', due, new Date('2026-11-08T00:00:00Z'))).toBe('due_soon');
    expect(reminderStage('overdue', due, new Date('2026-11-12T00:00:00Z'))).toBe('overdue');
    expect(reminderStage('overdue', due, new Date('2026-11-20T00:00:00Z'))).toBe('overdue_7d');
    expect(reminderStage('disputed', due, new Date('2026-11-20T00:00:00Z'))).toBeNull();
  });
});

describe('notification rules (FRS 7)', () => {
  it('sends only on channels the contact opted into', () => {
    expect(channelsFor('gate_out', { whatsappOptIn: true, pushEnabled: false, email: null, emailOptIn: false })).toEqual(['whatsapp']);
    expect(channelsFor('gate_out', { whatsappOptIn: false, pushEnabled: false, email: 'a@b.c', emailOptIn: true })).toEqual([]);
    expect(channelsFor('invoice_issued', { whatsappOptIn: false, pushEnabled: false, email: 'a@b.c', emailOptIn: true })).toEqual(['email']);
  });
  it('uses the contact language when a template exists, and English otherwise', () => {
    expect(renderTemplate('delivered', 'sw', { ref: 'R', container: 'C' }).locale).toBe('sw');
    expect(renderTemplate('arrived', 'sw', { ref: 'R', container: 'C', time: 'T' }).locale).toBe('en');
  });
  it('builds the dedupe key from event, recipient, channel and template', () => {
    expect(dedupeKey('e1', 'p1', 'whatsapp', 'gate_out')).toBe('e1:p1:whatsapp:gate_out');
  });
});
