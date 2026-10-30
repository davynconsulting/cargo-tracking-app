import { Api, ApiError } from './api';
import { OfflineQueue } from './offline-queue';

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

function item(n: number) {
  return {
    id: `item-${n}`,
    shipmentId: 's1',
    reference: 'NGB-2026-00001',
    containerNumber: 'MSCU4821206',
    label: 'Loaded',
    body: { type: 'loaded', containerId: 'c1', eventAt: new Date(2026, 9, 30, 8, n).toISOString(), idempotencyKey: `key-${n}`, data: {} },
  };
}

describe('offline milestone queue (FRS 5.1)', () => {
  it('keeps the tap time and idempotency key, and sends once the connection returns', async () => {
    const api = new Api('field', memoryStore());
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError(0, 'offline', 'No connection')).mockResolvedValue({ duplicate: false });
    const q = new OfflineQueue(api, memoryStore());

    await q.add(item(1));
    expect(q.items()[0]).toMatchObject({ state: 'pending', error: 'No connection' });

    await q.flush();
    expect(q.items()[0].state).toBe('sent');
    expect(post).toHaveBeenCalledTimes(2);
    // Both attempts carry the same key and the original event time, so the server records it once, at the right time.
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
    expect((post.mock.calls[1][1] as { eventAt: string }).eventAt).toBe(item(1).body.eventAt);
  });

  it('stops at the first network failure so milestones keep their order', async () => {
    const api = new Api('field', memoryStore());
    const store = memoryStore();
    const offline = new OfflineQueue(api, store);
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(0, 'offline', 'No connection'));
    await offline.add(item(1));
    await offline.add(item(2));
    expect(offline.items().map((i) => i.state)).toEqual(['pending', 'pending']);

    const sent: string[] = [];
    vi.spyOn(api, 'post').mockImplementation(async (_path, body) => void sent.push((body as { idempotencyKey: string }).idempotencyKey));
    await offline.flush();
    expect(sent).toEqual(['key-1', 'key-2']);
  });

  it('marks a rule violation as failed instead of retrying it forever', async () => {
    const api = new Api('field', memoryStore());
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(422, 'invalid_transition', '"Loaded" is not allowed while the status is "at_sea".'));
    const q = new OfflineQueue(api, memoryStore());
    await q.add(item(1));
    expect(q.items()[0]).toMatchObject({ state: 'failed', error: expect.stringContaining('not allowed') });
    expect(q.pendingCount()).toBe(0);
  });

  it('uploads a photo once, even if the milestone send fails afterwards', async () => {
    const api = new Api('field', memoryStore());
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({ id: '6f1c2c38-2a52-4c1d-9b51-2d4b8e0d6a11' });
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError(503, 'http_503', 'Unavailable')).mockResolvedValue({});
    vi.stubGlobal('fetch', async () => new Response(new Blob(['x'], { type: 'image/jpeg' })));
    const q = new OfflineQueue(api, memoryStore());
    await q.add({ ...item(1), photo: { name: 'p.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,eA==' } });
    await q.flush();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[1][1]).toMatchObject({ evidenceDocumentIds: ['6f1c2c38-2a52-4c1d-9b51-2d4b8e0d6a11'] });
    vi.unstubAllGlobals();
  });
});
