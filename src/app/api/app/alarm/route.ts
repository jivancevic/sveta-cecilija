import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleManualAlarm } from '@/lib/push/alarm'
import { createPushDeps, loadPerformanceForAlarm, type PushPayload } from '@/lib/push/push-data'

// POST /api/app/alarm — "Pošalji alarm" (#431).
//
// `requirePermission(req, 'moreska')`: the alarm is the voditelj's instrument
// and a dancer must never be able to ring the whole roster. The local API runs
// `overrideAccess: true`, so the Shows collection access does not gate this —
// the guard does (CLAUDE.md hard rule).
//
// No throttle, deliberately (#430, story 23): a desperate evening is allowed
// two alarms, and the only person who can send one is already trusted with the
// roster. It still refuses a cancelled or already-started performance (409),
// because story 20 is a rule about every notification. The rules and the counts
// live in `src/lib/push/alarm.ts`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload } = gate

  const body = await req.json().catch(() => null)
  const deps = createPushDeps(payload as unknown as PushPayload)

  const result = await handleManualAlarm(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    loadPerformance: (id) => loadPerformanceForAlarm(payload as unknown as PushPayload, id),
    loadAttendance: deps.loadAttendance,
    loadMoreskanti: deps.loadMoreskanti,
    loadUserIdsByMember: deps.loadUserIdsByMember,
    send: deps.send,
  })

  return NextResponse.json(result.body, { status: result.status })
}
