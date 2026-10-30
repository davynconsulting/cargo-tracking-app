/** Registers the shared service worker for one app's scope, so each app installs separately. */
export function registerServiceWorker(scope: '/client/' | '/field/' | '/staff/') {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?scope=${encodeURIComponent(scope)}`, { scope }).catch(() => {
      // The app still works without offline caching.
    });
  });
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}
