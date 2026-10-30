// Thin fetch wrapper. The API is served under /api (Vite proxy in dev, reverse proxy in production).

export type AppName = 'client' | 'field' | 'staff';

export interface SessionUser {
  id: string;
  name: string;
  role: string;
  organizationId: string | null;
}
export interface Session {
  token: string;
  user: SessionUser;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
  /** Network failures and 5xx can be retried; a 4xx means the request itself is wrong. */
  get retryable() {
    return this.status === 0 || this.status >= 500;
  }
}

export const API_BASE = '/api';

type Listener = () => void;

export class Api {
  private session: Session | null;
  private listeners = new Set<Listener>();

  constructor(
    readonly app: AppName,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    this.session = readJson<Session>(storage, this.key);
  }

  private get key() {
    return `ngb.${this.app}.session`;
  }

  get user() {
    return this.session?.user ?? null;
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setSession(session: Session | null) {
    this.session = session;
    if (session) this.storage.setItem(this.key, JSON.stringify(session));
    else this.storage.removeItem(this.key);
    this.listeners.forEach((fn) => fn());
  }

  async login(email: string, password: string, allowedRoles: readonly string[]) {
    const res = await this.request<Session>('POST', '/auth/login', { email, password }, false);
    if (!allowedRoles.includes(res.user.role)) {
      throw new ApiError(403, 'wrong_app', wrongAppMessage(res.user.role));
    }
    this.setSession(res);
    return res.user;
  }

  logout() {
    this.setSession(null);
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body ?? {});
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body ?? {});
  }
  upload<T>(path: string, form: FormData) {
    return this.request<T>('POST', path, form);
  }

  /** Opens a short-lived signed download link (FRS 6). */
  async openDocument(documentId: string) {
    const { url } = await this.get<{ url: string; expiresAt: string }>(`/documents/${documentId}/link`);
    window.open(API_BASE + url, '_blank', 'noopener');
  }

  async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (auth && this.session) headers.Authorization = `Bearer ${this.session.token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await this.fetcher(API_BASE + path, { method, headers, body: payload });
    } catch {
      throw new ApiError(0, 'offline', 'No connection. Check your signal and try again.');
    }
    const text = await res.text();
    const data = text ? safeParse(text) : null;
    if (!res.ok) {
      if (res.status === 401 && auth) this.setSession(null);
      const err = (data ?? {}) as { code?: string; message?: string | string[]; checks?: unknown; issues?: unknown };
      const message = Array.isArray(err.message) ? err.message.join(' ') : err.message;
      throw new ApiError(res.status, err.code ?? `http_${res.status}`, message ?? res.statusText ?? 'Request failed', err.checks ?? err.issues);
    }
    return data as T;
  }
}

function wrongAppMessage(role: string) {
  if (role === 'client') return 'This account is for the client portal. Open /client/ instead.';
  if (role === 'driver') return 'This account is for the driver app. Open /field/ instead.';
  return 'This account is for the operations console. Open /staff/ instead.';
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function readJson<T>(storage: Pick<Storage, 'getItem'>, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
