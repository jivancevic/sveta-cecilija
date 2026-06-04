import { NextRequest, NextResponse } from 'next/server'
import { type Where } from 'payload'
import { isAuthed } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { getNextShow } from '@/lib/shows'
import {
  lookupOrder,
  type LookupMode,
  type MatchedOrder,
  type NormalizedQuery,
  type OrderLookupDeps,
} from '@/lib/order-lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LookupBody {
  showId: string | number
  query: string
  mode: LookupMode
}

function whereForQuery(q: NormalizedQuery, showId: number | string): Where {
  const and: Where[] = [{ show: { equals: showId } }]
  if (q.mode === 'email') {
    and.push({ email: { equals: q.email } })
  } else if (q.mode === 'code') {
    and.push({ code: { equals: q.code } })
  } else {
    for (const term of q.terms) and.push({ buyerName: { like: term } })
  }
  return { and }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, isAuthed)
  if (gate.error) return gate.error
  const { payload, user } = gate

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
  // definition as the tehnika dashboard (see `getNextShow` in @/lib/shows).
  // Prevents tehnika from probing arbitrary historical shows by passing a
  // different showId from the client.
  const next = await getNextShow()
  if (!next) {
    return NextResponse.json({ error: 'No upcoming show' }, { status: 403 })
  }
  const showIdStr = String(body.showId)
  if (String(next.id) !== showIdStr) {
    return NextResponse.json({ error: 'Show is not the active door show' }, { status: 403 })
  }
  const showIdRef = Number.isFinite(Number(showIdStr)) ? Number(showIdStr) : showIdStr

  const deps: OrderLookupDeps = {
    findMatches: async (q) => {
      const found = await payload.find({
        collection: 'orders',
        where: whereForQuery(q, showIdRef),
        depth: 0,
        limit: 20,
      })
      return found.docs.map<MatchedOrder>((o) => ({
        id: String(o.id),
        buyerName: o.buyerName as string,
        adultCount: (o.adultCount as number) ?? 0,
        childCount: (o.childCount as number) ?? 0,
      }))
    },
    loadTokens: async (orderId) => {
      const tickets = await payload.find({
        collection: 'tickets',
        where: { order: { equals: Number.isFinite(Number(orderId)) ? Number(orderId) : orderId } },
        depth: 0,
        limit: 200,
        sort: 'createdAt',
      })
      // Only active tickets are admittable; a cancelled ticket is not a real seat.
      return tickets.docs
        .filter((t) => t.status !== 'cancelled')
        .map((t) => ({ token: t.token as string, scanned: !!t.scanned }))
    },
    loadShow: async () => ({ date: next.date, time: next.time, venue: next.venue }),
    recordAudit: async (entry) => {
      try {
        await payload.create({
          collection: 'order-lookups',
          data: {
            user: user.id as number | string,
            show: showIdRef,
            query: entry.query,
            mode: entry.mode,
            matchedOrderId: entry.matchedOrderIds.join(','),
          },
        })
      } catch (err) {
        console.error('[orders/lookup] audit log failed', err)
      }
    },
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
