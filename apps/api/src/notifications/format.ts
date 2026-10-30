import { fromMinor, toMinor } from '../domain/money';

export function formatTime(date: Date | null, timeZone: string): string {
  if (!date) return 'to be confirmed';
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${text} ${zoneLabel(timeZone)}`;
}

function zoneLabel(timeZone: string): string {
  if (['Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Bujumbura'].includes(timeZone)) return 'CAT';
  if (['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala'].includes(timeZone)) return 'EAT';
  return timeZone;
}

/** Currencies without minor units in daily use are shown without decimals. */
export function formatMoney(amount: string, currency: string): string {
  const noDecimals = ['TZS', 'RWF', 'UGX'].includes(currency);
  const value = noDecimals ? fromMinor(toMinor(amount)).split('.')[0] : fromMinor(toMinor(amount));
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${fraction ? `${grouped}.${fraction}` : grouped}`;
}
