'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { decideInstallStep, type AppPlatform, type InstallStep } from '@/lib/app/platform'
import { APP_STRINGS } from '@/lib/app/strings'
import { InstallSteps, type StepPlatform } from './InstallSteps'
import { hasPushSubscription, subscribeToPush, unsubscribeFromPush } from './push-client'
import {
  isSnoozed,
  pushSupported,
  readPlatform,
  snooze,
  useInstallPrompt,
  webviewHostIsIos,
} from './use-install'

// The one banner in the Više tab: install (#421), notifications (#431), and
// since #455 the platform it is actually talking to.
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
//
// Every browser call it makes lives in `push-client.ts` (#457), shared with
// step 2 of the Dobrodošlica: two screens, one notion of "subscribed".
//
// It carries its OWN heading (#457): the Više tab used to print the heading and
// let this component decide whether anything went under it, which left a title
// over nothing on a device with nothing to offer. The heading and the body are
// one decision, so they are made in one place.

/** `installed` and `inapp` never reach the step list; the rest map straight through. */
function stepPlatform(platform: AppPlatform): StepPlatform {
  if (platform === 'ios') return 'ios'
  if (platform === 'android') return 'android'
  return 'desktop'
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
      const hasSubscription = vapidPublicKey ? await hasPushSubscription() : false
      if (cancelled) return
      setSubscribed(hasSubscription === true)
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
    const result = await subscribeToPush(vapidPublicKey)
    if (result === 'subscribed') setSubscribed(true)
    else setError(result === 'denied' ? APP_STRINGS.push.denied : APP_STRINGS.push.failed)
    setBusy(false)
  }

  async function disable() {
    if (busy) return
    setBusy(true)
    setError(null)
    const ok = await unsubscribeFromPush()
    // Only a successful unsubscribe turns the switch off (#457 review). A
    // failure that still flipped it would tell a dancer the phone is quiet
    // while it keeps ringing, and leave them no button to try again with.
    if (ok) setSubscribed(false)
    else setError(APP_STRINGS.push.failed)
    setBusy(false)
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
      <Block title={APP_STRINGS.more.notifications}>
        <aside className="app__hint app__hint--quiet">
          <span>{APP_STRINGS.push.onTitle}</span>
          <button type="button" className="app__hint-link" disabled={busy} onClick={disable}>
            {busy ? APP_STRINGS.push.disabling : APP_STRINGS.push.disable}
          </button>
          {error && <p className="app__answer-error">{error}</p>}
        </aside>
      </Block>
    )
  }

  if (step === 'inapp') {
    return (
      <Block title={APP_STRINGS.install.guideTitle}>
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
      </Block>
    )
  }

  if (step === 'install') {
    return (
      <Block title={APP_STRINGS.install.guideTitle}>
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
            {/* The heading above already says "Instalacija", so the link says
                what is on the other side of it instead. */}
            <Link className="app__hint-link" href="/app/instalacija">
              {APP_STRINGS.onboarding.install.guide}
            </Link>
            {laterButton}
          </div>
        </aside>
      </Block>
    )
  }

  // 'push': notifications are the offer, and on a Chromium tab that has not
  // been installed yet the one-tap install rides along underneath.
  return (
    <Block title={APP_STRINGS.more.notifications}>
      <aside className="app__hint">
        <strong>{APP_STRINGS.push.title}</strong>
        {APP_STRINGS.push.body}
        <div className="app__hint-actions">
          <button
            type="button"
            className="app__button app__button--small"
            disabled={busy}
            onClick={enable}
          >
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
        {(!canPrompt || platform === 'installed') && (
          <div className="app__hint-foot">{laterButton}</div>
        )}
      </aside>
    </Block>
  )
}

/** The section and its heading: one wrapper, so the title never stands alone. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="app__more-block">
      <h2 className="app__month-head">
        <span>{title}</span>
      </h2>
      {children}
    </section>
  )
}
