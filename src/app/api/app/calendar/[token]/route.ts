import { NextResponse } from 'next/server'
import { getCalendarPerformances } from '@/lib/calendar/calendar-data'
import { decideCalendarFeed } from '@/lib/calendar/feed'
import { buildIcs } from '@/lib/calendar/ics'

// GET /api/app/calendar/<token>.ics — the shared roster calendar (#433).
//
// The segment carries the `.ics` suffix (some calendar clients decide what a
// subscription is from the extension); Next matches whole segments only, so the
// suffix is stripped in `tokenFromSegment`, inside the pure gate.
//
// No `requirePermission` and no cookie: the token IS the authentication, which
// makes this one of the sanctioned token-authed exceptions (CLAUDE.md hard
// rule), alongside the cron routes and `/scan/[token]/claim`. A calendar client
// has no session and never will.
//
//   - No `CALENDAR_FEED_TOKEN` at all → 500 with a log. A deployment that
//     forgot the variable must be loud: answering 404 would look exactly like a
//     wrong link and nobody would go looking at the environment.
//   - Wrong token → 404. To anyone without it, this URL does not exist.
//   - `Cache-Control: private, max-age=3600`: a calendar client refreshes on
//     its own schedule and the feed changes a few times a season. `private`
//     keeps it out of any shared cache, because the URL contains the secret.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const decision = decideCalendarFeed(token, process.env.CALENDAR_FEED_TOKEN)

  if (decision === 'not-configured') {
    console.error('[calendar] CALENDAR_FEED_TOKEN is not set, the feed cannot be served')
    return NextResponse.json({ error: 'Calendar feed is not configured' }, { status: 500 })
  }

  if (decision === 'unknown-token') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const performances = await getCalendarPerformances()

  return new NextResponse(buildIcs(performances), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
      // A name for the file a browser downloads rather than subscribes to.
      'Content-Disposition': 'inline; filename="moreska.ics"',
    },
  })
}
