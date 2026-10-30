// ISO 6346 container numbers: 3-letter owner code, category letter (U, J or Z),
// 6-digit serial and a check digit computed from the first 10 characters.

const LETTER_VALUES: Record<string, number> = (() => {
  const values: Record<string, number> = {};
  let n = 10;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (n % 11 === 0) n++; // multiples of 11 are skipped by the standard
    values[ch] = n++;
  }
  return values;
})();

const PATTERN = /^[A-Z]{3}[UJZ]\d{7}$/;

export function normalizeContainerNumber(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function containerCheckDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i];
    const value = /\d/.test(ch) ? Number(ch) : LETTER_VALUES[ch];
    sum += value * 2 ** i;
  }
  return (sum % 11) % 10;
}

export type ContainerNumberCheck =
  | { valid: true; value: string }
  | { valid: false; value: string; reason: string };

export function checkContainerNumber(raw: string): ContainerNumberCheck {
  const value = normalizeContainerNumber(raw);
  if (!PATTERN.test(value)) {
    return { valid: false, value, reason: 'Expected 4 letters ending in U, J or Z, then 7 digits, e.g. CSQU3054383.' };
  }
  const expected = containerCheckDigit(value.slice(0, 10));
  if (expected !== Number(value[10])) {
    return { valid: false, value, reason: `Check digit should be ${expected}.` };
  }
  return { valid: true, value };
}
