import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { getRepo } from '@/lib/repo'
import { getNextShow } from '@/lib/shows'
import { lookupOrder, type LookupMode, type OrderLookupDeps } from '@/lib/order-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The door's manual-admit search (#245), now serving the Skener screen (#504).
//
// The rules are in the pure `order-lookup.ts` (normalisation, the single-match
// rule that keeps the buyer list unbrowsable, the always-on audit write); the
// queries are in the repository seam (`repo.orders`, #475). What is left here is
// the gate and the one thing neither of those can decide: WHICH performance may
// be searched.

interface LookupBody {
  showId: string | number
  query: string
  mode: LookupMode
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, ['door', 'tickets'])
  if (gate.error) return gate.error
  const { user } = gate
  const repo = getRepo()

  let body: LookupBody
  try {
    body = (await req.json()) as LookupBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (body.mode !== 'email' && body.mode !== 'name' && body.mode !== 'code') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }

  // Server-side guard: only the currently-next show is queryable. Same
  // definition as the Skener ring (see `getNextShow` in @/lib/shows).
  // Prevents a door account from probing arbitrary historical shows by passing
  // a different showId from the client.
  const next = await getNextShow()
  if (!next) {
    return NextResponse.json({ error: 'No upcoming show' }, { status: 403 })
  }
  const showIdStr = String(body.showId)
  if (String(next.id) !== showIdStr) {
    return NextResponse.json({ error: 'Show is not the active door show' }, { status: 403 })
  }

  const deps: OrderLookupDeps = {
    findMatches: (q) => repo.orders.findForDoorLookup(q, showIdStr),
    loadTokens: (orderId) => repo.orders.activeTicketsOfOrder(orderId),
    loadShow: async () => ({ date: next.date, time: next.time, venue: next.venue }),
    recordAudit: (entry) =>
      repo.orders.recordLookup({
        userId: user.id,
        showId: showIdStr,
        mode: entry.mode,
        query: entry.query,
        matchedOrderIds: entry.matchedOrderIds,
      }),
  }

  const result = await lookupOrder(
    { mode: body.mode, query: body.query ?? '', showId: showIdStr },
    deps,
  )

  if (result.status === 'INVALID_QUERY') {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }
  return NextResponse.json({ result })
}
