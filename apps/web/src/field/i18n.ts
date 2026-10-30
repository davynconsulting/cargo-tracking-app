import { useSyncExternalStore } from 'react';

// Swahili strings are a first draft and need review by a native speaker before drivers use them.
const en = {
  appTitle: 'NGB Driver',
  signIn: 'Driver sign in',
  jobs: 'My trips',
  sent: 'Sent',
  noJobs: 'No trips assigned to you right now.',
  truck: 'Truck',
  to: 'To',
  border: 'Border',
  record: 'Record',
  confirm: 'Send update',
  cancel: 'Cancel',
  happenedAt: 'When did it happen?',
  happenedHint: 'Set to the moment you tapped. Change it if this happened earlier.',
  seal: 'Seal number',
  borderName: 'Which border?',
  receivedBy: 'Received by (name)',
  depot: 'Empty depot',
  notes: 'Notes (optional)',
  photo: 'Photo (optional)',
  photoPod: 'Photo of signed delivery note',
  queued: 'Saved. It will send when you have signal.',
  sentOk: 'Update saved. Sending now.',
  waiting: 'Waiting to send',
  sending: 'Sending…',
  failed: 'Not accepted',
  retry: 'Try again',
  discard: 'Remove',
  problem: 'Report a problem',
  problemType: 'What happened?',
  problemDetails: 'Details',
  problemSent: 'Problem reported. Operations will contact you.',
  offlineProblem: 'You need signal to report a problem. Call operations if it is urgent.',
  recent: 'Recent updates',
  queueCount: (n: number) => `${n} update${n === 1 ? '' : 's'} waiting to send`,
  blocked: 'Not yet:',
  delay: 'Delay',
  truckIssue: 'Truck breakdown or loading missed',
  discrepancy: 'Seal damaged or cargo discrepancy',
  other: 'Other',
  language: 'Kiswahili',
  signOut: 'Sign out',
  nothingYet: 'Nothing for you to record yet.',
  waitGateOut: 'Waiting for gate-out at the port. The office records it once customs release is confirmed.',
};
type Strings = typeof en;

const sw: Strings = {
  appTitle: 'NGB Dereva',
  signIn: 'Ingia kama dereva',
  jobs: 'Safari zangu',
  sent: 'Zilizotumwa',
  noJobs: 'Hakuna safari uliyopangiwa sasa hivi.',
  truck: 'Lori',
  to: 'Kwenda',
  border: 'Mpaka',
  record: 'Rekodi',
  confirm: 'Tuma taarifa',
  cancel: 'Ghairi',
  happenedAt: 'Ilitokea lini?',
  happenedHint: 'Imewekwa muda uliobonyeza. Badilisha kama ilitokea mapema.',
  seal: 'Namba ya lakiri (seal)',
  borderName: 'Mpaka gani?',
  receivedBy: 'Imepokelewa na (jina)',
  depot: 'Depo ya kontena tupu',
  notes: 'Maelezo (si lazima)',
  photo: 'Picha (si lazima)',
  photoPod: 'Picha ya hati ya kupokea iliyosainiwa',
  queued: 'Imehifadhiwa. Itatumwa ukipata mtandao.',
  sentOk: 'Taarifa imehifadhiwa. Inatumwa sasa.',
  waiting: 'Inasubiri kutumwa',
  sending: 'Inatuma…',
  failed: 'Haikukubaliwa',
  retry: 'Jaribu tena',
  discard: 'Ondoa',
  problem: 'Ripoti tatizo',
  problemType: 'Nini kimetokea?',
  problemDetails: 'Maelezo',
  problemSent: 'Tatizo limeripotiwa. Ofisi itawasiliana nawe.',
  offlineProblem: 'Unahitaji mtandao kuripoti tatizo. Piga simu ofisini kama ni dharura.',
  recent: 'Taarifa za karibuni',
  queueCount: (n: number) => `Taarifa ${n} zinasubiri kutumwa`,
  blocked: 'Bado:',
  delay: 'Kuchelewa',
  truckIssue: 'Lori limeharibika au upakiaji umekosekana',
  discrepancy: 'Lakiri imeharibika au mzigo una tofauti',
  other: 'Mengineyo',
  language: 'English',
  signOut: 'Toka',
  nothingYet: 'Hakuna cha kurekodi kwa sasa.',
  waitGateOut: 'Inasubiri kutoka bandarini. Ofisi itarekodi baada ya forodha kuruhusu.',
};

const KEY = 'ngb.field.lang';
const listeners = new Set<() => void>();
function current(): 'en' | 'sw' {
  try {
    return localStorage.getItem(KEY) === 'sw' ? 'sw' : 'en';
  } catch {
    return 'en';
  }
}

export function toggleLanguage() {
  localStorage.setItem(KEY, current() === 'en' ? 'sw' : 'en');
  listeners.forEach((fn) => fn());
}

export function useStrings(): Strings & { lang: 'en' | 'sw' } {
  const lang = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
  );
  return { ...(lang === 'sw' ? sw : en), lang };
}

/** Milestone button labels drivers see. */
export const MILESTONE_SW: Record<string, string> = {
  loaded: 'Kontena limepakiwa',
  gate_out: 'Limetoka bandarini',
  checkpoint_passed: 'Kituo cha ukaguzi kimepitwa',
  border_arrived: 'Limefika mpakani',
  border_crossed: 'Limevuka mpaka',
  arrived: 'Limefika mahali',
  delivered: 'Limekabidhiwa',
  empty_returned: 'Kontena tupu limerudishwa',
};
