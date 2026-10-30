import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Api } from '../shared/api';
import { AppRoot, createQueryClient, RequireLogin } from '../shared/app';
import { OfflineQueue } from '../shared/offline-queue';
import { registerServiceWorker } from '../shared/sw-register';
import { FieldApp } from './FieldApp';

const api = new Api('field');
const queue = new OfflineQueue(api);
registerServiceWorker('/field/');

// Send anything saved while offline as soon as the phone has signal again.
window.addEventListener('online', () => void queue.flush());
setInterval(() => navigator.onLine && void queue.flush(), 60_000);
void queue.flush();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot api={api} client={createQueryClient()}>
      <RequireLogin
        app="field"
        title="Driver sign in"
        roles={['driver']}
        demoHint={
          <>
            Demo: <code>juma@ngb.test</code> / <code>prototype-password</code>
          </>
        }
      >
        <FieldApp queue={queue} />
      </RequireLogin>
    </AppRoot>
  </StrictMode>,
);
