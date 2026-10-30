import { Api, ApiError } from './api';

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('API client', () => {
  it('refuses to sign a driver into the client portal', async () => {
    const api = new Api('client', memoryStore(), async () => json(201, { token: 't', user: { id: 'u', name: 'Juma', role: 'driver', organizationId: null } }));
    await expect(api.login('juma@ngb.test', 'x', ['client'])).rejects.toMatchObject({ code: 'wrong_app' });
    expect(api.user).toBeNull();
  });

  it('keeps the session per app and sends the bearer token', async () => {
    const store = memoryStore();
    const calls: RequestInit[] = [];
    const api = new Api('staff', store, async (_url, init) => {
      calls.push(init!);
      return calls.length === 1 ? json(201, { token: 'tok', user: { id: 'u', name: 'Neema', role: 'ops_manager', organizationId: null } }) : json(200, []);
    });
    await api.login('ops@ngb.test', 'x', ['ops_manager']);
    await api.get('/shipments');
    expect((calls[1].headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(new Api('staff', store).user?.name).toBe('Neema');
    expect(new Api('client', store).user).toBeNull();
  });

  it('turns API rule violations into readable errors with details', async () => {
    const api = new Api('staff', memoryStore(), async () =>
      json(422, { code: 'closure_blocked', message: 'The shipment cannot close yet.', checks: [{ key: 'returned', passed: false }] }),
    );
    const err = (await api.post('/shipments/x/close').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'closure_blocked', message: 'The shipment cannot close yet.', retryable: false });
    expect(err.details).toEqual([{ key: 'returned', passed: false }]);
  });

  it('treats a network failure as retryable and signs out on 401', async () => {
    const offline = new Api('field', memoryStore(), async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(offline.get('/driver/jobs')).rejects.toMatchObject({ status: 0, retryable: true });

    const store = memoryStore();
    store.setItem('ngb.field.session', JSON.stringify({ token: 'old', user: { id: 'u', name: 'J', role: 'driver', organizationId: null } }));
    const expired = new Api('field', store, async () => json(401, { message: 'Unauthorized' }));
    await expect(expired.get('/driver/jobs')).rejects.toMatchObject({ status: 401 });
    expect(expired.user).toBeNull();
  });
});
