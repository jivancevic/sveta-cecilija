// Pure season-trajectory series for the secretary dashboard bar chart (#242).
//
// One bar per show across the whole season, chronological. The bar's height is
// tickets sold; a faint capacity ceiling sits behind it. Bars are scaled to a
// shared y-axis (`maxCapacity`) so the busiest venue's ceiling is the tallest —
// a ljetno-kino (350) show reads taller than a zimsko-kino (250) one, keeping
// the comparison honest. The render math (px heights) lives in the component;
// this module owns the testable series + the scale.
//
// Each bar is STACKED by where its seats came from — online, at the door,
// partner, comp — rather than drawn as one flat total, so a night that filled
// on partner sales reads differently from one that filled at the box office.
// Only the ticket channels are counted directly (they come from the per-show
// channel map); the at-the-door segment is the remainder of `sold`, because
// offline seats have no ticket rows at all (ADR-0025). Deriving it that way is
// what guarantees the segments sum to exactly the `sold` figure on the card.

import type { DashboardShow } from './partition'
import { fillPercent } from './capacity'
import type { ShowChannelCounts } from '../tickets/sold-seats'
import type { Venue } from '../venues'

/** A seat's origin. `comp` is a seat, never a sale — keep it out of money. */
export type TrajectoryChannel = 'online' | 'inPerson' | 'partner' | 'comp'

/** Display order: bottom-to-top in the stack, left-to-right in the legend. */
export const TRAJECTORY_CHANNELS: readonly TrajectoryChannel[] = [
  'online',
  'inPerson',
  'partner',
  'comp',
] as const

export interface TrajectorySegment {
  key: TrajectoryChannel
  count: number
}

export interface TrajectoryBar {
  id: string
  date: string // YYYY-MM-DD
  time: string
  venue: Venue
  sold: number
  capacity: number
  remaining: number
  /** Sold as a whole-number % of this show's capacity, clamped to 0..100. */
  percent: number
  /** Always all four channels, in TRAJECTORY_CHANNELS order; sums to `sold`. */
  segments: TrajectorySegment[]
  cancelled: boolean
}

export interface SeasonTrajectory {
  /** One bar per show, sorted soonest-first across the whole season. */
  bars: TrajectoryBar[]
  /** Tallest venue capacity in the season — the shared y-axis ceiling. */
  maxCapacity: number
}

export function seasonTrajectory(
  shows: DashboardShow[],
  channelsByShow: Map<string, ShowChannelCounts>,
): SeasonTrajectory {
  const bars: TrajectoryBar[] = shows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const ticketed = channelsByShow.get(s.id) ?? { online: 0, partner: 0, comp: 0 }
      // At the door = whatever `sold` has left once the ticketed channels are
      // accounted for. Clamped at 0 so a stale counter can never draw a
      // negative block; the bar then reads slightly under `sold`, which is the
      // honest failure mode — an inverted segment is not.
      const inPerson = Math.max(0, s.sold - ticketed.online - ticketed.partner - ticketed.comp)
      return {
        id: s.id,
        date: s.date,
        time: s.time,
        venue: s.venue,
        sold: s.sold,
        capacity: s.capacity,
        remaining: s.remaining,
        percent: fillPercent(s.sold, s.capacity),
        segments: [
          { key: 'online' as const, count: ticketed.online },
          { key: 'inPerson' as const, count: inPerson },
          { key: 'partner' as const, count: ticketed.partner },
          { key: 'comp' as const, count: ticketed.comp },
        ],
        cancelled: s.status === 'cancelled',
      }
    })

  const maxCapacity = bars.reduce((max, b) => Math.max(max, b.capacity), 0)

  return { bars, maxCapacity }
}
