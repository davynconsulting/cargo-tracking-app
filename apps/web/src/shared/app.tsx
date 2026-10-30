import { QueryClient, QueryClientProvider, useQuery, UseQueryOptions } from '@tanstack/react-query';
import { createContext, FormEvent, ReactNode, useContext, useState, useSyncExternalStore } from 'react';
import { NavLink } from 'react-router';
import { Api, AppName } from './api';
import { ErrorBox, Field, OfflineBanner } from './ui';
import './styles.css';

const ApiContext = createContext<Api | null>(null);

export function useApi() {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi outside AppRoot');
  return api;
}

export function useUser() {
  const api = useApi();
  return useSyncExternalStore((cb) => api.onChange(cb), () => api.user);
}

/** useQuery bound to the API client; the path is the cache key. */
export function useGet<T>(path: string | null, options: Partial<UseQueryOptions<T>> = {}) {
  const api = useApi();
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api.get<T>(path!),
    enabled: !!path,
    ...options,
  });
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: (n, e) => n < 2 && (e as { retryable?: boolean }).retryable !== false, refetchOnWindowFocus: true },
    },
  });
}

export function AppRoot({ api, client, children }: { api: Api; client: QueryClient; children: ReactNode }) {
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

/** Shows the login form until a user with an allowed role signs in. */
export function RequireLogin({
  app,
  title,
  roles,
  demoHint,
  children,
}: {
  app: AppName;
  title: string;
  roles: readonly string[];
  demoHint?: ReactNode;
  children: ReactNode;
}) {
  const user = useUser();
  if (user && roles.includes(user.role)) return <>{children}</>;
  return <Login app={app} title={title} roles={roles} demoHint={demoHint} />;
}

function Login({ title, roles, demoHint }: { app: AppName; title: string; roles: readonly string[]; demoHint?: ReactNode }) {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email.trim(), password, roles);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="brand-mark" aria-hidden>
        NGB
      </div>
      <h1>{title}</h1>
      <form className="stack" onSubmit={submit}>
        <Field label="Email">
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {demoHint && <div className="alert small">{demoHint}</div>}
      </form>
    </main>
  );
}

export interface NavItem {
  to: string;
  label: string;
  icon?: string;
  count?: number;
}

/** Top bar, bottom tabs on phones, side navigation on wide screens. */
export function Shell({ title, nav, children, narrow, side }: { title: string; nav: NavItem[]; children: ReactNode; narrow?: boolean; side?: boolean }) {
  const api = useApi();
  const user = useUser();
  const links = nav.map((n) => (
    <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
      {n.icon && <span aria-hidden>{n.icon}</span>}
      <span>{n.label}</span>
      {!!n.count && <span className="count">{n.count}</span>}
    </NavLink>
  ));
  return (
    <>
      <header className="topbar">
        <span className="title">{title}</span>
        <span className="small" style={{ opacity: 0.85 }}>
          {user?.name}
        </span>
        <button type="button" onClick={() => api.logout()}>
          Sign out
        </button>
      </header>
      <OfflineBanner />
      <div className={side ? 'with-side' : ''}>
        {side && <nav className="sidenav" aria-label="Main">{links}</nav>}
        <main className={`main ${narrow ? 'narrow' : ''}`}>{children}</main>
        <nav className="tabbar" aria-label="Main">
          {links}
        </nav>
      </div>
    </>
  );
}
