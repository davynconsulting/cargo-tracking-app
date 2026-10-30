import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi, useGet } from '../shared/app';
import { formatDateTime, humanize } from '../shared/format';
import { NotificationRow } from '../shared/types';
import { Badge, Empty, ErrorBox, Loading, useToast } from '../shared/ui';
import { useRole } from './StaffShell';

/** Delivery log for every message (FRS 7, AC-12). Failed messages can be retried by an ops manager. */
export function MessagesPage() {
  const api = useApi();
  const role = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [onlyFailed, setOnlyFailed] = useState(false);
  const q = useGet<NotificationRow[]>('/notifications', { refetchInterval: 30_000 });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/retry`),
    onSuccess: () => {
      toast.ok('Queued for another attempt.');
      qc.invalidateQueries({ queryKey: ['/notifications'] });
    },
    onError: toast.bad,
  });
  const rows = (q.data ?? []).filter((n) => !onlyFailed || n.status === 'failed');
  return (
    <div className="stack">
      <h1>Messages</h1>
      <label className="check">
        <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} />
        <span>Only failed</span>
      </label>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !rows.length && <Empty>No messages.</Empty>}
      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>To</th>
              <th>Message</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id}>
                <td className="small">{formatDateTime(n.createdAt)}</td>
                <td data-label="To">
                  {n.recipient}
                  <div className="small muted">
                    {humanize(n.channel)} · {n.locale}
                  </div>
                </td>
                <td data-label="Message" className="small wrap" style={{ whiteSpace: 'pre-wrap' }}>
                  {n.body}
                </td>
                <td data-label="Status">
                  <Badge tone={n.status === 'sent' || n.status === 'delivered' ? 'ok' : n.status === 'failed' ? 'bad' : 'warn'}>{humanize(n.status)}</Badge>
                  <div className="small muted">
                    {n.attemptCount} attempt{n.attemptCount === 1 ? '' : 's'}
                    {n.errorCode && ` · ${n.errorCode}`}
                  </div>
                </td>
                <td>
                  {n.status === 'failed' && role === 'ops_manager' && (
                    <button type="button" disabled={retry.isPending} onClick={() => retry.mutate(n.id)}>
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {toast.node}
    </div>
  );
}
