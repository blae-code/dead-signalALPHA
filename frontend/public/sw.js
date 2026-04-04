/* Dead Signal — Push Notification Service Worker */

self.addEventListener('push', (event) => {
  let data = { title: 'Dead Signal', body: 'New alert', url: '/' };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data?.text() || data.body;
  }

  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'ds-notification',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: data.priority === 'high',
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) {
      if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
    }
    return clients.openWindow(url);
  }));
});
