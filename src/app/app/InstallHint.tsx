'use client'

import { useEffect, useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  hasPushSubscription,
  isIos,
  pushSupported,
  standalone,
  subscribeToPush,
  unsubscribeFromPush,
} from './push-client'

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
// Every browser call it makes lives in `push-client.ts` (#457), shared with
// step 2 of the Dobrodošlica: two screens, one notion of "subscribed".
//
// It carries its OWN "Obavijesti" heading (#457 review): the Više tab used to
// print the heading and let this component decide whether anything went under
// it, which left a title over nothing on a device that cannot do push. The
// heading and the body are one decision, so they are made in one place. The
// only state that still renders nothing at all is `unknown`, the beat before
// the browser has been asked.

const DISMISSED_KEY = 'moreskant.installHint.dismissed'

type BannerState = 'unknown' | 'install' | 'offer' | 'on' | 'hidden'

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
      const subscribed = await hasPushSubscription()
      if (!cancelled) setState(subscribed ? 'on' : 'offer')
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
    const result = await subscribeToPush(vapidPublicKey)
    if (result === 'subscribed') setState('on')
    else setError(result === 'denied' ? APP_STRINGS.push.denied : APP_STRINGS.push.failed)
    setBusy(false)
  }

  async function disable() {
    if (busy) return
    setBusy(true)
    setError(null)
    const ok = await unsubscribeFromPush()
    if (!ok) setError(APP_STRINGS.push.failed)
    setState('offer')
    setBusy(false)
  }

  // The beat of silence: nothing is known yet, so the section stays away
  // rather than guessing a heading it may have to take back.
  if (state === 'unknown') return null

  if (state === 'hidden') {
    // Reached only when this deployment or this browser has no push at all
    // (the install hint is the one thing that can be dismissed). A reader who
    // opened Više looking for the switch is owed the reason it is not there.
    return (
      <Block>
        <aside className="app__hint app__hint--quiet">
          <span>{APP_STRINGS.push.unavailable}</span>
        </aside>
      </Block>
    )
  }

  if (state === 'on') {
    return (
      <Block>
        <aside className="app__hint app__hint--quiet">
          <span>{APP_STRINGS.push.onTitle}</span>
          <button type="button" className="app__hint-link" disabled={busy} onClick={disable}>
            {busy ? APP_STRINGS.push.disabling : APP_STRINGS.push.disable}
          </button>
        </aside>
      </Block>
    )
  }

  if (state === 'install') {
    // Two audiences, one line: a phone that cannot do push yet (iOS, no home
    // screen icon) and a deployment with no keys. Both need the same sentence.
    const ios = pushSupported() === false && isIos()
    return (
      <Block>
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
      </Block>
    )
  }

  return (
    <Block>
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
      </aside>
    </Block>
  )
}

/** The section and its heading: one wrapper, so the title never stands alone. */
function Block({ children }: { children: React.ReactNode }) {
  return (
    <section className="app__more-block">
      <h2 className="app__month-head">
        <span>{APP_STRINGS.more.notifications}</span>
      </h2>
      {children}
    </section>
  )
}
