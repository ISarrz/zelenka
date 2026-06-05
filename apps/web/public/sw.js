// Zelenka push service worker.
//
// Sprint 4 minimum: receive push events, show OS notification, deep-link on
// click. No background sync, no offline cache yet — those are Sprint 5+.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Zeleno', body: '', url: '/', tag: undefined };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if ('focus' in w) {
            w.navigate(url).catch(() => undefined);
            return w.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
