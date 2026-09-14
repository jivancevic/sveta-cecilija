'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { BellOff } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { AppPlatform } from '@/lib/app/platform'
import { Note, Switch } from '../ui'
import { hasPushSubscription, subscribeToPush, unsubscribeFromPush } from '../push-client'
import { pushSupported, readPlatform } from '../use-install'

// Does this phone ring (#569, Q49)?
//
// It replaces the `InstallHint` banner that used to stand here. That banner
// asked a question — "uključi obavijesti?" — and answered it with a button
// whose label flipped to "Isključi" once you had. A banner you have to read to
// know the state of is not a setting, and Profil is where settings live now, so
// the question became a switch you can see the state of.
//
// **Read from the browser, never from the server.** Whether THIS browser
// profile holds a subscription is a fact of this device, and the server's copy
// answers for some other phone the dancer signed in on. Which is also why
// nothing renders until it has looked: a switch that shows "isključeno" for a
// beat to somebody who turned it on last week is a lie with a spinner.
//
// Every browser call lives in `push-client.ts`, shared with step 2 of the
// Dobrodošlica: two screens, one notion of "obavijesti su uključene".
//
// **The three refusals are a Note, never a dead switch** (the ticket). A phone
// that cannot subscribe at all — an iPhone that is still a Safari tab, a webview
// inside Viber, a browser with no `PushManager` — is not a phone whose switch is
// off. It is a phone with a thing to do first, so it gets the sentence that says
// what, and the iPhone's links to the install guide that does it.

const S = APP_STRINGS.push

type State = 'looking' | 'off' | 'on'

/** Why this device has no switch at all, or null when it has one. */
function blockedReason(platform: AppPlatform | null): 'install' | 'inapp' | 'unsupported' | null {
  if (platform === 'inapp') return 'inapp'
  // An iPhone exposes no `PushManager` until the app is on the home screen, so
  // on iOS the install IS the notification switch.
  if (platform === 'ios') return 'install'
  return pushSupported() ? null : 'unsupported'
}

export function PushSwitch({ vapidPublicKey }: { vapidPublicKey?: string | null }) {
  const [platform, setPlatform] = useState<AppPlatform | null>(null)
  const [state, setState] = useState<State>('looking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const look = async () => {
      const here = readPlatform()
      const subscribed = vapidPublicKey ? await hasPushSubscription() : false
      if (cancelled) return
      setPlatform(here)
      setState(subscribed === true ? 'on' : 'off')
    }
    void look()
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey])

  async function toggle(next: boolean) {
    if (busy) return
    setBusy(true)
    setError(null)
    if (next) {
      const result = await subscribeToPush(vapidPublicKey)
      if (result === 'subscribed') setState('on')
      else setError(result === 'denied' ? S.denied : S.failed)
    } else {
      // Only a successful unsubscribe turns the switch off (#457 review): a
      // failure that flipped it anyway would tell a dancer the phone is quiet
      // while it keeps ringing, and leave them no button to try again with.
      const ok = await unsubscribeFromPush()
      if (ok) setState('off')
      else setError(S.failed)
    }
    setBusy(false)
  }

  if (state === 'looking') return null

  const blocked = vapidPublicKey ? blockedReason(platform) : 'unsupported'

  if (blocked === 'install') {
    return (
      <Note icon={<BellOff size={18} strokeWidth={1.75} />}>
        {S.needsInstall}{' '}
        <Link href="/app/install">{APP_STRINGS.more.install}</Link>
      </Note>
    )
  }
  if (blocked !== null) {
    return (
      <Note icon={<BellOff size={18} strokeWidth={1.75} />}>
        {blocked === 'inapp' ? S.inapp : S.unsupported}
      </Note>
    )
  }

  return (
    <>
      <Switch
        checked={state === 'on'}
        onChange={toggle}
        busy={busy}
        label={S.switchLabel}
        note={state === 'on' ? S.switchOn : S.switchOff}
      />
      {error && <Note>{error}</Note>}
    </>
  )
}
