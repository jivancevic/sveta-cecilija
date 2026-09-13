// What Prodaja loads on the server (#505).
//
// Four reads, every one of them scoped to the caller's own Partner id, which
// comes off the access decision (`viewer.access.partnerId`) and never off the
// request: a partner sees its own sales and nothing else (ADR-0008).
//
//   - the Partners row, through the seam (`repo.partners`), because "is this
//     login live" is the first question both partner screens ask;
//   - the performances it may sell, through `getUpcomingShows()` — the
//     CLAUDE.md entry point, which applies the public-performance predicate and
//     derives `remaining` from the venue's capacity;
//   - the three newest orders, and
//   - this month's standing.
//
// The last two keep the SQL they already had (`recent-sales-page.ts`,
// `month-to-date.ts`); all that changes is where the pool comes from
// (`repo.db.query` instead of reaching into `payload.db`).
//
// When the login has no usable Partner, NOTHING is queried: the state is the
// whole answer and the screen prints a sentence.

import { getPartnerMonthToDate, type MonthToDate } from '@/lib/partner/month-to-date'
import { monthKeyInZagreb } from '@/lib/partner/partner-reconciliation'
import {
  getPartnerRecentSalesPage,
  type RecentSalePageRow,
} from '@/lib/partner/recent-sales-page'
import { getRepo } from '@/lib/repo'
import { getUpcomingShows } from '@/lib/shows'
import {
  partnerScreenState,
  sellOptions,
  type PartnerScreenState,
  type SellOption,
} from './partner-screen'
import { monthLabel } from './strings'

/** How many orders the screen server-renders; the pager asks for more. */
const RECENT_PAGE_SIZE = 3

export interface RecentSalesPage {
  sales: RecentSalePageRow[]
  hasMore: boolean
}

export interface SellScreen {
  state: PartnerScreenState
  /** The performances the partner may sell, soonest first. */
  shows: SellOption[]
  recent: RecentSalesPage
  month: MonthToDate
  /** "Rujan 2026" — which month the standing card is about. */
  monthLabel: string
}

const NO_MONTH: MonthToDate = {
  ticketsSold: 0,
  cancelledCount: 0,
  grossCents: 0,
  commissionCents: 0,
  owedCents: 0,
}

export async function loadSellScreen(partnerId: string | null): Promise<SellScreen> {
  const repo = getRepo()
  const partner = partnerId == null ? null : await repo.partners.byId(partnerId)
  const state = partnerScreenState(partner)

  // The Europe/Zagreb month is resolved here, so the data layer below takes no
  // clock and the card buckets the same way the month-end statement does.
  const { year, month } = monthKeyInZagreb(new Date().toISOString())
  const label = `${monthLabel(month)} ${year}`

  if (state.kind !== 'ok') {
    return { state, shows: [], recent: { sales: [], hasMore: false }, month: NO_MONTH, monthLabel: label }
  }

  const numericPartnerId = Number(state.partner.id)
  const [shows, recent, monthToDate] = await Promise.all([
    getUpcomingShows(),
    getPartnerRecentSalesPage(repo.db.query, numericPartnerId, {
      page: 1,
      pageSize: RECENT_PAGE_SIZE,
    }),
    getPartnerMonthToDate(repo.db.query, {
      partnerId: numericPartnerId,
      commissionPercent: state.partner.commissionPercent,
      year,
      month,
    }),
  ])

  return {
    state,
    shows: sellOptions(shows),
    recent,
    month: monthToDate,
    monthLabel: label,
  }
}

export type { MonthToDate, PartnerScreenState, RecentSalePageRow, SellOption }
