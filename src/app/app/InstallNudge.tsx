'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { decideInstallOffer } from '@/lib/app/install-nudge'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Card } from './ui'
import { isSnoozed, snooze, useInstallPrompt, usePlatform } from './use-install'

// The install offer on Početna (#616).
//
// One card, one question, and the question is asked of the BROWSER: the rule it
// renders (`lib/app/install-nudge.ts`) reads `display-mode: standalone` rather
// than a cookie, so the offer is gone the moment the app is on the home screen
// and comes back on a device that is still a tab. That is the whole fix: the
// Dobrodošlica's cookie said "welcomed" for a year while two people's home
// screens stayed empty.
//
// Everything is read after mount. `usePlatform` is a `useSyncExternalStore`
// whose server snapshot is honestly `null`, and the snooze is a localStorage
// read that starts as "quiet": the server renders nothing, the first client
// render renders nothing, and the card appears a frame later once the browser
// has actually been asked. A card that rendered during SSR would be a hydration
// mismatch and, worse, a flash of "install me" on an installed phone.
//
// The way on differs by platform and that is not cosmetic. Where Chromium
// parked a `beforeinstallprompt` the install is one tap and the card does it
// here; everywhere else the card hands over to `/app/install`, the same
// full-screen guide the rehearsal QR points at, rather than repeating three
// numbered steps under the greeting.

const S = APP_STRINGS.install

export function InstallNudge() {
  const platform = usePlatform()
  const { canPrompt, install } = useInstallPrompt()
  // Quiet until the browser has been read: localStorage is not a render-time
  // fact, and starting at "not snoozed" would flash the card at somebody who
  // said "Kasnije" an hour ago.
  const [snoozed, setSnoozed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  /** This tap installed it. `platform` is read once, so the card closes itself. */
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    setSnoozed(isSnoozed())
  }, [])

  const later = useCallback(() => {
    snooze()
    setSnoozed(true)
  }, [])

  const run = useCallback(async () => {
    setFailed(false)
    setBusy(true)
    const accepted = await install()
    setBusy(false)
    if (accepted) setInstalled(true)
    // A refusal is not an error the reader has to fix; the card simply stays,
    // with the guide still one tap away. Only a thrown prompt says "failed".
    else setFailed(!canPrompt)
  }, [install, canPrompt])

  const offer =
    platform && !installed ? decideInstallOffer({ platform, snoozed, canPrompt }) : 'none'
  if (offer === 'none') return null

  const webview = offer === 'inapp'

  return (
    <Card className="app__install-nudge">
      <div className="app__install-nudge-head">
        <span className="app__install-nudge-icon" aria-hidden="true">
          <Download size={20} strokeWidth={1.75} />
        </span>
        <div>
          <b>{webview ? S.inappTitle : S.title}</b>
          <p>{webview ? S.inappBody : S.why}</p>
        </div>
      </div>

      {failed && <p className="app__install-nudge-failed">{S.failed}</p>}

      <div className="ui-btns">
        {!webview && canPrompt ? (
          <Button variant="primary" onClick={run} disabled={busy}>
            {busy ? S.acting : S.action}
          </Button>
        ) : (
          <Link className="ui-btn ui-btn--primary" href="/app/install">
            {S.nudgeGuide}
          </Link>
        )}
        <Button variant="link" onClick={later}>
          {S.snooze}
        </Button>
      </div>
    </Card>
  )
}
