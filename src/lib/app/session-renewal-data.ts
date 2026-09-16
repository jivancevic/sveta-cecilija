import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { decideSessionRenewal } from './session-renewal'

// Where the sliding session is ASKED FOR (#650).
//
// **The seam is the `(shell)` layout, and the choice is worth stating.** Three
// places could have carried this and two of them cannot do the job:
//
//  - **`src/proxy.ts`.** A proxy CAN set a cookie, and it is the obvious home
//    for "something on every request". But minting the cookie means
//    `addSessionToUser` — a write to `users.sessions` through the Postgres
//    adapter — and the proxy is the one file in this app that must not carry
//    Payload or a database connection.
//  - **A server component, directly.** `cookies().set()` throws outside a
//    Server Action or a Route Handler, so no page and no layout can put a
//    `Set-Cookie` on its own response.
//  - **The `(shell)` layout + a background POST**, which is what this is. The
//    layout already resolves the viewer, already runs on every `/app` screen
//    and — unlike `AppShell` — survives a client navigation (#593), so it fires
//    once per document load rather than once per tab tap. It covers exactly the
//    signed-in screens: the shell-less pages (`login`, `session`, `join`,
//    `install`) are the ones where there is no session to slide.
//
// The decision is made HERE, on the server, so the fetch happens only on the
// one load in a week where there is something to do; a browser that never runs
// the script simply keeps the thirty-day session Cecilija has always had.
//
// This is the general shape for "server decides, the page quietly tells a route
// afterwards", and #652's device heartbeat hangs off the same seam: another
// flag out of this file, another field on `SessionKeeper`'s one POST.

/**
 * Should this request's page quietly ask for a fresh cookie?
 *
 * Reads the request's own `Cookie` header and applies the pure rule. Never
 * throws: a failure here must not take a screen down over a cookie that is
 * still perfectly valid for weeks.
 */
export async function appSessionRenewalDue(now: Date = new Date()): Promise<boolean> {
  try {
    const [payload, requestHeaders] = await Promise.all([getPayload({ config }), headers()])
    return decideSessionRenewal({
      cookieHeader: requestHeaders.get('cookie'),
      cookiePrefix: payload.config.cookiePrefix,
      now,
    })
  } catch (err) {
    console.error('[app] session renewal check failed', err)
    return false
  }
}
