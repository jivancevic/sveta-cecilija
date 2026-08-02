// Pure season rollup for the member dashboard (#362, ADR-0022).
//
// This is the first place in the codebase where "season" has a definition.
// Every other helper — including dashboard/capacity.ts's seasonCapacity(), which
// means "every show in the table" — counts un-windowed, which is accidentally
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
// This takes StatsShow (the raw season input) rather than the secretary
// dashboard's DashboardShow on purpose: DashboardShow.sold deliberately EXCLUDES
// legacyReserved ("a reservation, not a sale"), but a legacy reservation still
// occupies a seat — remainingSeats subtracts it — so a seats-issued / capacity-
// fill view has to count it. Reading the raw counters also makes the box-office
// figure an explicit sum instead of a subtraction.
//
// Pure + DI so the rollup is unit-tested without a DB; season-data.ts wires the
// SQL seam.

import { fillPercent } from '../dashboard/capacity'
import type { StatsShow } from '../stats'
import { VENUE_CAPACITY, type Venue } from '../venues'

/**
 * Per-show active-ticket breakdown, straight off the tickets⋈orders join.
 * Box-office seats are NOT here — they have no ticket rows (they live on
 * `shows.inPersonSold` / `shows.legacyReserved`) and are added below.
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
   * into adult/child: `inPersonSold` and `legacyReserved` are bare counters with
   * no ticket type, so the split genuinely is not known for those seats.
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
  shows: StatsShow[]
  ticketRows: SeasonTicketRow[]
}): MemberSeason {
  const year = seasonYear(today)
  const prefix = `${year}-`

  // StatsShow.date is normally already YYYY-MM-DD, but the type allows a full
  // ISO timestamp; slice so both compare and render the same way.
  const inSeason = shows
    .map((s) => ({ ...s, date: s.date.slice(0, 10) }))
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
    // Both counters take a real seat (remainingSeats subtracts each), and
    // neither carries a ticket type — that is exactly the box office.
    const boxOffice = s.inPersonSold + s.legacyReserved
    const showIssued = s.activeTicketCount + boxOffice
    const showCapacity = VENUE_CAPACITY[s.venue]

    issued += showIssued
    capacity += showCapacity
    types.boxOffice += boxOffice
    channels.boxOffice += boxOffice

    const r = rowsByShow.get(s.id)
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
      issued: showIssued,
      capacity: showCapacity,
      percent: fillPercent(showIssued, showCapacity),
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
