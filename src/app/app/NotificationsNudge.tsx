'use client'

import { useCallback, useState } from 'react'
import { BellOff } from 'lucide-react'
import { decideInstallOffer } from '@/lib/app/install-nudge'
import { decideNotificationsNudge } from '@/lib/app/notifications-nudge'
import { pushRefusal } from '@/lib/app/push-refusal'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Card, Note } from './ui'
import { notificationPermission, subscribeToPush } from './push-client'
import { useInstallPrompt, usePlatform, usePushFacts, useSnoozed } from './use-install'

// "Na ovom uređaju ne primaš obavijesti" (#682).
//
// The rule is `lib/app/notifications-nudge.ts` and nothing here decides
// anything: this component's whole job is to hand that rule the facts and
// render the two answers that are not silence.
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
// Nothing renders until the browser has answered: `usePushFacts` starts at
// `looking` and `usePlatform`'s server snapshot is honestly `null`, so the
// server renders nothing and so does the first client frame. A card that
// rendered during SSR would flash "turn these on" at a phone that already rings.

const S = APP_STRINGS.push

export function NotificationsNudge({
  isDancer,
  vapidPublicKey,
  fallback = null,
}: {
  isDancer: boolean
  vapidPublicKey: string | null
  /**
   * What to draw when this card has nothing to say (#682). Početna passes
   * nothing and gets nothing; Obavijesti passes its empty-inbox card, because
   * that card promises "javit ćemo ti" and must not stand beside a card saying
   * this phone will not hear it.
   */
  fallback?: React.ReactNode
}) {
  const platform = usePlatform()
  const snoozed = useSnoozed()
  const { canPrompt } = useInstallPrompt()
  const facts = usePushFacts(vapidPublicKey)
  /** This tap subscribed. `facts` is read once, so the card closes itself. */
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const turnOn = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await subscribeToPush(vapidPublicKey)
    setBusy(false)
    if (result === 'subscribed') {
      setSubscribed(true)
      return
    }
    // A refusal is not an error line. `subscribeToPush` answers `denied` for a
    // prompt that was merely DISMISSED as well as one that was refused, so the
    // browser is asked which it was: a real denial re-renders this card as its
    // `blocked` self, whose body already says where to unblock, and saying it
    // again underneath would be the same sentence twice. A dismissal leaves the
    // button, because the next tap can still work.
    if (notificationPermission() !== 'denied') setError(S.failed)
  }, [busy, vapidPublicKey])

  if (facts.state === 'looking' || platform === null) return <>{fallback}</>

  const nudge = subscribed
    ? 'none'
    : decideNotificationsNudge({
        isDancer,
        installOffer: decideInstallOffer({ platform, snoozed, canPrompt }),
        refusal: pushRefusal({ platform, pushSupported: facts.supported }),
        subscribed: facts.subscribed,
        permission: facts.permission,
      })
  if (nudge === 'none') return <>{fallback}</>

  return (
    <Card className="app__nudge">
      <div className="app__nudge-head">
        <span className="app__nudge-icon" aria-hidden="true">
          <BellOff size={20} strokeWidth={1.75} />
        </span>
        <div>
          <b>{S.nudgeTitle}</b>
          <p>{nudge === 'blocked' ? S.denied : S.nudgeBody}</p>
        </div>
      </div>

      {error && <Note>{error}</Note>}

      {/* Ghost and not primary, for `InstallNudge`'s reason: nobody opens
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
