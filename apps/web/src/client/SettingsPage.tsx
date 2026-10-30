import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi, useGet, useUser } from '../shared/app';
import { isIos, isStandalone } from '../shared/sw-register';
import { Contact } from '../shared/types';
import { Empty, ErrorBox, Loading, useToast } from '../shared/ui';

type Channel = 'whatsapp' | 'email' | 'push';
const FIELD: Record<Channel, keyof Contact> = { whatsapp: 'whatsappOptIn', email: 'emailOptIn', push: 'pushEnabled' };

/** Per-contact message preferences. Every change is stored as a consent record with its source (FRS 7.1). */
export function SettingsPage() {
  const api = useApi();
  const user = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const path = user?.organizationId ? `/clients/${user.organizationId}/contacts` : null;
  const q = useGet<Contact[]>(path);
  const consent = useMutation({
    mutationFn: (v: { contact: Contact; channel: Channel; optedIn: boolean }) =>
      api.put(`/contacts/${v.contact.id}/consent`, { channel: v.channel, optedIn: v.optedIn, source: `client portal, ${user?.name}` }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [path] });
      toast.ok('Saved.');
    },
    onError: toast.bad,
  });

  return (
    <div className="stack">
      <h1>Settings</h1>
      <DeviceNotifications />

      <h2 className="section-title">Who gets updates</h2>
      {q.isLoading && <Loading />}
      <ErrorBox error={q.error} />
      {q.data && !q.data.length && <Empty>No contacts on file.</Empty>}
      {q.data?.map((c) => (
        <div key={c.id} className="card stack" style={{ gap: 4 }}>
          <strong>{c.name}</strong>
          <div className="small muted wrap">
            {c.phone}
            {c.email && ` · ${c.email}`}
          </div>
          {(['whatsapp', 'email', 'push'] as Channel[]).map((ch) => (
            <label key={ch} className="check">
              <input
                type="checkbox"
                checked={!!c[FIELD[ch]]}
                disabled={consent.isPending || (ch === 'email' && !c.email)}
                onChange={(e) => consent.mutate({ contact: c, channel: ch, optedIn: e.target.checked })}
              />
              <span>
                {ch === 'whatsapp' ? 'WhatsApp milestone updates' : ch === 'email' ? 'Email (invoices and reminders)' : 'App notifications'}
                {ch === 'email' && !c.email && <span className="small muted"> (no email on file)</span>}
              </span>
            </label>
          ))}
        </div>
      ))}
      <p className="small muted">You can stop WhatsApp messages at any time here or by replying STOP.</p>
      {toast.node}
    </div>
  );
}

function DeviceNotifications() {
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState(supported ? Notification.permission : 'denied');
  const iosNeedsInstall = isIos() && !isStandalone();
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <strong>Notifications on this device</strong>
      {iosNeedsInstall ? (
        <p className="small" style={{ margin: 0 }}>
          On iPhone, notifications only work after you add this app to your home screen: tap Share, then <strong>Add to Home Screen</strong>, and open it from
          there.
        </p>
      ) : !supported ? (
        <p className="small muted" style={{ margin: 0 }}>
          This browser does not support notifications. WhatsApp updates still work.
        </p>
      ) : perm === 'granted' ? (
        <p className="small" style={{ margin: 0 }}>
          Allowed on this device.
        </p>
      ) : perm === 'denied' ? (
        <p className="small" style={{ margin: 0 }}>
          Blocked. Allow notifications for this site in your browser settings.
        </p>
      ) : (
        <button type="button" onClick={() => Notification.requestPermission().then(setPerm)}>
          Allow notifications
        </button>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Prototype note: the device permission is captured, but the server does not send app notifications yet. WhatsApp is the live channel.
      </p>
    </div>
  );
}
