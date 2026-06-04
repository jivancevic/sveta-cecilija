import { NextRequest, NextResponse } from 'next/server'
import { isPartner, partnerIdOf } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { getPartnerRecentSalesPage } from '@/lib/partner/recent-sales-page'
import type { PoolQuery } from '@/lib/tickets/sold-seats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 5

// GET /api/partner/sales?page=N — one page of the caller partner's recent sales,
// newest first. Local API runs overrideAccess, so this re-checks the caller is a
// partner and scopes to THEIR own partner id (never trusts a query-supplied one).
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, isPartner)
  if (gate.error) return gate.error
  const { payload, user } = gate

  const partnerId = partnerIdOf(user as { role?: string; partner?: unknown } | null)
  if (partnerId == null) {
    return NextResponse.json({ error: 'Account not linked to a partner' }, { status: 403 })
  }

  const rawPage = Number(req.nextUrl.searchParams.get('page'))
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1

  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, params) => pool.query(sql, params)

  const { sales, hasMore } = await getPartnerRecentSalesPage(poolQuery, Number(partnerId), {
    page,
    pageSize: PAGE_SIZE,
  })

  return NextResponse.json({ sales, hasMore, page })
}
