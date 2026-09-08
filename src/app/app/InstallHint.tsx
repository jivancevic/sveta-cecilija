'use client'

import { useEffect, useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// The one banner under the season list: "Dodaj na početni zaslon" (#421) and,
// since #431, "Uključi obavijesti".
//
// ONE component rather than two stacked banners, because the two questions are
// really one question asked in order (#430, stories 1-3): on an uninstalled
// iPhone there is no `PushManager` at all, so the honest first answer is "add
// it to the home screen"; everywhere else the offer is the notification switch;
// and once this device is subscribed the offer disappears and leaves a single
// muted line with the off switch, which is the whole of the per-device control
// (story 5).
//
// The state is READ FROM THE BROWSER, never from the server: whether this
// particular device holds a subscription is a fact of this browser profile, and
// asking the server would answer for some other phone. Which is also why the
// component renders nothing until it has looked (`state === 'unknown'`) — a
// banner that flashes "turn on notifications" at somebody who turned them on
// last week is worse than a beat of silence.
//
// Every storage / permission access is wrapped: a private window, a browser
// that blocks site data and a thumbnail-capture pass can each throw, and none
// of that may take `/app` down.

const DISMISSED_KEY = 'moreskant.installHint.dismissed'
// The worker script lives at the ROOT so it can claim `/app` itself, not only
// `/app/…` — see the header of `public/moreskant-sw.js`.
const SW_URL = '/moreskant-sw.js'
const SW_SCOPE = '/app'

type BannerState = 'unknown' | 'install' | 'offer' | 'on' | 'hidden'

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

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function standalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function InstallHint({ vapidPublicKey }: { vapidPublicKey?: string | null }) {
  const [state, setState] = useState<BannerState>('unknown')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const decide = async () => {
      // No keys configured on this deployment: fall back to the plain install
      // hint, which is what `/app` showed before push existed.
      if (!vapidPublicKey || !pushSupported()) {
        if (!cancelled) setState(standalone() || dismissed() ? 'hidden' : 'install')
        return
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE)
        const subscription = await registration?.pushManager.getSubscription()
        if (!cancelled) setState(subscription ? 'on' : 'offer')
      } catch {
        if (!cancelled) setState('offer')
      }
    }
    void decide()
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey])

  async function enable() {
    if (busy || !vapidPublicKey) return
    setBusy(true)
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError(APP_STRINGS.push.denied)
        return
      }
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
        // Do not leave a subscription the server does not know about: it would
        // look "on" here and never ring.
        await subscription.unsubscribe().catch(() => {})
        setError(APP_STRINGS.push.failed)
        return
      }
      setState('on')
    } catch {
      setError(APP_STRINGS.push.failed)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (busy) return
    setBusy(true)
    setError(null)
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
      setState('offer')
    } catch {
      setError(APP_STRINGS.push.failed)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'unknown' || state === 'hidden') return null

  if (state === 'on') {
    return (
      <aside className="app__hint app__hint--quiet">
        <span>{APP_STRINGS.push.onTitle}</span>
        <button type="button" className="app__hint-link" disabled={busy} onClick={disable}>
          {busy ? APP_STRINGS.push.disabling : APP_STRINGS.push.disable}
        </button>
      </aside>
    )
  }

  if (state === 'install') {
    // Two audiences, one line: a phone that cannot do push yet (iOS, no home
    // screen icon) and a deployment with no keys. Both need the same sentence.
    const ios = pushSupported() === false && /iPad|iPhone|iPod/.test(navigator.userAgent)
    return (
      <aside className="app__hint">
        <strong>{ios ? APP_STRINGS.push.iosTitle : APP_STRINGS.install.title}</strong>
        {ios ? APP_STRINGS.push.iosBody : APP_STRINGS.install.body}
        <button
          type="button"
          className="app__hint-close"
          aria-label={APP_STRINGS.install.dismiss}
          onClick={() => {
            setState('hidden')
            try {
              window.localStorage.setItem(DISMISSED_KEY, '1')
            } catch {
              // Not remembered this time; the hint simply comes back.
            }
          }}
        >
          ×
        </button>
      </aside>
    )
  }

  return (
    <aside className="app__hint">
      <strong>{APP_STRINGS.push.title}</strong>
      {APP_STRINGS.push.body}
      <div className="app__hint-actions">
        <button type="button" className="app__button app__button--small" disabled={busy} onClick={enable}>
          {busy ? APP_STRINGS.push.enabling : APP_STRINGS.push.enable}
        </button>
      </div>
      {error && <p className="app__answer-error">{error}</p>}
    </aside>
  )
}
