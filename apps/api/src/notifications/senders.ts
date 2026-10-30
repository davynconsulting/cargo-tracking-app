import { Channel } from '../domain/notifications';

export interface OutgoingMessage {
  id: string;
  channel: Channel;
  to: string;
  template: string;
  locale: string;
  body: string;
}

export class TransientSendError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export class PermanentSendError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export interface ChannelSender {
  send(message: OutgoingMessage): Promise<{ providerMessageId: string }>;
}

/**
 * Development sender: logs instead of calling a provider. Set SIMULATE_WHATSAPP_OUTAGE=true
 * to make every WhatsApp send fail with a retryable error (AC-18).
 *
 * The production WhatsApp sender (Meta Cloud API or a provider such as Twilio) needs the
 * approved template names and parameter order, which depend on the templates NGB submits.
 */
export class LogSender implements ChannelSender {
  readonly sent: OutgoingMessage[] = [];

  constructor(private readonly options: { whatsappOutage?: boolean; quiet?: boolean } = {}) {}

  setWhatsappOutage(on: boolean) {
    this.options.whatsappOutage = on;
  }

  async send(message: OutgoingMessage) {
    if (message.channel === 'whatsapp' && this.options.whatsappOutage) {
      throw new TransientSendError('provider_unavailable', 'WhatsApp provider did not respond (simulated outage).');
    }
    this.sent.push(message);
    if (!this.options.quiet) console.log(`[${message.channel} -> ${message.to}] ${message.body}`);
    return { providerMessageId: `log-${message.id}` };
  }
}
