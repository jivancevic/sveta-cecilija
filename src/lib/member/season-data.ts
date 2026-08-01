// SQL seam for the member season dashboard (#362, ADR-0022).
//
// One grouped read off the same tickets⋈orders active-only join every other seat
// figure uses (see tickets/sold-seats.ts), returning the adult/child split and
// the channel split per show in a single pass. Season scoping deliberately does
// NOT happen here: `shows.date` is a timestamptz, so an in-SQL EXTRACT(YEAR …)
// would be evaluated in the session timezone, while the dashboard already has
// each show's date normalized to a YYYY-MM-DD string. Filtering lives in the
// pure buildMemberSeason() rollup instead, where it is unit-tested.

import type { PoolQuery } from '../tickets/sold-seats'
import type { SeasonTicketRow } from './season'

/**
 * Active-ticket counts per show: adult/child by ticket type, online/partner/comp
 * by order channel. Box-office sales have no ticket rows (they are the
 * `shows.inPersonSold` counter) and are therefore absent — the rollup derives
 * them. Cancelled and refunded tickets are excluded via `status = 'active'`, so
 * the figures self-heal exactly like the seat model.
 *
 * `online` is the complement of partner+comp rather than an equality test, so a
 * legacy NULL/unknown channel folds into online instead of disappearing — the
 * same rule getActiveTicketCountsByChannel applies.
 */
export async function getSeasonTicketRowsByShow(query: PoolQuery): Promise<SeasonTicketRow[]> {
  const res = await query(`
    SELECT
      o.show_id AS show_id,
      COUNT(*) FILTER (WHERE t.type = 'adult')::int AS adult,
      COUNT(*) FILTER (WHERE t.type = 'child')::int AS child,
      COUNT(*) FILTER (
        WHERE o.channel IS DISTINCT FROM 'partner' AND o.channel IS DISTINCT FROM 'comp'
      )::int AS online,
      COUNT(*) FILTER (WHERE o.channel = 'partner')::int AS partner,
      COUNT(*) FILTER (WHERE o.channel = 'comp')::int AS comp
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE t.status = 'active'
    GROUP BY o.show_id
  `)

  return res.rows.map((row) => ({
    showId: String(row.show_id),
    adult: Number(row.adult) || 0,
    child: Number(row.child) || 0,
    online: Number(row.online) || 0,
    partner: Number(row.partner) || 0,
    comp: Number(row.comp) || 0,
  }))
}
