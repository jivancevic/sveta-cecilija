import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handlePushUnsubscribe } from '@/lib/push/subscribe'
import { poolQuery, removeSubscription } from '@/lib/push/store'

// POST /api/app/push/unsubscribe — the per-device off switch (#431).
//
// The mirror of the subscribe route, same gate and same guard. Deleting is
// scoped to the caller's OWN rows: an endpoint is a long opaque string, but it
// is not a secret anyone has to guess, and switching off somebody else's phone
// should not be one signed-in account away.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, ['moreskant', 'moreska'])
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)
  const query = poolQuery(payload)

  const result = await handlePushUnsubscribe(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    userId: String(user.id),
    removeSubscription: (userId, endpoint) => removeSubscription(query, userId, endpoint),
  })

  return NextResponse.json(result.body, { status: result.status })
}
