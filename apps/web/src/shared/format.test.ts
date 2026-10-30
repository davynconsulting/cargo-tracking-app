import { formatDateTime, formatMoney, milestoneLabel, overallLabel } from './format';

describe('formatting', () => {
  it('formats money from decimal strings without floating point', () => {
    expect(formatMoney('5723000.00', 'TZS')).toBe('TZS 5,723,000.00');
    expect(formatMoney('0.1', 'USD')).toBe('USD 0.10');
    expect(formatMoney('-1250', 'USD')).toBe('-USD 1,250.00');
  });
  it('shows how many containers are ahead of the overall status', () => {
    expect(overallLabel({ status: 'loaded', ahead: 1, total: 2 })).toBe('Loaded (1 of 2 containers ahead)');
    expect(overallLabel({ status: 'operationally_complete', ahead: 0, total: 1 })).toBe('Empty returned');
  });
  it('shows times in the client timezone', () => {
    expect(formatDateTime('2026-10-30T07:00:00Z', 'Africa/Kigali')).toBe('30 Oct 2026, 09:00');
    expect(formatDateTime('2026-10-30T07:00:00Z', 'Africa/Dar_es_Salaam')).toBe('30 Oct 2026, 10:00');
  });
  it('labels milestones and system events', () => {
    expect(milestoneLabel('gate_out')).toBe('Gate-out');
    expect(milestoneLabel('shipment_registered')).toBe('Shipment registered');
  });
});
