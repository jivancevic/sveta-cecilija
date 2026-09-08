import { getPayload } from 'payload'
import config from '@payload-config'
import { seasonYear } from '@/lib/member/season'
import { toCalendarPerformance } from './feed'
import type { CalendarPerformance } from './ics'

// The one Payload read behind the calendar feed (#433) — the `roster-data.ts`
// shape: this file holds the query and nothing else.
//
// "The current and future seasons" (#430, story 44), which by ADR-0022's
// definition is every performance dated from 1 January of the current calendar
// year onwards. Last season is deliberately left out: a phone calendar is a
// thing you look forward in, and a subscription that carried every year ever
// would grow without bound.
//
// Public and non-public alike, exactly as the roster does (ADR-0024): a ship
// call is an evening a dancer has to turn up for. The local API runs
// `overrideAccess: true`, and the caller has already presented the feed token.

export async function getCalendarPerformances(
  now: Date = new Date(),
): Promise<CalendarPerformance[]> {
  const payload = await getPayload({ config })
  const year = seasonYear(now)

  const result = await payload.find({
    collection: 'shows',
    where: { date: { greater_than_equal: `${year}-01-01T00:00:00.000Z` } },
    sort: 'date',
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })

  return (result.docs as unknown as Record<string, unknown>[]).map(toCalendarPerformance)
}
