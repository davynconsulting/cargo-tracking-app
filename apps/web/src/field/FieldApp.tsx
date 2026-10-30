import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, newKey } from '../shared/api';
import { useApi, useGet, useUser } from '../shared/app';
import { formatDateTime, journeyLabel, milestoneLabel, toLocalInput } from '../shared/format';
import { OfflineQueue, QueuedMilestone } from '../shared/offline-queue';
import { Action, DriverJob } from '../shared/types';
import { Badge, Dialog, Empty, ErrorBox, Field, Loading, OfflineBanner, useOnline, useToast } from '../shared/ui';
import { MILESTONE_SW, toggleLanguage, useStrings } from './i18n';
import { compressPhoto } from './photo';

export function FieldApp({ queue }: { queue: OfflineQueue }) {
  const t = useStrings();
  const api = useApi();
  const user = useUser();
  const qc = useQueryClient();
  const items = useSyncExternalStore((cb) => queue.subscribe(cb), () => JSON.stringify(queue.items()));
  const queued: QueuedMilestone[] = JSON.parse(items);
  const jobs = useGet<DriverJob[]>('/driver/jobs', { refetchInterval: 60_000 });
  const [tab, setTab] = useState<'jobs' | 'sent'>('jobs');
  const [recording, setRecording] = useState<{ job: DriverJob; action: Action } | null>(null);
  const [problemFor, setProblemFor] = useState<DriverJob | null>(null);
  const toast = useToast();

  // When the queue sends something, the server state moved on; reload the trips.
  const sentCount = queued.filter((q) => q.state === 'sent').length;
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['/driver/jobs'] });
  }, [sentCount, qc]);

  const pending = queued.filter((q) => q.state === 'pending' || q.state === 'sending');
  const failed = queued.filter((q) => q.state === 'failed');

  return (
    <>
      <header className="topbar">
        <span className="title">{t.appTitle}</span>
        <button type="button" onClick={toggleLanguage}>
          {t.language}
        </button>
        <button type="button" onClick={() => api.logout()}>
          {t.signOut}
        </button>
      </header>
      <OfflineBanner />
      <main className="main narrow stack">
        <div className="small muted">{user?.name}</div>
        {pending.length > 0 && <div className="alert warn">{t.queueCount(pending.length)}</div>}
        {failed.map((f) => (
          <div key={f.id} className="alert bad stack" style={{ gap: 6 }}>
            <div>
              <strong>{t.failed}:</strong> {f.label} · {f.reference} {f.containerNumber}
            </div>
            <div className="small">{f.error}</div>
            <div className="row">
              <button type="button" onClick={() => queue.retry(f.id)}>
                {t.retry}
              </button>
              <button type="button" className="danger" onClick={() => queue.discard(f.id)}>
                {t.discard}
              </button>
            </div>
          </div>
        ))}

        {tab === 'jobs' ? (
          <>
            <h1>{t.jobs}</h1>
            {jobs.isLoading && <Loading />}
            {jobs.error && !jobs.data && <ErrorBox error={jobs.error} />}
            {jobs.data && !jobs.data.length && <Empty>{t.noJobs}</Empty>}
            {jobs.data?.map((job) => (
              <JobCard
                key={job.container.id}
                job={job}
                waiting={pending.filter((p) => p.body.containerId === job.container.id)}
                onRecord={(action) => setRecording({ job, action })}
                onProblem={() => setProblemFor(job)}
              />
            ))}
          </>
        ) : (
          <SentList items={queued} />
        )}
      </main>
      <nav className="tabbar" aria-label="Main">
        <a href="#" className={tab === 'jobs' ? 'active' : ''} onClick={(e) => (e.preventDefault(), setTab('jobs'))}>
          <span aria-hidden>🚚</span>
          <span>{t.jobs}</span>
        </a>
        <a href="#" className={tab === 'sent' ? 'active' : ''} onClick={(e) => (e.preventDefault(), setTab('sent'))}>
          <span aria-hidden>📤</span>
          <span>{t.sent}</span>
          {pending.length > 0 && <span className="count">{pending.length}</span>}
        </a>
      </nav>
      {recording && (
        <RecordDialog
          job={recording.job}
          action={recording.action}
          onClose={() => setRecording(null)}
          onQueued={(online) => {
            setRecording(null);
            toast.ok(online ? t.sentOk : t.queued);
          }}
          queue={queue}
        />
      )}
      {problemFor && (
        <ProblemDialog
          job={problemFor}
          onClose={() => setProblemFor(null)}
          onDone={() => {
            setProblemFor(null);
            toast.ok(t.problemSent);
          }}
        />
      )}
      {toast.node}
    </>
  );
}

