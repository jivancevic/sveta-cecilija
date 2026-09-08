import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handlePushSubscribe } from '@/lib/push/subscribe'
import { poolQuery, saveSubscription } from '@/lib/push/store'

// POST /api/app/push/subscribe — register this device (#431).
//
// Wiring only: the validation and the upsert rule live in
// `src/lib/push/subscribe.ts`, the SQL in `src/lib/push/store.ts`.
//
// `requirePermission(['moreskant', 'moreska'])` is the chokepoint every staff
// route uses (CLAUDE.md hard rule): 401 without a session, 403 for a `tickets`,
// `door` or `partner` login, which have no `/app` to be notified about. The
// `/app` cross-site guard then refuses a foreign `Origin` (403) or a non-JSON
// body (415) before anything is written.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, ['moreskant', 'moreska'])
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)
  const query = poolQuery(payload)

  const result = await handlePushSubscribe(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    userId: String(user.id),
    userAgent: req.headers.get('user-agent'),
    saveSubscription: (row) => saveSubscription(query, row),
  })

  return NextResponse.json(result.body, { status: result.status })
}
