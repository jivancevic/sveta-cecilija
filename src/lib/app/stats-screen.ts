// Statistika (#508): one season of public performances, in counts.
//
// The screen is a port of two Backoffice surfaces into Cecilija — the
// secretary dashboard's season band and its two charts, and the shared
// `member` login's season table (ADR-0022) — with a season picker over both.
// Nothing here is new arithmetic:
//
//   - capacity is `VENUE_CAPACITY[venue]`, because there is no capacity column
//     and never will be (CLAUDE.md);
//   - the fill percentages are `fillPercent`, the season rollup is
//     `seasonCapacity`, the bars are `seasonTrajectory` and the split bar is
//     `channelMix` — all four moved as-is from `lib/dashboard/`, so the figure
//     a secretary already knows does not change when the screen does;
//   - the seat counts themselves are the ones Izvedbe prints (#502): active
//     tickets by channel, and offline seats read off the LEDGER rather than
//     off the cached counters, so a row here and the same row one tap away can
//     never disagree.
//
// **THERE IS NO MONEY ON THIS SCREEN, for anybody.** Counts answer to
// `tickets`, `season_stats` and `finance`; euros are Financije (#509, decided
// in #500). So no field of any type below carries cents, and the loader never
// asks for a total: a figure that is not in the payload cannot be leaked by a
// template.
//
// Two rules about which evenings count, both inherited rather than invented:
//
//   - Only PUBLIC performances (ADR-0024). A ship call has no venue and no
//     capacity, so it would render as a permanently sold-out zero-capacity row
//     and drag every average down. The predicate is applied in the loader.
//   - A CANCELLED evening is listed and flagged, but contributes nothing to
//     the season band or the mix: it has no seats to sell. That is exactly
//     what `seasonCapacity` has always done on the Backoffice dashboard, and
//     the trajectory chart keeps drawing the evening as one flat grey block.
//
// Pure: no IO, no clock, no Payload. `stats-screen-data.ts` is the wiring.

import { fillPercent, seasonCapacity } from '@/lib/dashboard/capacity'
import { channelMix, type ChannelMix } from '@/lib/dashboard/channel-mix'
import type { DashboardShow } from '@/lib/dashboard/partition'
import { seasonTrajectory, type SeasonTrajectory } from '@/lib/dashboard/trajectory'
import type { CompMemberTally } from './comp-screen'
import type { SeasonOfflineTypes, SeasonTicketRow } from '@/lib/member/season'
import type { ShowChannelCounts } from '@/lib/tickets/sold-seats'
import { remainingSeats } from '@/lib/tickets/seat-availability'
import { VENUE_CAPACITY, VENUE_LABEL, type Venue } from '@/lib/venues'
import { shortShowDay } from './partner-screen'
import { APP_STRINGS } from './strings'

const S = APP_STRINGS.statistics

/** The facts that live on the performance row itself. */
export interface SeasonShowFacts {
  id: string
  /** YYYY-MM-DD, the day, never an ISO instant. */
  date: string
  /** HH:MM, Europe/Zagreb wall clock. */
  time: string
  venue: Venue
  cancelled: boolean
}

/**
 * Where a seat came from, as this screen names the four.
 *
 * `door` is every offline seat: what was sold at the entrance AND what the old
 * WordPress site had already sold when it closed (ADR-0025). Neither has a
 * ticket row and neither has a buyer who can be written to, so they are one
 * bucket here and the footnote under the table says so. Izvedbe keeps them
 * apart because a cashier correcting a miscount needs to know which ledger a
 * line is in; a season reader does not.
 */
export interface StatsChannelCounts {
  online: number
  door: number
  partner: number
  comp: number
}

export interface StatsRow {
  id: string
  date: string
  time: string
  venue: Venue
  /** "12. srp". */
  dateLabel: string
  /** "Ljetno kino". */
  venueLabel: string
  sold: number
  capacity: number
  /** "160/350". */
  soldOf: string
  /** Sold as a whole-number % of capacity, clamped to 0..100. */
  percent: number
  /** Seats still sellable. May be negative: an oversold room is a real state. */
  remaining: number
  adult: number
  child: number
  channels: StatsChannelCounts
  /** People through the door: scanned ACTIVE tickets, one per person. */
  scanned: number
  cancelled: boolean
  /** `/app/performances/<id>`, or null when the viewer cannot open Izvedbe. */
  href: string | null
}

/** The four figures above the fold. Counts, every one of them. */
export interface StatsBand {
  sold: number
  comps: number
  capacity: number
  percent: number
}

