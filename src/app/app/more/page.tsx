import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import { calendarFeedUrl } from '@/lib/calendar/feed'
import { AppShell } from '../AppShell'
import { CalendarPanel } from '../CalendarPanel'
import { LogoutButton } from '../LogoutButton'
import { openScreen } from '../gate'

// `/app/more` — the Više screen (#457, renamed and generalised by #495).
//
// Two kinds of row, in this order (#472):
//
//  1. **The overflow**: every screen this person unlocks that did not fit the
//     four tabs. It is computed, not written down, so a secretary who is given
//     one more permission finds the new screen here without anybody editing
//     this file.
//  2. **The standing rows**: the things anybody does once a season — the
//     walkthrough, the install guide, their own account, the way out — plus the
//     voditelj's invitations and, for a `dev` holder only, the Backoffice.
//
// No `/admin` link for anybody else (#473): raw Payload is a developer's tool,
// and Cecilija is what everyone else works in.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function MorePage() {
  const { viewer, refusal } = await openScreen()
  if (refusal) return refusal

  const dev = viewer.permissions.includes('dev')

  // Both halves are server facts handed down as one prop: a deployment missing
  // either simply shows no panel, rather than a heading over a broken link.
  const calendarUrl = calendarFeedUrl(
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.CALENDAR_FEED_TOKEN,
  )

  return (
    <AppShell viewer={viewer} screen="more">
      <nav className="app__more">
        {viewer.nav.overflow.map((screen) => (
          <Link className="app__more-row" key={screen.key} href={screen.route}>
            {screen.label}
            <span aria-hidden="true">›</span>
          </Link>
        ))}

        {/* The voditelj's own onboarding screen (#463): invitations by SMS and
            the rehearsal join code. It is here rather than in the Backoffice
            because both are done standing in the room, on the phone in their
            hand. It folds into Članovi when that screen lands (#511). */}
        {viewer.voditelj && (
          <Link className="app__more-row" href="/app/invitations">
            {APP_STRINGS.inviteLink.title}
            <span aria-hidden="true">›</span>
          </Link>
        )}

        <Link className="app__more-row" href="/app/account">
          {APP_STRINGS.screens.account}
          <span aria-hidden="true">›</span>
        </Link>

        {/* The walkthrough, replayable: the page sets the cookie only when it
            is finished or skipped, so opening it again changes nothing. */}
        <Link className="app__more-row" href="/app/welcome">
          {APP_STRINGS.more.onboarding}
          <span aria-hidden="true">›</span>
        </Link>

        {/* The same guide the Dobrodošlica's first step shows, full screen
            (#455). It lives here too because a dancer who skipped the
            walkthrough, or who is holding somebody else's phone at a rehearsal,
            needs a way back to it that is not three steps long. */}
        <Link className="app__more-row" href="/app/install">
          {APP_STRINGS.install.guideTitle}
          <span aria-hidden="true">›</span>
        </Link>

        {dev && (
          // The Backoffice is a different app under the same origin, so this is
          // a plain navigation rather than a client transition.
          <Link className="app__more-row" href="/admin" prefetch={false}>
            {APP_STRINGS.more.admin}
            <span aria-hidden="true">›</span>
          </Link>
        )}
      </nav>

      {calendarUrl && (
        <section className="app__more-block">
          <h2 className="app__month-head">
            <span>{APP_STRINGS.more.calendar}</span>
          </h2>
          <CalendarPanel url={calendarUrl} />
        </section>
      )}

      <div className="app__more-logout">
        <LogoutButton className="app__button app__button--quiet" />
      </div>
    </AppShell>
  )
}
