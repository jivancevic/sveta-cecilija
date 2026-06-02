import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isAdminTier, isPartner, partnerIdOf } from '@/lib/access/roles'
import { type PoolQuery } from '@/lib/tickets/sold-seats'
import { getPartnerReconciliation } from '@/lib/partner/partner-data'
import { reconciliationToCsv } from '@/lib/partner/reconciliation-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/partner/reconciliation?year=&month=&format=csv|json[&partnerId=]
//
// Local API runs overrideAccess, so this route re-derives the scope:
//   - partner: ALWAYS its own partner id; a body/query partnerId is ignored.
//   - admin-tier: may pass ?partnerId= to view any partner's statement.
// Anyone else is 403. Defaults to CSV download (text/csv attachment); pass
// ?format=json for the structured statement.
export async function GET(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })

  const admin = isAdminTier(user as { role?: string } | null)
  const partner = isPartner(user as { role?: string } | null)
  if (!admin && !partner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year'))
  const month = Number(url.searchParams.get('month'))
  const format = (url.searchParams.get('format') ?? 'csv').toLowerCase()
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
  }

  // Resolve the partner id to report on. A partner is locked to its own id;
  // an admin may target any partner via ?partnerId=.
  let partnerId: number | string | undefined
  if (partner) {
    partnerId = partnerIdOf(user as { role?: string; partner?: unknown } | null)
  } else {
    const requested = url.searchParams.get('partnerId')
    partnerId = requested ? Number(requested) : undefined
  }
  if (partnerId == null || !Number.isFinite(Number(partnerId))) {
    return NextResponse.json({ error: 'Partner not specified' }, { status: 400 })
  }

  const partnerRecord = await payload
    .findByID({ collection: 'partners', id: partnerId as number, depth: 0 })
    .catch(() => null)
  if (!partnerRecord) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }
  const commissionPercent = Number(partnerRecord.commissionPercent ?? 10)
  const partnerName = String(partnerRecord.name ?? `Partner ${partnerId}`)

  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const statement = await getPartnerReconciliation(
    (sql, params) => pool.query(sql, params),
    { partnerId: Number(partnerId), commissionPercent, year, month },
  )

  if (format === 'json') {
    return NextResponse.json({ partnerName, ...statement })
  }

  const csv = reconciliationToCsv(statement, partnerName)
  const fileName = `reconciliation-${slug(partnerName)}-${statement.year}-${String(statement.month).padStart(2, '0')}.csv`
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'partner'
}
