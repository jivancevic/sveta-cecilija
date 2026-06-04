import { NextRequest, NextResponse } from 'next/server'
import { addInPersonSales, incrementInPersonSold } from '@/lib/in-person-sales'
import { requireRole } from '@/lib/access/route-guard'
import { isAdminTier } from '@/lib/access/roles'
import type { PoolQuery } from '@/lib/tickets/sold-seats'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const rawCount = body?.count
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount <= 0) {
    return NextResponse.json({ error: 'count must be a positive integer' }, { status: 400 })
  }
  const count = rawCount

  // The payload-postgres adapter exposes its pg pool at `payload.db.pool`; the
  // atomic UPDATE itself lives in the in-person-sales seam (unit-tested there).
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, params) => pool.query(sql, params)

  try {
    const result = await addInPersonSales(
      { showId: id, count },
      { atomicIncrement: (showId, delta) => incrementInPersonSold(poolQuery, showId, delta) },
    )
    return NextResponse.json({ inPersonSold: result.inPersonSold })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add in-person sales'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
