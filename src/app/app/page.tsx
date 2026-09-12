import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ONBOARDING_COOKIE, needsOnboarding } from '@/lib/app/onboarding'
import { resolveAppViewer } from '@/lib/app/viewer'
import { deniedFor } from './DeniedPage'

// `/app` — the front door, and nothing else (#473, #495).
//
// It used to BE the Izvedbe list, which only worked while everybody who could
// sign in was a dancer. Cecilija's landing screen is now the person's first
// tab, computed from their permission set: Izvedbe for a moreškant, Narudžbe
// for the secretary, Prodaja for a partner. So this page decides and forwards.
//
// A 307, never a 308: the destination depends on who is asking, and a browser
// that cached one person's landing screen would send the next one to a refusal.
// `force-dynamic` for the same reason.
//
// The Dobrodošlica is sent from HERE and from nowhere else (#457): every other
// page under `/app` opens on what it says it is, so a push deep-link into
// tonight's postava can never land on a walkthrough.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function AppLandingPage() {
  const viewer = await resolveAppViewer()

  // Decided out of the viewer itself and BEFORE the two early exits, so every
  // input the rule reads is the real one (#457 review): the signed-out and the
  // denied cases are the rule's to answer, not this file's to pre-empt.
  const jar = await cookies()
  const welcome = needsOnboarding({
    signedIn: viewer.signedIn,
    denied: viewer.access.kind === 'denied',
    hasMember: viewer.me != null,
    cookiePresent: jar.has(ONBOARDING_COOKIE),
  })

  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return deniedFor(viewer)
  if (welcome) redirect('/app/welcome')

  redirect(viewer.nav.landing ?? '/app/performances')
}
