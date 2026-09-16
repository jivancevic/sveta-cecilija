'use client'

import { useEffect } from 'react'

// The one background call that keeps a dancer signed in (#650).
//
// Renders nothing, and is mounted by the `(shell)` layout ONLY when the server
// has already decided there is something to do — the layout reads the cookie's
// own age (`appSessionRenewalDue`), so on the other six days of the week this
// component is not in the tree at all and the app makes no extra request.
//
// It lives in the layout rather than on a screen for the same reason
// `ScrollMemory` does: the layout survives a client navigation, so this fires
// once per document load instead of once per tab tap.
//
// Failures are swallowed on purpose. The cookie this is extending is still good
// for weeks; a dancer on a lift with no signal must not see anything at all.
export function SessionKeeper() {
  useEffect(() => {
    void fetch('/api/app/session/renew', {
      method: 'POST',
      // `application/json` and a same-origin credential: the two things
      // `rejectAppRequest` looks for on a cookie-setting POST.
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'same-origin',
    }).catch(() => {})
  }, [])

  return null
}
