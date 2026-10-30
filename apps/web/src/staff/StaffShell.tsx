import { ReactNode } from 'react';
import { Shell, useGet, useUser } from '../shared/app';
import { humanize } from '../shared/format';

export function useRole() {
  return useUser()?.role ?? '';
}

export function StaffShell({ children }: { children: ReactNode }) {
  const role = useRole();
  const open = useGet<unknown[]>('/exceptions?status=open', { refetchInterval: 60_000 });
  const nav = [
    { to: '/', label: 'Shipments', icon: '📦' },
    { to: '/exceptions', label: 'Exceptions', icon: '⚠️', count: open.data?.length },
    ...(role === 'finance' || role === 'ops_manager' ? [{ to: '/invoices', label: 'Invoices', icon: '🧾' }] : []),
    { to: '/messages', label: 'Messages', icon: '💬' },
  ];
  return (
    <Shell title={`NGB Operations · ${humanize(role)}`} nav={nav} side>
      {children}
    </Shell>
  );
}
