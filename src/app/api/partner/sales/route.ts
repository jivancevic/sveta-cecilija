import { NextRequest, NextResponse } from 'next/server'
import { isPartner, partnerIdOf } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import { getPartnerRecentSalesPage } from '@/lib/partner/recent-sales-page'
import type { PoolQuery } from '@/lib/tickets/sold-seats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_SIZE = 10
const MAX_SIZE = 50

// GET /api/partner/sales?page=N&size=M — one page of the caller partner's recent
// orders, newest first. Local API runs overrideAccess, so this re-checks the
// caller is a partner and scopes to THEIR own partner id (never trusts a
// query-supplied one). The pager requests size=10; the dashboard server-renders
// the first 3 directly without this route.
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
  const rawSize = Number(req.nextUrl.searchParams.get('size'))
  const pageSize = Number.isFinite(rawSize) ? Math.min(MAX_SIZE, Math.max(1, Math.floor(rawSize))) : DEFAULT_SIZE

  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, params) => pool.query(sql, params)

  const { sales, hasMore } = await getPartnerRecentSalesPage(poolQuery, Number(partnerId), {
    page,
    pageSize,
  })

  return NextResponse.json({ sales, hasMore, page, pageSize })
}
