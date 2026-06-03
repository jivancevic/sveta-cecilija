import { NextRequest, NextResponse } from 'next/server'
import { type Where } from 'payload'
import { isAuthed } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { getNextShow } from '@/lib/shows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface LookupBody {
  showId: string | number
  query: string
  mode: 'email' | 'name'
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

  const query = (body.query ?? '').trim()
  if (!query) return NextResponse.json({ error: 'Empty query' }, { status: 400 })
  if (body.mode !== 'email' && body.mode !== 'name') {
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

  // Build query.
  const andConds: Where[] = [{ show: { equals: showIdRef } }]

  if (body.mode === 'email') {
    // Exact, case-insensitive.
    andConds.push({ email: { equals: query.toLowerCase() } })
  } else {
    // Name mode: require at least two words; both must appear (case-insensitive).
    const parts = query.split(/\s+/).filter(Boolean)
    if (parts.length < 2) {
      return NextResponse.json(
        { error: 'Name search needs first and last name' },
        { status: 400 },
      )
    }
    for (const p of parts) {
      andConds.push({ buyerName: { like: p } })
    }
  }

  const found = await payload.find({
    collection: 'orders',
    where: { and: andConds },
    depth: 0,
    limit: 20,
  })

  // Pull tokens for each matched order in one query.
  const matchedIds = found.docs.map((d) => d.id as number | string)
  const tokens =
    matchedIds.length === 0
      ? { docs: [] as Array<Record<string, unknown>> }
      : await payload.find({
          collection: 'tickets',
          where: { order: { in: matchedIds } },
          depth: 0,
          limit: 200,
          sort: 'createdAt',
        })

  const tokensByOrder = new Map<string, Array<{ token: string; scanned: boolean }>>()
  for (const t of tokens.docs) {
    const orderId = String((t.order as { id: string | number } | number | string) ?? '')
    // order field may be id or object; normalize.
    const oid =
      typeof t.order === 'object' && t.order !== null
        ? String((t.order as { id: string | number }).id)
        : String(t.order)
    const list = tokensByOrder.get(oid) ?? []
    list.push({ token: t.token as string, scanned: !!t.scanned })
    tokensByOrder.set(oid, list)
    void orderId
  }

  const results = found.docs.map((o) => ({
    id: String(o.id),
    buyerName: o.buyerName as string,
    email: o.email as string,
    adultCount: (o.adultCount as number) ?? 0,
    childCount: (o.childCount as number) ?? 0,
    refundStatus: (o.refundStatus as 'none' | 'refunded') ?? 'none',
    tokens: tokensByOrder.get(String(o.id)) ?? [],
  }))

  // Audit. Always log, even on 0 matches.
  try {
    await payload.create({
      collection: 'order-lookups',
      data: {
        user: user.id as number | string,
        show: showIdRef,
        query: query.toLowerCase(),
        mode: body.mode,
        matchedOrderId: matchedIds.join(','),
      },
    })
  } catch (err) {
    console.error('[orders/lookup] audit log failed', err)
  }

  return NextResponse.json({ results })
}
