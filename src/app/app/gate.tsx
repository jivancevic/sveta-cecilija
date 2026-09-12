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

export interface AppGate {
  viewer: AppViewer
  /** Render this and return when it is not null. */
  refusal: React.ReactNode | null
}

export async function openScreen(screen?: AppScreenKey): Promise<AppGate> {
  const viewer = await resolveAppViewer()

  if (!viewer.signedIn) redirect('/app/login')

  if (viewer.access.kind === 'denied') return { viewer, refusal: deniedFor(viewer) }

  if (screen && !viewer.access.screens.some((s) => s.key === screen)) {
    return {
      viewer,
      refusal: (
        <DeniedPage landing={viewer.nav.landing} dev={viewer.permissions.includes('dev')} />
      ),
    }
  }

  return { viewer, refusal: null }
}
