import { redirect } from 'next/navigation'
import type { AppScreenKey } from '@/lib/app/screens'
import { resolveAppViewer, type AppViewer } from '@/lib/app/viewer'
import { DeniedPage, deniedFor } from './DeniedPage'

// The gate every Cecilija screen opens with (#473, #495).
//
// Three answers, one place, so no page has to remember the difference:
//
//   - **No session** → `/app/login`. Signing in is a thing the visitor can do,
//     so they are sent to do it.
//   - **Signed in, unlocks nothing** → the "Nemate pristup" panel.
//   - **Signed in, but not THIS screen** → the same panel with the way back to
//     their own landing screen. A stale bookmark explains itself instead of
//     bouncing somewhere silently or lying with a 404.
//
// The screen argument is a key from the one table (`lib/app/screens.ts`), so a
// page's gate and its tab can never drift apart. Pages with no screen of their
// own (Više's rows, the walkthrough) pass nothing and get the first two answers.
//
// A page may name MORE THAN ONE screen, and exactly one does: the performance
// detail at `/app/performances/[id]`, which is the evening BOTH Izvedbe and
// Moreška open (#565). It is still a gate on the table rather than a hole in
// it — either screen admits, neither being unlocked refuses — and it is what
// keeps a push notification's deep link working for a dancer who, since #565,
// no longer unlocks the Izvedbe list itself. Until #566 gives Stanje a route of
// its own, one page answers to two tabs.

export interface AppGate {
  viewer: AppViewer
  /** Render this and return when it is not null. */
  refusal: React.ReactNode | null
}

export async function openScreen(screen?: AppScreenKey | AppScreenKey[]): Promise<AppGate> {
  const viewer = await resolveAppViewer()

  if (!viewer.signedIn) redirect('/app/login')

  if (viewer.access.kind === 'denied') return { viewer, refusal: deniedFor(viewer) }

  const wanted = screen == null ? [] : Array.isArray(screen) ? screen : [screen]

  if (wanted.length > 0 && !viewer.access.screens.some((s) => wanted.includes(s.key))) {
    return {
      viewer,
      refusal: (
        <DeniedPage landing={viewer.nav.landing} dev={viewer.permissions.includes('dev')} />
      ),
    }
  }

  return { viewer, refusal: null }
}
