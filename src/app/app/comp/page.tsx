import { loadCompScreen } from '@/lib/app/comp-screen-data'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { CompIssueSheet } from './CompIssueSheet'
import { PerMemberTable } from './PerMemberTable'
import { RecentComps } from './RecentComps'

// `/app/comp` — Gratis (#506), the secretary's comp-ticket screen.
//
// A port of the Backoffice comp panel into the Cecilija shell, not a redesign
// of what it does: the same picker, the same required member with its inline
// add, the same two steppers, the same `POST /api/comp/issue` that opens the
// PDF it answers with. The issue and cancel routes are untouched — they were
// already guarded by `requirePermission(req, 'tickets')` and they already hold
// every rule that matters (the seat lock, the `storno` void, ADR-0019's
// attribution).
//
// **The order changed with #570 (Q44).** The records come first — who has had
// how many this season, then what was handed out last — and the form is behind
// the one primary button at the top, in a sheet. Giving a comp away is a thing
// somebody does a few times a season with a person standing in front of them;
// reading the table is what the screen is opened for the rest of the time, and
// an eight-control form sitting open on top of it pushed both records off the
// phone.
//
// Promo codes are NOT here and that is the #476 decision, not an omission: none
// has ever been created, and the Backoffice's PromoCodes view remains the only
// place one is made.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.gratis

export default async function CompPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[] }>
}) {
  const { viewer, refusal } = await openScreen('comp')
  if (refusal) return refusal

  const params = await searchParams
  const requested = Array.isArray(params.season) ? params.season[0] : params.season
  const screen = await loadCompScreen(requested)

  return (
    <AppShell viewer={viewer} screen="comp">
      <CompIssueSheet shows={screen.shows} members={screen.members} />
      <PerMemberTable rows={screen.perMember} season={screen.season} seasons={screen.seasons} />
      <RecentComps initial={screen.recent} />
      <p className="app__hint app__comp-codes">{S.codesNote}</p>
    </AppShell>
  )
}
