import { Api, ApiError, readJson } from './api';

// The field app records milestones on poor signal (FRS 5.1, US-03). Each tap is stored with the
// time it happened and an idempotency key, then sent when the connection returns. The API ignores
// a resend with the same key, so a submission that reached the server before the reply was lost
// is never recorded twice.

export interface QueuedMilestone {
  id: string;
  shipmentId: string;
  reference: string;
  containerNumber?: string;
  label: string;
  body: Record<string, unknown> & { type: string; idempotencyKey: string; eventAt: string };
  photo?: { name: string; type: string; dataUrl: string };
  state: 'pending' | 'sending' | 'sent' | 'failed';
  error?: string;
  attempts: number;
  queuedAt: string;
  sentAt?: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'ngb.field.queue';
const KEEP_SENT = 20;

export class OfflineQueue {
  private listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly api: Api,
    private readonly store: Store = localStorage,
  ) {}

  items(): QueuedMilestone[] {
    return readJson<QueuedMilestone[]>(this.store, KEY) ?? [];
  }

  pendingCount() {
    return this.items().filter((i) => i.state === 'pending' || i.state === 'sending').length;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private save(items: QueuedMilestone[]) {
    // Keep every unsent item; trim old sent ones so storage stays small.
    const sent = items.filter((i) => i.state === 'sent');
    const keep = new Set(sent.slice(-KEEP_SENT).map((i) => i.id));
    const trimmed = items.filter((i) => i.state !== 'sent' || keep.has(i.id));
    this.store.setItem(KEY, JSON.stringify(trimmed));
    this.listeners.forEach((fn) => fn());
  }

  private update(id: string, patch: Partial<QueuedMilestone>) {
    this.save(this.items().map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  add(item: Omit<QueuedMilestone, 'state' | 'attempts' | 'queuedAt'>) {
    this.save([...this.items(), { ...item, state: 'pending', attempts: 0, queuedAt: new Date().toISOString() }]);
    return this.flush();
  }

  /** Puts a failed item back in the queue, e.g. after the driver read the error. */
  retry(id: string) {
    this.update(id, { state: 'pending', error: undefined });
    return this.flush();
  }

  discard(id: string) {
    this.save(this.items().filter((i) => i.id !== id));
  }

  /** Sends pending items oldest first. Stops at the first network failure; the order of milestones matters. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.run().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  private async run() {
    for (;;) {
      const next = this.items().find((i) => i.state === 'pending');
      if (!next) return;
      this.update(next.id, { state: 'sending', attempts: next.attempts + 1 });
      try {
        let body = next.body;
        if (next.photo) {
          // Upload once, then keep the document id so a retry does not upload the photo again.
          const doc = await this.uploadPhoto(next);
          body = { ...body, evidenceDocumentIds: [doc.id] };
          this.update(next.id, { body, photo: undefined });
        }
        await this.api.post(`/shipments/${next.shipmentId}/milestones`, body);
        this.update(next.id, { state: 'sent', sentAt: new Date().toISOString(), photo: undefined });
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, 'offline', String(e));
        if (err.retryable) {
          this.update(next.id, { state: 'pending', error: err.message });
          return;
        }
        // A rule violation (wrong order, closed shipment) will not fix itself; show it to the driver.
        this.update(next.id, { state: 'failed', error: err.message });
      }
    }
  }

  private async uploadPhoto(item: QueuedMilestone) {
    const photo = item.photo!;
    const blob = await (await fetch(photo.dataUrl)).blob();
    const form = new FormData();
    form.append('file', new File([blob], photo.name, { type: photo.type }));
    form.append('documentType', item.body.type === 'delivered' ? 'pod' : 'photo');
    form.append('clientVisible', item.body.type === 'delivered' ? 'true' : 'false');
    return this.api.upload<{ id: string }>(`/shipments/${item.shipmentId}/documents`, form);
  }
}