function actionLabel(type: string, lang: 'en' | 'sw') {
  return lang === 'sw' ? (MILESTONE_SW[type] ?? milestoneLabel(type)) : milestoneLabel(type);
}

function JobCard({ job, waiting, onRecord, onProblem }: { job: DriverJob; waiting: QueuedMilestone[]; onRecord: (a: Action) => void; onProblem: () => void }) {
  const t = useStrings();
  const ready = job.actions.filter((a) => !a.blockedReason);
  const blocked = job.actions.filter((a) => a.blockedReason);
  return (
    <div className="card stack">
      <div className="row between">
        <strong className="mono" style={{ fontSize: '1.15rem' }}>
          {job.container.containerNumber}
        </strong>
        <Badge tone="info">{journeyLabel(job.container.journey)}</Badge>
      </div>
      <dl className="kv small">
        <dt>{t.truck}</dt>
        <dd>{job.truckRegistration}</dd>
        <dt>{t.to}</dt>
        <dd>{job.deliveryAddress ?? job.destination}</dd>
        {job.borderCrossing && (
          <>
            <dt>{t.border}</dt>
            <dd>{job.borderCrossing}</dd>
          </>
        )}
        <dt>Ref</dt>
        <dd>{job.reference}</dd>
      </dl>
      {waiting.length > 0 ? (
        <div className="alert warn small">
          {t.waiting}: {waiting.map((w) => w.label).join(', ')}
        </div>
      ) : (
        <>
          {ready.map((a) => (
            <button key={a.type} type="button" className="primary big" onClick={() => onRecord(a)}>
              {actionLabel(a.type, t.lang)}
            </button>
          ))}
          {!ready.length && !blocked.length && <div className="small muted">{job.container.journey === 'loaded' ? t.waitGateOut : t.nothingYet}</div>}
          {blocked.map((a) => (
            <div key={a.type} className="small muted">
              {t.blocked} {actionLabel(a.type, t.lang)}. {a.blockedReason}
            </div>
          ))}
        </>
      )}
      <button type="button" onClick={onProblem}>
        ⚠ {t.problem}
      </button>
    </div>
  );
}

