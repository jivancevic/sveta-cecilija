import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPushDeps, loadDuePerformances, type PushPayload } from '@/lib/push/push-data'
import { runRosterNotifications } from '@/lib/push/roster-notifications'
import { vapidConfig } from '@/lib/push/vapid'
import { bearerMatches } from '@/lib/cron-auth'

// POST /api/cron/moreskant-notifications — the roster's scheduled push (#435).
//
// The `send-review-emails` shape, for the same reasons documented there: a
// shared `CRON_SECRET` bearer, an external scheduler (a Coolify scheduled task
// every 15 minutes), no Payload Jobs and no worker process. See
// `docs/agents/deployment.md`.
//
// Two jobs in one run — the alarm at T-6h (18:00 the evening before for a
// morning performance) and the answer reminder at T-48h. Running it twice in
// the same minute sends once: the idempotency guard is the atomic claim on
// `performance_notifications`, not the schedule (`roster-notifications.ts`).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (!bearerMatches(req.headers.get('authorization'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const deps = createPushDeps(payload as unknown as PushPayload)

  try {
    const result = await runRosterNotifications({
      loadDuePerformances: () => loadDuePerformances(deps.query, Date.now()),
      loadAttendance: deps.loadAttendance,
      loadMoreskanti: deps.loadMoreskanti,
      loadUserIdsByMember: deps.loadUserIdsByMember,
      send: deps.send,
      claim: deps.claim,
      release: deps.release,
      finalize: deps.finalize,
    })
    // `pushEnabled: false` is the difference between "nothing was due" and
    // "this deployment has no VAPID keys", which otherwise look identical in a
    // scheduler log full of zeros.
    const body = { ...result, pushEnabled: vapidConfig() !== null }
    // Also to the container log, so a run's outcome is readable without
    // capturing the scheduler's HTTP response body.
    console.log('[cron/moreskant-notifications]', JSON.stringify(body))
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron failed'
    console.error('[cron/moreskant-notifications]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
