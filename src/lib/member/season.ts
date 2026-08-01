// Pure season rollup for the member dashboard (#362, ADR-0022).
//
// This is the first place in the codebase where "season" has a definition.
// Every other helper counts the whole `shows` table, which is accidentally
// correct only while the database holds a single season and silently becomes a
// two-season sum in January 2027. Season here = **performances whose date falls
// in the current calendar year** (ADR-0022): the society plays May-September, so
// no season straddles New Year and nobody has to set a field on every show.
//
// Everything the member view reports is computed over one set: in-season,
// non-cancelled performances. A cancelled performance has no seats to sell, so
// it drops out of the list, the capacity and every count together — which keeps
// the invariant `issued == sum(per-show issued)` true on the rendered page.
//
// Pure + DI so the rollup is unit-tested without a DB; season-data.ts wires the
// SQL seam.

import { fillPercent } from '../dashboard/capacity'
import type { DashboardShow } from '../dashboard/partition'
import type { Venue } from '../venues'

/**
 * Per-show active-ticket breakdown, straight off the tickets⋈orders join.
 * Box-office sales are NOT here — they have no ticket rows (they live on
 * `shows.inPersonSold`) and are derived below.
 */
export interface SeasonTicketRow {
  showId: string
  adult: number
  child: number
  online: number
  partner: number
  comp: number
}

export interface MemberSeasonShow {
  showId: string
  date: string // YYYY-MM-DD
  time: string
  venue: Venue
  /** Seats issued: active tickets + box office. Comps included. */
  issued: number
  capacity: number
  /** issued as a whole-number % of capacity, clamped to 0..100. */
  percent: number
}

export interface MemberSeason {
  year: number
  /** Headline: seats issued this season. Comps included, hence "issued". */
  issued: number
  capacity: number
  fillPercent: number
  shows: MemberSeasonShow[]
  /**
   * Ticket-type split. `boxOffice` is its own bucket rather than being folded
   * into adult/child: `shows.inPersonSold` is a bare counter with no ticket
   * type, so the split genuinely is not known for those seats.
   */
  types: { adult: number; child: number; boxOffice: number }
  channels: { online: number; partner: number; comp: number; boxOffice: number }
}

/**
 * The current season's calendar year, resolved in Europe/Zagreb. Using Zagreb
 * rather than the server's UTC clock matters only for the few hours either side
 * of New Year, but that is exactly when the season rolls over.
 */
export function seasonYear(today: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb', year: 'numeric' }).format(today),
  )
}

export function buildMemberSeason({
  today,
  shows,
  ticketRows,
}: {
  today: Date
  shows: DashboardShow[]
  ticketRows: SeasonTicketRow[]
}): MemberSeason {
  const year = seasonYear(today)
  const prefix = `${year}-`

  const inSeason = shows
    .filter((s) => s.status !== 'cancelled' && s.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  const seasonIds = new Set(inSeason.map((s) => s.id))

  // Ticket rows keyed by show, restricted to the season set so a stray row
  // (another year, a deleted show) can never leak into the mix.
  const rowsByShow = new Map<string, SeasonTicketRow>()
  for (const r of ticketRows) {
    if (seasonIds.has(r.showId)) rowsByShow.set(r.showId, r)
  }

  const types = { adult: 0, child: 0, boxOffice: 0 }
  const channels = { online: 0, partner: 0, comp: 0, boxOffice: 0 }
  let issued = 0
  let capacity = 0

  const seasonShows: MemberSeasonShow[] = inSeason.map((s) => {
    const r = rowsByShow.get(s.id)
    const ticketTotal = r ? r.online + r.partner + r.comp : 0

    // DashboardShow.sold is active tickets + shows.inPersonSold, so whatever the
    // ticket rows don't account for is the box office. Clamped at 0: a data
    // anomaly must never subtract from the totals.
    const boxOffice = Math.max(0, s.sold - ticketTotal)

    issued += s.sold
    capacity += s.capacity
    types.boxOffice += boxOffice
    channels.boxOffice += boxOffice
    if (r) {
      types.adult += r.adult
      types.child += r.child
      channels.online += r.online
      channels.partner += r.partner
      channels.comp += r.comp
    }

    return {
      showId: s.id,
      date: s.date,
      time: s.time,
      venue: s.venue,
      issued: s.sold,
      capacity: s.capacity,
      percent: fillPercent(s.sold, s.capacity),
    }
  })

  return {
    year,
    issued,
    capacity,
    fillPercent: fillPercent(issued, capacity),
    shows: seasonShows,
    types,
    channels,
  }
}
