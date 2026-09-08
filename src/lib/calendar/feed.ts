// Who may read the calendar feed, and what a performance looks like in it
// (#433).
//
// The feed is protected by ONE shared secret in the environment
// (`CALENDAR_FEED_TOKEN`) rather than by a per-user token, which is the
// amendment this ticket makes to ADR-0024: the roster is not personal data (a
// season's dates and places, the same list that hangs on the noticeboard), the
// whole point is that a voditelj can paste one link in the WhatsApp group
// (#430, story 43), and a per-user feed would mean a token table, a revocation
// story and twenty subscriptions to break when a dancer leaves.
//
// The token still exists so the feed is not crawlable and cannot be found by
// guessing a URL. It is compared in CONSTANT TIME (`secretMatches`), because a
// calendar client fetches this URL every hour from a stable address — the exact
// traffic pattern a byte-at-a-time compare leaks a secret to.
//
// A mismatch answers 404, not 403: to anyone without the token this URL simply
// does not exist, and a 403 would confirm that a feed is there to be guessed at.

import { toRosterPerformance } from '@/lib/app/roster-loaders'
import { secretMatches } from '@/lib/timing-safe'
import type { CalendarPerformance } from './ics'

/** The path the `/app` panel shows and a calendar client subscribes to. */
export function calendarFeedPath(token: string): string {
  return `/api/app/calendar/${encodeURIComponent(token)}.ics`
}

/** The absolute URL, or null when the deployment has no base URL or no token. */
export function calendarFeedUrl(
  baseUrl: string | null | undefined,
  token: string | null | undefined,
): string | null {
  if (!baseUrl || !token) return null
  return `${baseUrl.replace(/\/+$/, '')}${calendarFeedPath(token)}`
}

/**
 * `abc123.ics` → `abc123`.
 *
 * The `.ics` suffix is part of the URL because some calendar clients decide how
 * to treat a subscription from the extension before they ever look at the
 * content type. Next's App Router only matches WHOLE segments, so the route
 * takes the segment and strips the suffix here rather than pretending a
 * `[token].ics` directory would work.
 */
export function tokenFromSegment(segment: string): string {
  return segment.endsWith('.ics') ? segment.slice(0, -4) : segment
}

export type FeedDecision = 'serve' | 'not-configured' | 'unknown-token'

/** The whole gate: no env is a 500 (with a log), a bad token is a 404. */
export function decideCalendarFeed(
  segment: string,
  expected: string | null | undefined,
): FeedDecision {
  if (!expected || expected.trim() === '') return 'not-configured'
  return secretMatches(tokenFromSegment(segment), expected.trim())
    ? 'serve'
    : 'unknown-token'
}

/**
 * A Payload Shows doc → one calendar event.
 *
 * `toRosterPerformance` again (the projection `/app` and the change
 * notification share), plus `updatedAt`, which only the feed cares about.
 */
export function toCalendarPerformance(doc: Record<string, unknown>): CalendarPerformance {
  const p = toRosterPerformance(doc)
  return {
    id: p.id,
    date: p.date,
    time: p.time,
    kind: p.kind,
    isPublic: p.isPublic,
    venue: p.venue,
    location: p.location,
    cancelled: p.cancelled,
    voditeljNote: p.voditeljNote,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
  }
}
