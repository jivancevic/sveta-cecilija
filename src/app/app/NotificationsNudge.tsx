'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellOff } from 'lucide-react'
import { decideInstallOffer } from '@/lib/app/install-nudge'
import { decideNotificationsNudge } from '@/lib/app/notifications-nudge'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Card, Note } from './ui'
import { hasPushSubscription, subscribeToPush } from './push-client'
import {
  notificationPermission,
  pushSupported,
  useInstallPrompt,
  usePlatform,
  useSnoozed,
} from './use-install'

// "Na ovom uređaju ne primaš obavijesti" (#682).
//
// The rule is `lib/app/notifications-nudge.ts` and nothing here decides
// anything: this component's whole job is to ask the browser the five questions
// that rule takes, and to render the two answers that are not silence.
//
// It is the install card's sibling in shape and its opposite in temperament.
// That one is an OFFER and can be put off for a day; this one cannot be put off
// at all, because a dancer whose phone does not ring does not learn about the
// evening. So there is no "Kasnije" here, and the only way it goes is the one
// that fixes it.
//
// **The switch is here, not behind a link.** Profil has the setting and this is
// not a second setting — it is the one tap that does the thing, under the
// greeting, where the person already is. A card that sends somebody to another
// screen to fix something is a card whose thing does not get fixed.
//
// Everything is read after mount, like `InstallNudge`: the subscription check
// is asynchronous and `usePlatform`'s server snapshot is honestly `null`, so the
// server renders nothing and so does the first client frame. A card that
// rendered during SSR would flash "turn these on" at a phone that already rings.

const S = APP_STRINGS.push

export function NotificationsNudge({
  isDancer,
  vapidPublicKey,
}: {
  isDancer: boolean
  vapidPublicKey: string | null
}) {
  const platform = usePlatform()
  const snoozed = useSnoozed()
  const { canPrompt } = useInstallPrompt()
  /** `undefined` while the browser has not answered; then its three answers. */
  const [subscribed, setSubscribed] = useState<boolean | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const look = async () => {
      const answer = vapidPublicKey ? await hasPushSubscription() : false
      if (!cancelled) setSubscribed(answer)
    }
    void look()
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey])

  const turnOn = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await subscribeToPush(vapidPublicKey)
    setBusy(false)
    // Only a subscription closes the card. A refusal re-reads the permission
    // instead, which turns the card into its `blocked` self on the next render
    // rather than leaving a button that will now never work.
    if (result === 'subscribed') setSubscribed(true)
    else setError(result === 'denied' ? S.denied : S.failed)
  }, [busy, vapidPublicKey])

  if (subscribed === undefined) return null

  const nudge = decideNotificationsNudge({
    isDancer,
    platform,
    installOffer: platform ? decideInstallOffer({ platform, snoozed, canPrompt }) : 'none',
    pushSupported: pushSupported(),
    subscribed,
    permission: notificationPermission(),
  })
  if (nudge === 'none') return null

  return (
    <Card className="app__install-nudge">
      <div className="app__install-nudge-head">
        <span className="app__install-nudge-icon" aria-hidden="true">
          <BellOff size={20} strokeWidth={1.75} />
        </span>
        <div>
          <b>{S.nudgeTitle}</b>
          <p>{nudge === 'blocked' ? S.denied : S.nudgeBody}</p>
        </div>
      </div>

      {error && <Note>{error}</Note>}

      {/* Ghost rather than primary, for `InstallNudge`'s reason: nobody opens
          Početna to manage notifications, and the evening above this card is
          the job. A blocked device gets no button at all — the sentence above
          names the only place that can fix it. */}
      {nudge === 'enable' && (
        <div className="ui-btns">
          <Button variant="ghost" onClick={turnOn} disabled={busy}>
            {busy ? S.nudgeActing : S.nudgeAction}
          </Button>
        </div>
      )}
    </Card>
  )
}
