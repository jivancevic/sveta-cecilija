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

// The worker script lives at the ROOT so it can claim `/app` itself, not only
// `/app/…` — see the header of `public/moreskant-sw.js`.
const SW_URL = '/moreskant-sw.js'
const SW_SCOPE = '/app'

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

/** Is the app already running from the home screen? */
export function standalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

/** An iPhone or iPad, the one platform where the install step comes first. */
export function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
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
