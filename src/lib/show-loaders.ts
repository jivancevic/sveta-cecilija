// Dependency-injected show loaders.
//
// The IO-free half of `src/lib/shows.ts`: everything that decides WHICH rows a
// buyer surface sees and how a row is shaped, with the Payload/pool calls passed
// in. `shows.ts` wires the real `payload.find` + pool queries; tests inject a
// fake `find` and assert on the rows that come back.
//
// The public-performance predicate (ADR-0024) is applied here, once, so
// `/tickets`, the homepage schedule, the sitemap, the JSON-LD and the door's
// "tonight's show" all inherit it.
import { VENUE_CAPACITY, type Venue } from './venues'
import { remainingSeats } from './tickets/seat-availability'
import { isPastShowCutoff } from './show-time'
import { PUBLIC_PERFORMANCE_WHERE } from './show-performance'

export interface Show {
  id: string;
  date: string;      // YYYY-MM-DD
  time: string;
  venue: Venue;
  remaining: number; // venue capacity - onlineSold - inPersonSold - legacyReserved
  /** Admin has paused online sales — show stays listed, buy CTA replaced by a note. */
  onlineSalesPaused: boolean;
}

export interface NextShow {
  id: string
  date: string // YYYY-MM-DD
  time: string
  venue: Venue
  onlineSold: number
  inPersonSold: number
}

/** The subset of `payload.find` args these loaders use. */
export interface ShowsFindArgs {
  collection?: string
  where?: unknown
  sort?: string
  limit?: number
  depth?: number
}

export type ShowsFind = (args: ShowsFindArgs) => Promise<{ docs: Record<string, unknown>[] }>

export interface UpcomingShowsDeps {
  find: ShowsFind
  /** Active ticket count per show id (the retired `online_sold` column is never read). */
  soldByShow: () => Promise<Map<string, number>>
  now?: () => Date
}

export interface NextShowDeps {
  find: ShowsFind
  activeTicketCountForShow: (showId: number | string) => Promise<number>
  now?: () => Date
}

/**
 * Where clause shared by both loaders: an active, public performance whose
 * calendar day has not passed. `date` is a Payload `dayOnly` value, so the DB
 * filter is day-granular; `loadUpcomingShows` narrows to the exact cutoff in JS.
 */
function upcomingPublicWhere(now: Date) {
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  return {
    and: [
      PUBLIC_PERFORMANCE_WHERE,
      { status: { equals: 'active' } },
      { date: { greater_than_equal: todayStart.toISOString() } },
    ],
  }
}

/**
 * Next active PUBLIC show with date >= today, ordered by date ASC.
 * Returns null if no future public performance exists. Tehnika dashboard surface.
 */
export async function loadNextShow(deps: NextShowDeps): Promise<NextShow | null> {
  const result = await deps.find({
    collection: 'shows',
    where: upcomingPublicWhere(deps.now ? deps.now() : new Date()),
    sort: 'date',
    limit: 1,
    depth: 0,
  })

  const doc = result.docs[0]
  if (!doc) return null

  // `onlineSold` is now the active ticket count, not the retired column.
  const onlineSold = await deps.activeTicketCountForShow(doc.id as number)

  return {
    id: String(doc.id),
    date: new Date(doc.date as string).toISOString().slice(0, 10),
    time: (doc.time as string) ?? '',
    venue: (doc.venue as Venue) ?? 'ljetno-kino',
    onlineSold,
    inPersonSold: Number(doc.inPersonSold ?? 0),
  }
}

export async function loadUpcomingShows(
  deps: UpcomingShowsDeps,
  limit?: number,
): Promise<Show[]> {
  // Fetch the full window first and apply the caller's `limit` only AFTER
  // filtering, so a show that has just passed its cutoff can't push a
  // still-upcoming show out of a small limit.
  const result = await deps.find({
    collection: 'shows',
    where: upcomingPublicWhere(deps.now ? deps.now() : new Date()),
    sort: 'date',
    limit: 200,
    depth: 0,
  })

  // Sold seats come from active ticket rows, not the retired online_sold column.
  const soldByShow = await deps.soldByShow()

  const shows = result.docs
    .map((show) => {
      // Only public performances reach here, so `venue` is always set (the save
      // validation guarantees it). VENUE_CAPACITY is never consulted for a NULL
      // venue.
      const venue = (show.venue as Venue) ?? 'ljetno-kino'
      const capacity = VENUE_CAPACITY[venue]
      const sold = soldByShow.get(String(show.id)) ?? 0
      return {
        id: String(show.id),
        date: new Date(show.date as string).toISOString().slice(0, 10),
        time: show.time as string,
        venue,
        remaining: remainingSeats({
          capacity,
          activeTicketCount: sold,
          inPersonSold: (show.inPersonSold as number) ?? 0,
          legacyReserved: (show.legacyReserved as number) ?? 0,
        }),
        onlineSalesPaused: Boolean(show.onlineSalesPaused),
      }
    })
    // Drop shows that started more than the grace window ago (Europe/Zagreb).
    .filter((s) => !isPastShowCutoff(s.date, s.time))

  return limit != null ? shows.slice(0, limit) : shows
}
