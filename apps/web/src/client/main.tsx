import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router';
import { Api } from '../shared/api';
import { AppRoot, createQueryClient, RequireLogin, Shell } from '../shared/app';
import { registerServiceWorker } from '../shared/sw-register';
import { InvoicesPage } from './InvoicesPage';
import { MessagesPage } from './MessagesPage';
import { SettingsPage } from './SettingsPage';
import { ShipmentPage } from './ShipmentPage';
import { ShipmentsPage } from './ShipmentsPage';

const api = new Api('client');
registerServiceWorker('/client/');

const nav = [
  { to: '/', label: 'Shipments', icon: '📦' },
  { to: '/invoices', label: 'Invoices', icon: '🧾' },
  { to: '/messages', label: 'Messages', icon: '💬' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot api={api} client={createQueryClient()}>
      <RequireLogin
        app="client"
        title="Track your shipments"
        roles={['client']}
        demoHint={
          <>
            Demo: <code>aline@khl.test</code> / <code>prototype-password</code>
          </>
        }
      >
        <HashRouter>
          <Shell title="NGB Track" nav={nav} narrow>
            <Routes>
              <Route path="/" element={<ShipmentsPage />} />
              <Route path="/shipments/:id" element={<ShipmentPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Shell>
        </HashRouter>
      </RequireLogin>
    </AppRoot>
  </StrictMode>,
);
