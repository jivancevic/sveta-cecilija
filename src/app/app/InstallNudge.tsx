'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Download, RefreshCw } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import { ChromeRoute } from './ChromeRoute'
import { Button, Card, Note } from './ui'
import { snooze, snoozeReinstall, useInstallOffer, useInstallPrompt } from './use-install'

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
  const { canPrompt, install } = useInstallPrompt()
  const decided = useInstallOffer(canPrompt)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  /** This tap installed it. The offer is read once, so the card closes itself. */
  const [installed, setInstalled] = useState(false)

  // No local state for the snooze: `snooze()` writes localStorage and tells the
  // store, and this component re-renders because it is reading that store.
  const later = useCallback(() => {
    snooze()
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

  const offer = installed ? 'none' : (decided ?? 'none')
  if (offer === 'none') return null
  if (offer === 'reinstall') return <ReinstallCard />

  const webview = offer === 'inapp'

  return (
    <Card className="app__nudge">
      <div className="app__nudge-head">
        <span className="app__nudge-icon" aria-hidden="true">
          <Download size={20} strokeWidth={1.75} />
        </span>
        <div>
          <b>{webview ? S.inappTitle : S.title}</b>
          <p>{webview ? S.inappBody : S.why}</p>
        </div>
      </div>

      {failed && <p className="app__nudge-failed">{S.failed}</p>}

      {/* Ghost and not primary, deliberately (Button's own rule: one primary per
          screen, and it is the thing you came to do). Nobody opens Početna to
          install an app — the evening above this card is the job, and a gold
          button here would out-shout it. */}
      <div className="ui-btns">
        {!webview && canPrompt ? (
          <Button variant="ghost" onClick={run} disabled={busy}>
            {busy ? S.acting : S.action}
          </Button>
        ) : (
          <Link className="ui-btn ui-btn--ghost" href="/app/install">
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

/**
 * "Ova ikona je instalirana iz drugog preglednika" (#684).
 *
 * The one thing in the app that can say it: an icon built by Samsung Internet
 * runs in Samsung's engine with Samsung's storage, so the login, the theme and
 * the push subscription behind it are not the ones the dancer set in Chrome,
 * and no server can see which engine an icon is. It reuses the install offer's
 * slot, which is empty for exactly these people.
 *
 * Snoozable, unlike #682's notifications card beside it, and for a week rather
 * than a day: reinstalling costs this device its push subscription, so it is a
 * chore somebody may reasonably put off, and asking again tomorrow would teach
 * them to stop reading the card.
 *
 * The way on is the guide's own pair, rendered by the guide's own component
 * (`ChromeRoute`): the app has one way of handing somebody Chrome, and it is
 * not written twice.
 */
function ReinstallCard() {
  return (
    <Card className="app__nudge">
      <div className="app__nudge-head">
        <span className="app__nudge-icon" aria-hidden="true">
          <RefreshCw size={20} strokeWidth={1.75} />
        </span>
        <div>
          <b>{S.reinstallTitle}</b>
          <p>{S.reinstallBody}</p>
          <p>{S.reinstallHow}</p>
        </div>
      </div>

      <ChromeRoute look="card" renderNote={(text) => <Note>{text}</Note>}>
        <Button variant="link" onClick={() => snoozeReinstall()}>
          {S.snooze}
        </Button>
      </ChromeRoute>
    </Card>
  )
}
