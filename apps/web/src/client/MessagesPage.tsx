import { useGet } from '../shared/app';
import { formatDateTime, humanize } from '../shared/format';
import { NotificationRow } from '../shared/types';
import { Badge, Empty, ErrorBox, Loading } from '../shared/ui';

/** What NGB has sent this company and on which channel (FRS 7). */
export function MessagesPage() {
  const q = useGet<NotificationRow[]>('/notifications');
  return (
    <div className="stack">
      <h1>Messages</h1>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !q.data.length && <Empty>No messages yet.</Empty>}
      {q.data?.map((n) => (
        <div key={n.id} className="card stack" style={{ gap: 6 }}>
          <div className="row between small">
            <span>
              {humanize(n.channel)} to {n.recipient}
            </span>
            <Badge tone={n.status === 'sent' || n.status === 'delivered' ? 'ok' : n.status === 'failed' ? 'bad' : undefined}>{humanize(n.status)}</Badge>
          </div>
          <div className="wrap" style={{ whiteSpace: 'pre-wrap' }}>
            {n.body}
          </div>
          <div className="small muted">{formatDateTime(n.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}
