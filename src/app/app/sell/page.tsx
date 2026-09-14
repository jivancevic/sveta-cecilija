import { loadSellScreen } from '@/lib/app/sell-data'
import { formatEur } from '@/lib/app/orders-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { PartnerNotice } from '../PartnerNotice'
import { openScreen } from '../gate'
import { Card, Section } from '../ui'
import { RecentSales } from './RecentSales'
import { SellForm } from './SellForm'

// `/app/sell` — Prodaja (#505), the reseller's screen.
//
// A port of the Backoffice partner dashboard into the Cecilija shell, not a
// redesign: the same picker, the same two steppers, the same "Izdaj ulaznice"
// that opens the PDF the sell route returns, the same recent-sales list with
// its delete-then-undo cancel, and the same live month card. The four routes
// behind it (`/api/partner/sell`, `/api/partner/cancel`,
// `/api/partner/cancel/undo`, `/api/partner/sales`) are untouched — they were
// already guarded and already scoped by `src/lib/access/partner.ts`.
//
// What DID change is the order of the page. On a phone the sell form is the
// whole job, so it opens the screen; the standing card that used to sit above
// the season chart now closes it, because "what do I owe" is a question asked
// once a month and "sell two adults" is asked forty times an evening.
//
// **The skin is T1's since #574** and nothing else about the screen moved: the
// same five `/api/partner/*` routes, the same order of the page, the same
// delete-then-undo. The form and the recent sales stand side by side on a
// laptop (Q51) and stack on a phone, from the same markup.
//
// The partner id comes off the access decision, never off the request: the
// screen cannot be pointed at another reseller's sales even by a caller who
// edits the URL, because there is no id in the URL to edit.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function SellPage() {
  const { viewer, refusal } = await openScreen('sell')
  if (refusal) return refusal

  const partnerId = viewer.access.kind === 'ok' ? viewer.access.partnerId : null
  const screen = await loadSellScreen(partnerId)

  if (screen.state.kind !== 'ok') {
    return (
      <AppShell viewer={viewer} screen="sell">
        <PartnerNotice state={screen.state} />
      </AppShell>
    )
  }

  return (
    <AppShell viewer={viewer} screen="sell" title={screen.state.partner.name}>
      <div className="app__cols">
        <SellForm shows={screen.shows} />
        <RecentSales initial={screen.recent} />
      </div>

      <section className="app__col app__partner-month">
        <Section title={APP_STRINGS.sell.monthTitle} aside={screen.monthLabel} />
        <Card>
          <div className="app__tiles">
            <div className="app__tile2">
              <b>{screen.month.ticketsSold}</b>
              <span>{APP_STRINGS.sell.monthTickets}</span>
            </div>
            <div className="app__tile2 app__tile2--money">
              <b>{formatEur(screen.month.owedCents)}</b>
              <span>{APP_STRINGS.sell.monthOwed}</span>
            </div>
            <div className="app__tile2 app__tile2--money">
              <b>{formatEur(screen.month.commissionCents)}</b>
              <span>{APP_STRINGS.sell.monthCommission}</span>
            </div>
          </div>
          <p className="app__partner-note">{APP_STRINGS.sell.monthNote}</p>
        </Card>
      </section>
    </AppShell>
  )
}
