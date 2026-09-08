import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPushDeps, loadDuePerformances, type PushPayload } from '@/lib/push/push-data'
import { runRosterNotifications } from '@/lib/push/roster-notifications'
import type { ScheduledNotificationType } from '@/lib/push/schedule'

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
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) {
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
      claim: (performanceId: string, type: ScheduledNotificationType) =>
        deps.claim(performanceId, type),
      release: (performanceId: string, type: ScheduledNotificationType) =>
        deps.release(performanceId, type),
      finalize: (performanceId: string, type: ScheduledNotificationType, devices: number) =>
        deps.finalize(performanceId, type, devices),
    })
    // Also to the container log, so a run's outcome is readable without
    // capturing the scheduler's HTTP response body.
    console.log('[cron/moreskant-notifications]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron failed'
    console.error('[cron/moreskant-notifications]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
