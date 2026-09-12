// The browser half of push, in one module (#431, extracted in #457).
//
// Two screens now ask this phone the same question — the Više switch
// (`InstallHint`) and step 2 of the Dobrodošlica — and the question has a lot
// of edges: an iPhone outside a home-screen app exposes no `PushManager` at
// all, `register()` resolving is not the worker being active, and a
// subscription the server never heard about looks "on" here and rings never.
// Those edges are written ONCE, here, so the two callers cannot drift into two
// slightly different notions of "obavijesti su uključene".
//
// This file owns the browser calls and the /api round trip and NOTHING about
// what a screen says: it answers with a reason, and each caller picks its own
// sentence out of `APP_STRINGS`.
//
// It owns nothing about PLATFORM either (#455): which device this is, and which
// question to ask it first, is `src/lib/app/platform.ts` read through
// `use-install.ts`. The only capability question that belongs here is
// `pushSupported`, which `use-install.ts` re-exports rather than restates.

// The worker script lives at the ROOT so it can claim `/app` itself, not only
// `/app/…` — see the header of `public/cecilija-sw.js`.
const SW_URL = '/cecilija-sw.js'
const SW_SCOPE = '/app'

/**
 * The worker this app registered while it was called Moreškant (#489).
 *
 * Its script no longer exists, so a device still holding that registration is a
 * device whose next update check 404s and whose push then dies silently. The
 * migration below is what stops that, and this constant is the only place the
 * old name survives.
 */
const LEGACY_SW_FILE = 'moreskant-sw.js'

/**
 * Move a device from the Moreškant worker to the Cecilija one (#489).
 *
 * Runs on every `/app` load and does nothing at all on a device that never had
 * the old worker, which after the rebrand is every device but two. The order
 * matters: the old registration is unregistered FIRST, because unregistering
 * drops its push subscription with it, and a re-subscribe before that would be
 * the one we just threw away. A device that was subscribed is re-subscribed on
 * the new worker and the server is told, so the endpoint in
 * `push_subscriptions` is replaced rather than left to die on a 410.
 *
 * Best effort throughout: this is a background repair, and a browser that
 * refuses any step must still get its screen.
 */
export async function migrateLegacyServiceWorker(
  vapidPublicKey: string | null | undefined,
): Promise<'migrated' | 'nothing-to-do' | 'failed'> {
  if (!pushSupported()) return 'nothing-to-do'
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const legacy = registrations.filter((registration) =>
      [registration.active, registration.waiting, registration.installing].some((worker) =>
        worker?.scriptURL.endsWith(LEGACY_SW_FILE),
      ),
    )
    if (legacy.length === 0) return 'nothing-to-do'

    // Was this device receiving pushes? Read it before anything is torn down.
    let wasSubscribed = false
    for (const registration of legacy) {
      const subscription = await registration.pushManager.getSubscription().catch(() => null)
      if (subscription) wasSubscribed = true
      await registration.unregister().catch(() => {})
    }

    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
    if (!wasSubscribed || !vapidPublicKey) return 'migrated'

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(vapidPublicKey),
    })
    const res = await fetch('/api/app/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
    if (!res.ok) {
      // Same rule as `subscribeToPush`: a subscription the sender does not know
      // about reads as "uključeno" and rings never.
      await subscription.unsubscribe().catch(() => {})
      return 'failed'
    }
    return 'migrated'
  } catch {
    return 'failed'
  }
}

/**
 * base64url application server key → the bytes `subscribe()` wants.
 *
 * Typed as `ArrayBuffer` rather than `Uint8Array` because lib.dom's
 * `BufferSource` requires a view over a plain `ArrayBuffer`, which a
 * `Uint8Array<ArrayBufferLike>` is not; the buffer itself is accepted directly
 * and by every browser that has a `PushManager`.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out.buffer as ArrayBuffer
}

/** Does this browser have the three APIs a subscription needs? */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Does THIS browser profile already hold a subscription? Null when it cannot say. */
export async function hasPushSubscription(): Promise<boolean | null> {
  if (!pushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE)
    const subscription = await registration?.pushManager.getSubscription()
    return Boolean(subscription)
  } catch {
    return null
  }
}

/** Why a subscribe did not happen, in the caller's own words afterwards. */
export type PushSubscribeResult = 'subscribed' | 'denied' | 'failed'

/**
 * Permission → worker → subscription → the server's copy of it.
 *
 * All four steps, or none: a subscription the POST refused is unsubscribed
 * again, because a browser that holds one the sender does not know about shows
 * "uključeno" and rings never.
 */
export async function subscribeToPush(
  vapidPublicKey: string | null | undefined,
): Promise<PushSubscribeResult> {
  if (!vapidPublicKey || !pushSupported()) return 'failed'
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    // `register` resolves as soon as the worker is registered, which is not
    // the same as being active; `ready` is what `subscribe()` needs.
    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      // Required by Chrome: a silent push is not allowed on the open web.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(vapidPublicKey),
    })
    const res = await fetch('/api/app/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
    if (!res.ok) {
      await subscription.unsubscribe().catch(() => {})
      return 'failed'
    }
    return 'subscribed'
  } catch {
    return 'failed'
  }
}

/** Drop this device's subscription, here and on the server. */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE)
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await fetch('/api/app/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {})
      await subscription.unsubscribe().catch(() => {})
    }
    return true
  } catch {
    return false
  }
}
