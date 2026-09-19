/* VERSION: 2026-09-19 — v17: service worker for push notifications. Must sit in the SAME folder as index.html. */
/* It does nothing except show a notification when the server sends one, and open the site when it is tapped. */

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  var title = d.title || 'Week by Week';
  var opts = {
    body: d.body || '',
    icon: d.icon || 'icon-192.png',
    badge: d.icon || 'icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
