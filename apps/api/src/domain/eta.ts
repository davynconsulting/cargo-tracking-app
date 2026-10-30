// FRS 7.1: an ETA change is only worth a message above a threshold.
// Proposed default: more than 2 hours for same-day deliveries, more than 6 hours otherwise.

export interface EtaThresholds {
  sameDayHours: number;
  otherHours: number;
}

export const DEFAULT_ETA_THRESHOLDS: EtaThresholds = { sameDayHours: 2, otherHours: 6 };

const HOUR = 3_600_000;

/** "Same day" is read as the new ETA falling within 24 hours of now. */
export function isMaterialEtaChange(
  previous: Date | null,
  next: Date,
  now: Date,
  thresholds: EtaThresholds = DEFAULT_ETA_THRESHOLDS,
): { material: boolean; deltaHours: number; thresholdHours: number } {
  const sameDay = next.getTime() - now.getTime() <= 24 * HOUR;
  const thresholdHours = sameDay ? thresholds.sameDayHours : thresholds.otherHours;
  if (!previous) return { material: true, deltaHours: 0, thresholdHours };
  const deltaHours = Math.abs(next.getTime() - previous.getTime()) / HOUR;
  return { material: deltaHours > thresholdHours, deltaHours, thresholdHours };
}