function RecordDialog({
  job,
  action,
  onClose,
  onQueued,
  queue,
}: {
  job: DriverJob;
  action: Action;
  onClose: () => void;
  onQueued: (online: boolean) => void;
  queue: OfflineQueue;
}) {
  const t = useStrings();
  // The time is captured when the driver taps the button, not when the message finally sends.
  const [tappedAt] = useState(() => new Date());
  const [when, setWhen] = useState(() => toLocalInput(tappedAt));
  const [seal, setSeal] = useState(job.container.sealNumber ?? '');
  const [border, setBorder] = useState(job.borderCrossing ?? '');
  const [receivedBy, setReceivedBy] = useState('');
  const [depot, setDepot] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<{ name: string; type: string; dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const type = action.type;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const eventAt = when === toLocalInput(tappedAt) ? tappedAt : new Date(when);
    if (eventAt.getTime() > Date.now() + 60_000) return setError('The time cannot be in the future.');
    const data: Record<string, string> = {};
    if (type === 'loaded' && seal.trim()) data.sealNumber = seal.trim();
    if (type === 'border_arrived' || type === 'border_crossed') {
      if (type === 'border_crossed' && !border.trim()) return setError(t.borderName);
      if (border.trim()) data.border = border.trim();
    }
    if (type === 'delivered' && receivedBy.trim()) data.receivedBy = receivedBy.trim();
    if (type === 'empty_returned' && depot.trim()) data.depot = depot.trim();
    const online = navigator.onLine;
    void queue.add({
      id: newKey(),
      shipmentId: job.shipmentId,
      reference: job.reference,
      containerNumber: job.container.containerNumber,
      label: milestoneLabel(type),
      body: {
        type,
        containerId: job.container.id,
        eventAt: eventAt.toISOString(),
        notes: notes.trim() || undefined,
        location: type.startsWith('border') ? border.trim() || undefined : undefined,
        data,
        idempotencyKey: newKey(),
      },
      photo: photo ?? undefined,
    });
    onQueued(online);
  }

  return (
    <Dialog open title={actionLabel(type, t.lang)} onClose={onClose}>
      <form className="stack" onSubmit={submit} id="record-form">
        <div className="small muted mono">
          {job.container.containerNumber} · {job.truckRegistration}
        </div>
        <Field label={t.happenedAt} hint={t.happenedHint}>
          <input type="datetime-local" value={when} max={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} required />
        </Field>
        {type === 'loaded' && (
          <Field label={t.seal}>
            <input value={seal} onChange={(e) => setSeal(e.target.value)} autoCapitalize="characters" />
          </Field>
        )}
        {(type === 'border_arrived' || type === 'border_crossed') && (
          <Field label={t.borderName}>
            <input value={border} onChange={(e) => setBorder(e.target.value)} required={type === 'border_crossed'} />
          </Field>
        )}
        {type === 'delivered' && (
          <Field label={t.receivedBy}>
            <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} autoComplete="off" />
          </Field>
        )}
        {type === 'empty_returned' && (
          <Field label={t.depot}>
            <input value={depot} onChange={(e) => setDepot(e.target.value)} />
          </Field>
        )}
        <Field label={type === 'delivered' ? t.photoPod : t.photo}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setPhoto(f ? await compressPhoto(f) : null);
            }}
          />
        </Field>
        {photo && <img src={photo.dataUrl} alt="" style={{ maxHeight: 160, objectFit: 'contain', borderRadius: 8 }} />}
        <Field label={t.notes}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        {error && <div className="alert bad">{error}</div>}
        <button type="submit" className="primary big">
          {t.confirm}
        </button>
        <button type="button" onClick={onClose}>
          {t.cancel}
        </button>
      </form>
    </Dialog>
  );
}

function ProblemDialog({ job, onClose, onDone }: { job: DriverJob; onClose: () => void; onDone: () => void }) {
  const t = useStrings();
  const api = useApi();
  const online = useOnline();
  const [type, setType] = useState('delay');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/shipments/${job.shipmentId}/exceptions`, {
        type,
        containerId: job.container.id,
        reason: reason.trim(),
        nextAction: 'Operations to call the driver and update the plan.',
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? new Error(t.offlineProblem) : err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title={t.problem} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="small muted mono">{job.container.containerNumber}</div>
        <Field label={t.problemType}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="delay">{t.delay}</option>
            <option value="truck_unavailable">{t.truckIssue}</option>
            <option value="delivery_discrepancy">{t.discrepancy}</option>
            <option value="other">{t.other}</option>
          </select>
        </Field>
        <Field label={t.problemDetails}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} rows={3} />
        </Field>
        {!online && <div className="alert warn">{t.offlineProblem}</div>}
        <ErrorBox error={error} />
        <button type="submit" className="primary big" disabled={busy || !online}>
          {t.problem}
        </button>
        <button type="button" onClick={onClose}>
          {t.cancel}
        </button>
      </form>
    </Dialog>
  );
}

function SentList({ items }: { items: QueuedMilestone[] }) {
  const t = useStrings();
  if (!items.length) return <Empty>—</Empty>;
  return (
    <div className="stack">
      <h1>{t.recent}</h1>
      {[...items].reverse().map((i) => (
        <div key={i.id} className="card row between">
          <div style={{ minWidth: 0 }}>
            <strong>{actionLabel(i.body.type, t.lang)}</strong>
            <div className="small muted mono wrap">
              {i.reference} · {i.containerNumber}
            </div>
            <div className="small muted">{formatDateTime(i.body.eventAt)}</div>
          </div>
          <Badge tone={i.state === 'sent' ? 'ok' : i.state === 'failed' ? 'bad' : 'warn'}>
            {i.state === 'sent' ? t.sent : i.state === 'failed' ? t.failed : i.state === 'sending' ? t.sending : t.waiting}
          </Badge>
        </div>
      ))}
    </div>
  );
}
