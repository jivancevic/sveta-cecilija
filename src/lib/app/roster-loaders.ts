// What `/app` reads (#421, ADR-0024 phase 3).
//
// The roster is the one surface that deliberately sees EVERY performance of the
// season — a ship call and a Redovna are both evenings a moreškant has to turn
// up for. So this module does not filter on the public predicate; it uses it
// (`isPublicPerformance`) to decide how a row RENDERS: a public row shows its
// venue label, a non-public one its free-text location and client.
//
// Payload's local API runs with `overrideAccess: true`, so collection access
// does not scope these reads — the caller scopes them by the `/app` access
// decision (`./access.ts`). Visibility inside the app is deliberately
// society-wide: a moreškant sees the same performances a voditelj sees.
//
// Emails never appear here. `RosterPerformance` has no email field and the
// loader never selects one; `roster-loaders.test.ts` asserts it on the rendered
// payload, because the PII boundary of ADR-0024 (mobiles yes, emails no) is a
// property of the data contract, not of a template.
//
// Pure + DI in the phase 2 loader style: `splitSeasonPerformances` is where the
// time and cancellation rules live and is unit-tested directly.

import { seasonYear } from '@/lib/member/season'
import { isPublicPerformance, type PerformanceKind } from '@/lib/show-performance'
import { showStartMs } from '@/lib/show-time'
import type { ShowsFind } from '@/lib/show-loaders'
import type { Venue } from '@/lib/venues'

/** One performance card. No email, ever. */
export interface RosterPerformance {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zagreb wall clock */
  time: string
  kind: PerformanceKind
  isPublic: boolean
  /** Public rows only; the app renders VENUE_LABEL from it. */
  venue: Venue | null
  /** Non-public rows: the free-text place ("Le Ponant, luka"). */
  location: string | null
  /** Non-public rows: the ship or organiser behind the booking. */
  client: string | null
  cancelled: boolean
  voditeljNote: string | null
  /** Epoch ms of the start instant, Europe/Zagreb. */
  startMs: number
}

export interface SeasonPerformances {
  year: number
  upcoming: RosterPerformance[]
  past: RosterPerformance[]
}

/**
 * How far a cancelled performance stays visible, struck through, either side of
 * today. Outside that window it disappears: a cancellation nobody has to notice
 * any more is noise on a phone screen (#419, story 30).
 */
export const CANCELLED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** One raw Payload doc → one card. */
export function toRosterPerformance(row: Record<string, unknown>): RosterPerformance {
  const date = String(row.date ?? '').slice(0, 10)
  const time = typeof row.time === 'string' ? row.time : ''
  const isPublic = isPublicPerformance(row)
  return {
    id: String(row.id),
    date,
    time,
    kind: (row.kind as PerformanceKind) ?? 'redovna',
    isPublic,
    venue: isPublic ? ((row.venue as Venue) ?? null) : null,
    location: isPublic ? null : text(row.location),
    client: isPublic ? null : text(row.client),
    cancelled: row.status === 'cancelled',
    voditeljNote: text(row.voditeljNote),
    startMs: date && time ? showStartMs(date, time) : Number.NaN,
  }
}

/**
 * Split the season into "Nadolazeće" and "Prošle".
 *
 * The boundary is the performance's own start instant in Europe/Zagreb (date +
 * `HH:MM`), not its calendar day: tonight's 21:00 show is upcoming all
 * afternoon. There is no grace window here — unlike the buyer path
 * (`SHOW_GRACE_MS`), a dancer's evening is "past" the moment it begins.
 *
 * A cancelled performance survives only within {@link CANCELLED_WINDOW_MS} of
 * now, and stays in whichever half its start time puts it, struck through.
 * Upcoming runs soonest first; past runs most recent first, which is the order
 * anyone looking back wants.
 */
export function splitSeasonPerformances(
  rows: RosterPerformance[],
  nowMs: number,
): { upcoming: RosterPerformance[]; past: RosterPerformance[] } {
  const visible = rows.filter(
    (p) => !p.cancelled || Math.abs(p.startMs - nowMs) <= CANCELLED_WINDOW_MS,
  )
  const upcoming = visible
    .filter((p) => p.startMs >= nowMs)
    .sort((a, b) => a.startMs - b.startMs)
  const past = visible
    .filter((p) => p.startMs < nowMs)
    .sort((a, b) => b.startMs - a.startMs)
  return { upcoming, past }
}

export interface SeasonPerformancesDeps {
  find: ShowsFind
  now?: () => Date
}

/**
 * Every performance of the current season (calendar year, ADR-0022's
 * definition), split into upcoming and past.
 */
export async function loadSeasonPerformances(
  deps: SeasonPerformancesDeps,
): Promise<SeasonPerformances> {
  const now = deps.now?.() ?? new Date()
  const year = seasonYear(now)

  const result = await deps.find({
    collection: 'shows',
    where: {
      and: [
        { date: { greater_than_equal: `${year}-01-01T00:00:00.000Z` } },
        { date: { less_than: `${year + 1}-01-01T00:00:00.000Z` } },
      ],
    },
    sort: 'date',
    limit: 1000,
    depth: 0,
  })

  const rows = result.docs.map(toRosterPerformance)
  return { year, ...splitSeasonPerformances(rows, now.getTime()) }
}
