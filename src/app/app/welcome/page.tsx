import { getSeasonPerformances } from '@/lib/app/roster-data'
import { pickNextPerformance } from '@/lib/app/roster-loaders'
import { formatPerformanceDate } from '@/lib/app/strings'
import { calendarFeedUrl } from '@/lib/calendar/feed'
import { vapidPublicKey } from '@/lib/push/vapid'
import { openScreen } from '../gate'
import { Onboarding } from './Onboarding'

// `/app/welcome` — the Dobrodošlica (#457, glossary: *Dobrodošlica*).
//
// No tab bar and no brand header: the walkthrough is the only thing on the
// screen, because every one of its three steps is a question the dancer has to
// answer with a system dialog, and a bar underneath inviting them somewhere
// else is an invitation to answer none of them.
//
// The page itself decides nothing about the steps — that is the client's, since
// "already installed" is a browser fact. It only hands down the three server
// facts the steps need: the push key, the calendar URL and the sentence about
// the next evening. A deployment missing either of the first two simply shows a
// step fewer.
//
// It never sets the cookie. Reaching this page is not seeing it through, which
// is also what makes the Više tab's "Dobrodošlica" row a harmless replay.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const { viewer, refusal } = await openScreen()
  if (refusal) return refusal

  const me = viewer.me
  const voditelj = viewer.voditelj
  const season = await getSeasonPerformances({ memberId: me?.id ?? null, voditelj })
  const next = pickNextPerformance(season.upcoming)

  const calendarUrl = calendarFeedUrl(
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.CALENDAR_FEED_TOKEN,
  )

  return (
    <Onboarding
      vapidPublicKey={vapidPublicKey()}
      calendarUrl={calendarUrl}
      nextPerformanceLabel={next ? formatPerformanceDate(next.date) : null}
    />
  )
}
