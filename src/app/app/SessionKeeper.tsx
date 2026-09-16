'use client'

import { useEffect } from 'react'
import { readStandalone } from './use-install'

// The one background call that keeps a dancer signed in (#650) and tells the
// server which browser this is (#652).
//
// Renders nothing, and is mounted by the `(shell)` layout ONLY when the server
// has already decided there is something to do — the layout reads the session
// cookie's own age and the device's own `last_seen_at`
// (`appKeeperWork`), so on an ordinary load this component is not in the tree
// at all and the app makes no extra request.
//
// It lives in the layout rather than on a screen for the same reason
// `ScrollMemory` does: the layout survives a client navigation, so this fires
// once per document load instead of once per tab tap.
//
// `standalone` is the ONE fact the server cannot read for itself: whether this
// browser is running as an installed app is `display-mode: standalone` (or
// iOS's `navigator.standalone`), which exists only in the browser. Everything
// else about the device — its name, its account, when it was last seen — is the
// route's, off the `HttpOnly` cookie it writes itself.
//
// Failures are swallowed on purpose. The cookie this is extending is still good
// for weeks and the device signal is a statistic; a dancer on a lift with no
// signal must not see anything at all.
export function SessionKeeper({ recordDevice = false }: { recordDevice?: boolean }) {
  useEffect(() => {
    void fetch('/api/app/session/renew', {
      method: 'POST',
      // `application/json` and a same-origin credential: the two things
      // `rejectAppRequest` looks for on a cookie-setting POST.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recordDevice ? { standalone: readStandalone() } : {}),
      credentials: 'same-origin',
    }).catch(() => {})
  }, [recordDevice])

  return null
}
