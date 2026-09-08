// The Moreškant service worker (#431, ADR-0024 phase 4).
//
// It does exactly two things: show a push notification, and open the
// performance when one is tapped. THERE IS NO FETCH HANDLER AND NO CACHE, on
// purpose (#419 story 47, carried into phase 4): every page of `/app` is
// server-rendered from data that changes hour by hour, so a cache layer could
// only turn app bugs into caching bugs and show a dancer last week's headcount.
// Without a fetch handler the browser serves every request from the network as
// if the worker were not there.
//
// Served from `/app/sw.js` — a static file under `public/app/` — so its scope
// is `/app/` by path and no `Service-Worker-Allowed` header is needed. It is
// plain JS with no build step, which is also why it is here rather than in
// `src/`.

self.addEventListener('install', () => {
  // Take over straight away: the first registration should be able to receive
  // the very first notification, not the second.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // A push with no body or a body we did not send: still worth showing, with
    // the app's own name, rather than dropping silently.
  }

  const title = payload.title || 'Moreškant'
  const options = {
    body: payload.body || '',
    // The maskable app icon, the same one the home screen uses.
    icon: '/moreskant-icon-192.png',
    badge: '/moreskant-icon-192.png',
    tag: payload.tag || 'moreskant',
    // A replaced notification must still ring: an alarm sent twice is two
    // attempts to get somebody's attention, not one update to a status line.
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/app' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/app'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse a window that is already on the app rather than opening a second
      // copy: on a phone the app is usually already open behind the lock screen.
      for (const client of clients) {
        if (client.url.includes('/app') && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

// The browser may rotate an endpoint on its own (a push service migration, a
// key rotation). Re-subscribe with the same application server key and tell the
// server, or the device goes quiet without anybody noticing. Best effort: the
// banner re-registers on the next visit anyway.
self.addEventListener('pushsubscriptionchange', (event) => {
  const applicationServerKey =
    (event.oldSubscription && event.oldSubscription.options &&
      event.oldSubscription.options.applicationServerKey) ||
    null
  if (!applicationServerKey) return

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then((subscription) =>
        fetch('/api/app/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(subscription.toJSON()),
        }),
      )
      .catch(() => {}),
  )
})
