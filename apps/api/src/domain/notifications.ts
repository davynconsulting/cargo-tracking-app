// Notification rules from FRS section 7. Messages go only to contacts who opted in,
// in their language when a template exists, and never twice for the same
// event, recipient, channel and template.

export type Channel = 'whatsapp' | 'push' | 'email';

export interface TemplateDef {
  /** Channels used when the contact has opted in. Push is always attempted first. */
  channels: Channel[];
  text: Record<string, (v: Record<string, string>) => string>;
}

// Swahili texts are drafts and need review by a native speaker before launch.
export const TEMPLATES: Record<string, TemplateDef> = {
  shipment_registered: {
    channels: ['push', 'whatsapp'],
    text: {
      en: (v) => `NGB Logistics: shipment ${v.ref} is registered. Containers: ${v.containers}. ${v.origin} to ${v.destination}.`,
    },
  },
  document_missing: {
    channels: ['push', 'whatsapp'],
    text: {
      en: (v) => `Action needed for ${v.ref}: we still need the ${v.document}. ${v.note}`.trim(),
    },
  },
  documents_complete: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: all shipping documents received.` },
  },
  vessel_arrived: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: the vessel arrived at ${v.origin} on ${v.time}.` },
  },
  container_discharged: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: container ${v.container} was discharged on ${v.time}.` },
  },
  customs_update: {
    channels: ['push'],
    text: { en: (v) => `${v.ref}: customs status is now ${v.status}.` },
  },
  customs_released: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: customs release confirmed on ${v.time}.` },
  },
  truck_assigned: {
    channels: ['push', 'whatsapp'],
    // Driver name and phone stay out of client messages unless company policy allows it.
    text: { en: (v) => `${v.ref}: truck ${v.truck} is assigned to container ${v.container}.` },
  },
  container_loaded: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: container ${v.container} was loaded on ${v.time}.` },
  },
  gate_out: {
    channels: ['push', 'whatsapp'],
    text: {
      en: (v) => `${v.ref}: container ${v.container} left the port on ${v.time}. Estimated arrival: ${v.eta}.`,
      sw: (v) => `${v.ref}: kontena ${v.container} limetoka bandarini ${v.time}. Makadirio ya kufika: ${v.eta}.`,
    },
  },
  border_crossed: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: container ${v.container} crossed the border at ${v.place} on ${v.time}.` },
  },
  arrived: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: container ${v.container} arrived at the destination on ${v.time}.` },
  },
  delivered: {
    channels: ['push', 'whatsapp'],
    text: {
      en: (v) => `${v.ref}: container ${v.container} is delivered. Proof of delivery is in your portal.`,
      sw: (v) => `${v.ref}: kontena ${v.container} limefikishwa. Uthibitisho wa kupokea upo kwenye akaunti yako.`,
    },
  },
  empty_returned: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref}: empty container ${v.container} was returned on ${v.time}.` },
  },
  eta_changed: {
    channels: ['push', 'whatsapp'],
    text: {
      en: (v) => `${v.ref}: estimated arrival changed from ${v.previous} to ${v.next}. Reason: ${v.reason}.`,
      sw: (v) => `${v.ref}: muda wa kufika umebadilika kutoka ${v.previous} hadi ${v.next}. Sababu: ${v.reason}.`,
    },
  },
  invoice_issued: {
    channels: ['push', 'whatsapp', 'email'],
    text: { en: (v) => `Invoice ${v.invoice} for ${v.ref}: ${v.amount}, due ${v.due}.` },
  },
  payment_verified: {
    channels: ['push', 'whatsapp', 'email'],
    text: {
      en: (v) => `Payment of ${v.amount} received for invoice ${v.invoice} (reference ${v.reference}). Balance: ${v.balance}.`,
      sw: (v) => `Malipo ya ${v.amount} yamepokelewa kwa ankara ${v.invoice}. Salio: ${v.balance}.`,
    },
  },
  invoice_reminder: {
    channels: ['push', 'whatsapp', 'email'],
    text: { en: (v) => `Reminder: invoice ${v.invoice} has ${v.balance} outstanding, due ${v.due}.` },
  },
  shipment_closed: {
    channels: ['push', 'whatsapp'],
    text: { en: (v) => `${v.ref} is complete. Thank you for shipping with NGB Logistics.` },
  },
};

export function renderTemplate(
  template: string,
  locale: string,
  vars: Record<string, string>,
): { text: string; locale: string } {
  const def = TEMPLATES[template];
  if (!def) throw new Error(`Unknown template ${template}`);
  const render = def.text[locale] ?? def.text.en;
  return { text: render(vars), locale: def.text[locale] ? locale : 'en' };
}

export interface ContactConsent {
  whatsappOptIn: boolean;
  pushEnabled: boolean;
  email: string | null;
  emailOptIn: boolean;
}

export function channelsFor(template: string, consent: ContactConsent): Channel[] {
  return TEMPLATES[template].channels.filter((ch) =>
    ch === 'whatsapp' ? consent.whatsappOptIn : ch === 'push' ? consent.pushEnabled : consent.emailOptIn && !!consent.email,
  );
}

export function dedupeKey(sourceId: string, recipientId: string, channel: Channel, template: string): string {
  return `${sourceId}:${recipientId}:${channel}:${template}`;
}

/** Bounded exponential backoff: 1, 2, 4, 8, 16 minutes, then the message is marked failed. */
export const MAX_ATTEMPTS = 6;
export function nextAttemptDelayMs(attempt: number): number {
  return 60_000 * 2 ** Math.max(0, attempt - 1);
}
