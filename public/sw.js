// XENSI service worker: Web Push for Squad Finder only. No caching, no offline behavior.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* ignore malformed payload */ }
  event.waitUntil(self.registration.showNotification(data.title || 'XENSI Squad Finder', {
    body: data.body || '',
    tag: data.tag || 'squad',
    icon: new URL('branding/xensi-x.png', self.registration.scope).href,
    data: { path: typeof data.path === 'string' && !data.path.startsWith('/') && !data.path.includes(':') ? data.path : 'squad' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data.path, self.registration.scope).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope))
    return open ? open.navigate(target).then(c => c && c.focus()) : self.clients.openWindow(target)
  }))
})
