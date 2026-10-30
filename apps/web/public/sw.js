// Shared service worker. Each app registers it with its own scope (/client/, /field/, /staff/).
// Strategy: the app shell (HTML, JS, CSS, icons) is network first with a cache fallback, so a
// driver who opens the app with no signal still gets the last version. API calls are never cached:
// stale shipment data shown as current would be worse than an honest "offline" message.

const VERSION = 'v1';
const scope = new URL(self.registration.scope).pathname;
const CACHE = `ngb-${scope.replace(/\//g, '')}-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([scope])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(`ngb-${scope.replace(/\//g, '')}-`) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match(scope) : Response.error())),
      ),
  );
});

// Web push (FRS 7). The server side of push subscriptions is not built yet; this handler is
// ready for payloads of the form { title, body, url }.
self.addEventListener('push', (event) => {
  let data = { title: 'NGB Logistics', body: 'Your shipment has an update.', url: scope };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: `/icons${scope.slice(0, -1)}-192.png`, data: { url: data.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((wins) => {
      const open = wins.find((w) => w.url.includes(scope));
      return open ? open.focus().then((w) => w.navigate(target)) : self.clients.openWindow(target);
    }),
  );
});
