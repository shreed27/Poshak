/* Poshak service worker: shows push notifications and opens the right order when tapped. */
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* ignore malformed payloads */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Poshak', {
      body: data.body || '',
      icon: '/favicon.svg',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) { w.navigate(url); return w.focus() }
      }
      return self.clients.openWindow(url)
    }),
  )
})
