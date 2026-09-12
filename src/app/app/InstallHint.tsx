'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { decideInstallStep, type AppPlatform, type InstallStep } from '@/lib/app/platform'
import { APP_STRINGS } from '@/lib/app/strings'
import { InstallSteps, type StepPlatform } from './InstallSteps'
import {
  isSnoozed,
  pushSupported,
  readPlatform,
  snooze,
  useInstallPrompt,
  webviewHostIsIos,
} from './use-install'

// The one banner under the season list: install (#421), notifications (#431),
// and since #455 the platform it is actually talking to.
//
// ONE component rather than several stacked banners, because these are one
// question asked in the right order. What changed in #455 is which order, and
// that the order is now a decision in `src/lib/app/platform.ts` rather than a
// chain of ifs here:
//
//   - a webview (Viber, WhatsApp, Messenger) can neither install nor subscribe,
//     so it gets the way out and nothing else;
//   - an uninstalled iPhone is asked to install, because on iOS that IS the
//     notification switch;
//   - an Android tab is offered notifications FIRST, because they work in a
//     plain tab there, with installing as a one-tap bonus rather than a toll.
//     The old order never reached the install offer on Android at all: Chrome
//     always has a `PushManager`, so the branch that mentioned installing was
//     dead code on the platform where it is easiest.
//
// The state is READ FROM THE BROWSER, never from the server: whether this
// particular device holds a subscription is a fact of this browser profile, and
// asking the server would answer for some other phone. Which is also why the
// component renders nothing until it has looked - a banner that flashes "turn
// on notifications" at somebody who turned them on last week is worse than a
// beat of silence.

// The worker script lives at the ROOT so it can claim `/app` itself, not only
// `/app/…` — see the header of `public/moreskant-sw.js`.
const SW_URL = '/moreskant-sw.js'
const SW_SCOPE = '/app'

/** `installed` and `inapp` never reach the step list; the rest map straight through. */
function stepPlatform(platform: AppPlatform): StepPlatform {
  if (platform === 'ios') return 'ios'
  if (platform === 'android') return 'android'
  return 'desktop'
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

export function InstallHint({ vapidPublicKey }: { vapidPublicKey?: string | null }) {
  const [platform, setPlatform] = useState<AppPlatform | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [snoozed, setSnoozed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { canPrompt, install } = useInstallPrompt()

  // `platform === null` is "has not looked yet" and renders nothing.
  useEffect(() => {
    let cancelled = false
    const look = async () => {
      const here = readPlatform()
      const later = isSnoozed()
      let hasSubscription = false
      if (vapidPublicKey && pushSupported()) {
        try {
          const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE)
          hasSubscription = (await registration?.pushManager.getSubscription()) != null
        } catch {
          hasSubscription = false
        }
      }
      if (cancelled) return
      setSubscribed(hasSubscription)
      setSnoozed(later)
      setPlatform(here)
    }
    void look()
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey])

  const later = useCallback(() => {
    snooze()
    setSnoozed(true)
  }, [])

  async function runInstall() {
    if (busy) return
    setBusy(true)
    setError(null)
    const accepted = await install()
    setBusy(false)
    if (accepted) {
      // The tab itself is not standalone after an Android install, but for this
      // banner the question is answered: the icon exists, so move on to the
      // notification offer rather than keep asking for the icon.
      setPlatform('installed')
      return
    }
    setError(APP_STRINGS.install.failed)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      setCopied(false)
      setError(APP_STRINGS.install.failed)
    }
  }

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
      setSubscribed(true)
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
      setSubscribed(false)
    } catch {
      setError(APP_STRINGS.push.failed)
    } finally {
      setBusy(false)
    }
  }

  if (platform === null) return null

  const step: InstallStep = decideInstallStep({
    platform,
    pushSupported: Boolean(vapidPublicKey) && pushSupported(),
    subscribed,
    snoozed,
  })

  if (step === 'none') return null

  /** "Kasnije" plus, on the install card, the link to the full guide. */
  const laterButton = (
    <button type="button" className="app__hint-link" onClick={later}>
      {APP_STRINGS.install.snooze}
    </button>
  )

  if (step === 'on') {
    return (
      <aside className="app__hint app__hint--quiet">
        <span>{APP_STRINGS.push.onTitle}</span>
        <button type="button" className="app__hint-link" disabled={busy} onClick={disable}>
          {busy ? APP_STRINGS.push.disabling : APP_STRINGS.push.disable}
        </button>
      </aside>
    )
  }

  if (step === 'inapp') {
    return (
      <aside className="app__hint">
        <strong>{APP_STRINGS.install.inappTitle}</strong>
        {APP_STRINGS.install.inappBody}
        <p className="app__install-how">
          {webviewHostIsIos() ? APP_STRINGS.install.inappIos : APP_STRINGS.install.inappAndroid}
        </p>
        <div className="app__hint-actions">
          <button type="button" className="app__button app__button--small" onClick={copyLink}>
            {APP_STRINGS.install.inappCopy}
          </button>
        </div>
        {copied && <p className="app__install-how">{APP_STRINGS.install.inappCopied}</p>}
        {error && <p className="app__answer-error">{error}</p>}
        <div className="app__hint-foot">{laterButton}</div>
      </aside>
    )
  }

  if (step === 'install') {
    return (
      <aside className="app__hint">
        <strong>{APP_STRINGS.install.title}</strong>
        {APP_STRINGS.install.why}
        <InstallSteps
          platform={stepPlatform(platform)}
          canPrompt={canPrompt}
          busy={busy}
          error={error}
          onInstall={runInstall}
        />
        <div className="app__hint-foot">
          <Link className="app__hint-link" href="/app/instalacija">
            {APP_STRINGS.install.guideTitle}
          </Link>
          {laterButton}
        </div>
      </aside>
    )
  }

  // 'push': notifications are the offer, and on a Chromium tab that has not
  // been installed yet the one-tap install rides along underneath.
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
      {canPrompt && platform !== 'installed' && (
        <div className="app__hint-foot">
          <button type="button" className="app__hint-link" disabled={busy} onClick={runInstall}>
            {busy ? APP_STRINGS.install.acting : APP_STRINGS.install.title}
          </button>
          {laterButton}
        </div>
      )}
      {(!canPrompt || platform === 'installed') && <div className="app__hint-foot">{laterButton}</div>}
    </aside>
  )
}