export interface StatsScreenInput {
  season: number
  /** Newest first, for the picker. */
  seasons: number[]
  /** Every PUBLIC performance of the season; order does not matter. */
  shows: SeasonShowFacts[]
  /** Active tickets per show: the adult/child split and the three channels. */
  tickets: Map<string, SeasonTicketRow>
  /** Ledger seats per show, door and legacy summed, with their types. */
  offline: Map<string, SeasonOfflineTypes>
  scanned: Map<string, number>
  /**
   * "Gratis po članu", already tallied by Gratis's own `tallyCompsByMember`
   * (#506). Statistika prints that table rather than counting comps a second
   * way: two tallies of the same seats is how two screens come to disagree
   * about how many a member received.
   */
  comps: CompMemberTally[]
  /** The viewer unlocks Izvedbe, so a row may be a link into it. */
  canOpenPerformances: boolean
  /** The viewer holds `tickets`, so the per-member comp table is theirs. */
  canSeeComps: boolean
}

export interface StatsScreen {
  season: number
  seasons: number[]
  band: StatsBand
  /** Chronological, cancelled evenings included and flagged. */
  rows: StatsRow[]
  trajectory: SeasonTrajectory
  mix: ChannelMix
  /** Null, never an empty list, when the viewer may not read it. */
  comps: CompMemberTally[] | null
}

const NO_TICKETS: Omit<SeasonTicketRow, 'showId'> = {
  adult: 0,
  child: 0,
  online: 0,
  partner: 0,
  comp: 0,
}
const NO_OFFLINE: SeasonOfflineTypes = { adult: 0, child: 0, seats: 0 }

function toRow(show: SeasonShowFacts, input: StatsScreenInput): StatsRow {
  const t = input.tickets.get(show.id) ?? NO_TICKETS
  const o = input.offline.get(show.id) ?? NO_OFFLINE
  const capacity = VENUE_CAPACITY[show.venue]
  const ticketed = t.online + t.partner + t.comp
  const sold = ticketed + o.seats

  return {
    id: show.id,
    date: show.date,
    time: show.time,
    venue: show.venue,
    dateLabel: shortShowDay(show.date),
    venueLabel: VENUE_LABEL.hr[show.venue] ?? show.venue,
    sold,
    capacity,
    soldOf: S.soldOf(sold, capacity),
    percent: fillPercent(sold, capacity),
    // The same subtraction the sell lock refuses a sale with, and left
    // unclamped for the same reason: an oversold room is a miscounted door
    // batch somebody has to notice.
    remaining: remainingSeats({
      capacity,
      activeTicketCount: ticketed,
      inPersonSold: o.seats,
      legacyReserved: 0,
    }),
    adult: t.adult + o.adult,
    child: t.child + o.child,
    channels: { online: t.online, door: o.seats, partner: t.partner, comp: t.comp },
    scanned: input.scanned.get(show.id) ?? 0,
    cancelled: show.cancelled,
    href: input.canOpenPerformances ? `/app/performances/${show.id}` : null,
  }
}

/** The whole screen, from the season's rows and who is reading them. */
export function buildStatsScreen(input: StatsScreenInput): StatsScreen {
  const rows = input.shows
    .map((show) => toRow(show, input))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  // The shape both charts and the season rollup already speak. Building it once
  // here is what keeps the band, the bars and the rows arithmetically the same
  // numbers rather than three readings of them.
  const dashboardShows: DashboardShow[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    time: r.time,
    venue: r.venue,
    sold: r.sold,
    capacity: r.capacity,
    remaining: r.remaining,
    status: r.cancelled ? 'cancelled' : 'active',
  }))
  const channelsByShow = new Map<string, ShowChannelCounts>(
    rows.map((r) => [r.id, { online: r.channels.online, partner: r.channels.partner, comp: r.channels.comp }]),
  )

  const capacityBand = seasonCapacity(dashboardShows)
  const counted = rows.filter((r) => !r.cancelled)
  const sum = (pick: (r: StatsRow) => number) => counted.reduce((n, r) => n + pick(r), 0)

  return {
    season: input.season,
    seasons: input.seasons,
    band: {
      sold: capacityBand.totalSold,
      comps: sum((r) => r.channels.comp),
      capacity: capacityBand.totalCapacity,
      percent: capacityBand.percent,
    },
    rows,
    trajectory: seasonTrajectory(dashboardShows, channelsByShow),
    // The mix reads the same evenings the band does: a cancelled night's seats
    // were refunded, so counting them in "where did this season's seats come
    // from" would answer a question nobody asked. Gratis is deliberately not a
    // segment — a comp is a seat and never a sale (ADR-0019) — which is why
    // the band carries it as its own figure instead.
    mix: channelMix({
      online: sum((r) => r.channels.online),
      inPerson: sum((r) => r.channels.door),
      partner: sum((r) => r.channels.partner),
    }),
    comps: input.canSeeComps ? input.comps : null,
  }
}
