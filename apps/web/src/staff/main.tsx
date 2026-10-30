import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router';
import { STAFF_ROLES } from '@domain/workflow';
import { Api } from '../shared/api';
import { AppRoot, createQueryClient, RequireLogin } from '../shared/app';
import { registerServiceWorker } from '../shared/sw-register';
import { ExceptionsPage } from './ExceptionsPage';
import { InvoicesPage } from './InvoicesPage';
import { MessagesPage } from './MessagesPage';
import { NewShipmentPage } from './NewShipmentPage';
import { ShipmentPage } from './ShipmentPage';
import { ShipmentsPage } from './ShipmentsPage';
import { StaffShell } from './StaffShell';

const api = new Api('staff');
registerServiceWorker('/staff/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot api={api} client={createQueryClient()}>
      <RequireLogin
        app="staff"
        title="NGB operations console"
        roles={STAFF_ROLES}
        demoHint={
          <>
            Demo: <code>ops@ngb.test</code>, <code>agent@ngb.test</code>, <code>transport@ngb.test</code> or <code>finance@ngb.test</code> /{' '}
            <code>prototype-password</code>
          </>
        }
      >
        <HashRouter>
          <StaffShell>
            <Routes>
              <Route path="/" element={<ShipmentsPage />} />
              <Route path="/shipments/new" element={<NewShipmentPage />} />
              <Route path="/shipments/:id" element={<ShipmentPage />} />
              <Route path="/exceptions" element={<ExceptionsPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/messages" element={<MessagesPage />} />
            </Routes>
          </StaffShell>
        </HashRouter>
      </RequireLogin>
    </AppRoot>
  </StrictMode>,
);
