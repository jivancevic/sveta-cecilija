import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import type { AppViewer } from '@/lib/app/viewer'
import { LogoutButton } from './LogoutButton'

// "Nemate pristup" (#419 story 37, rewritten by #473).
//
// Two refusals wear the same panel, and the difference is what they offer:
//
//   - **No screen at all.** The account is signed in and unlocks nothing. There
//     is nowhere to send it, so it gets the explanation and the way out.
//   - **A screen this account does not hold.** Somebody typed a route, or
//     followed a stale bookmark, or was sent a link by a colleague who holds
//     more than they do. It gets the way back to its own landing screen —
//     never a silent redirect, which hides the stale bookmark, and never a 404,
//     which lies about the page existing.
//
// The Backoffice link is for a `dev` holder and nobody else (#473): raw Payload
// is a developer's tool, and a secretary who lands here must not be invited
// into it. It carries NO tab bar in the first case: a bar offering more doors
// to the same refusal would only invite tapping them.

export function DeniedPage({
  /** The landing route of an account that holds SOMETHING, if it holds anything. */
  landing,
  /** Only a `dev` holder is offered raw Payload. */
  dev = false,
}: {
  landing?: string | null
  dev?: boolean
} = {}) {
  const wrongScreen = landing != null

  return (
    <main className="app__panel">
      <h1>{wrongScreen ? APP_STRINGS.denied.screenTitle : APP_STRINGS.denied.title}</h1>
      <p>{wrongScreen ? APP_STRINGS.denied.screenBody : APP_STRINGS.denied.body}</p>

      {wrongScreen && (
        <p>
          <Link className="app__button app__button--link" href={landing}>
            {APP_STRINGS.denied.back}
          </Link>
        </p>
      )}

      {dev && (
        <p>
          <Link className="app__link" href="/admin" prefetch={false}>
            {APP_STRINGS.denied.adminLink}
          </Link>
        </p>
      )}

      {!wrongScreen && <LogoutButton className="app__button" />}
    </main>
  )
}

/** The panel for a viewer that is signed in but unlocks nothing. */
export function deniedFor(viewer: AppViewer) {
  return <DeniedPage dev={viewer.permissions.includes('dev')} />
}
