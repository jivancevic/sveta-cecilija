// What Obračun loads on the server (#505).
//
// The season half of the old Backoffice "Statistika" panel, scoped to the
// caller's own Partner id: every performance of the season as a bar, each
// carrying this partner's own sold counts (zero where they sold none), so the
// reseller sees the whole schedule rather than only the evenings they worked.
//
// The month half is NOT loaded here. The statement of one month is fetched by
// the picker from `/api/partner/reconciliation`, which is the same route the
// CSV comes from, so what the screen shows and what the download contains are
// one query rather than two that can disagree.

import {
  getPartnerSeasonStats,
  getStatistikaShows,
} from '@/lib/partner/partner-data'
import { monthKeyInZagreb } from '@/lib/partner/partner-reconciliation'
import { buildStatistikaBars, type StatBar } from '@/lib/partner/partner-stats'
import { getRepo } from '@/lib/repo'
import { partnerScreenState, type PartnerScreenState } from './partner-screen'
import type { MonthKey } from './statement-view'

export interface StatementScreen {
  state: PartnerScreenState
  /** One bar per season performance, sold or not, chronological. */
  bars: StatBar[]
  /** Active tickets this partner sold across the season. */
  totalActive: number
  /** Today in Europe/Zagreb, so the month picker takes no clock of its own. */
  now: MonthKey
}

export async function loadStatementScreen(partnerId: string | null): Promise<StatementScreen> {
  const repo = getRepo()
  const partner = partnerId == null ? null : await repo.partners.byId(partnerId)
  const state = partnerScreenState(partner)
  const now = monthKeyInZagreb(new Date().toISOString())

  if (state.kind !== 'ok') return { state, bars: [], totalActive: 0, now }

  const [season, allShows] = await Promise.all([
    getPartnerSeasonStats(repo.db.query, Number(state.partner.id)),
    getStatistikaShows(repo.db.query),
  ])

  return {
    state,
    bars: buildStatistikaBars(allShows, season.perShow),
    totalActive: season.totalActive,
    now,
  }
}

export type { MonthKey, PartnerScreenState, StatBar }
