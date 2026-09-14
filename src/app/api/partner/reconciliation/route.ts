import { NextRequest, NextResponse } from 'next/server'
import { actsAsPartner, partnerIdOf } from '@/lib/access/partner'
import { requirePermission } from '@/lib/access/route-guard'
import { loadPartnerStatement } from '@/lib/partner/load-statement'
import { statementToCsv } from '@/lib/partner/reconciliation-csv'
import { renderStatementPdf } from '@/lib/partner/render-statement-pdf'
import { statementFileBase } from '@/lib/partner/statement-document'
import { getRepo } from '@/lib/repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/partner/reconciliation?year=&month=&format=pdf|csv|json[&partnerId=]
//
// The Obračun, in whichever form the caller asked for. All three come from one
// load (`loadPartnerStatement`), so the figures on screen, the figures in the
// spreadsheet and the figures on the PDF are one computation and cannot
// disagree — and when the month has been marked sent, all three come out of
// storage, so a download a year later is the document that was actually sent.
//
// Local API runs overrideAccess, so this route re-derives the scope:
//   - partner: ALWAYS its own partner id; a query partnerId is ignored.
//   - a `finance` holder: may pass ?partnerId= to view any partner's statement.
// Anyone else is 403. The statement is money, so since #500 it is `finance`
// that opens it, not `tickets`: the secretary keeps it because she holds both.
//
// **PDF is the default** since #599, because the PDF is what gets attached to
// an e-mail: it is the same document on every machine, and the CSV that used to
// be the default opened as one column of mojibake on the Croatian Excel it was
// written for. The CSV is still here, repaired, for the person who wants to sum
// a column.
export async function GET(req: NextRequest) {
  const gate = await requirePermission(req, ['finance', 'partner'])
  if (gate.error) return gate.error
  const { user } = gate

  const partnerLogin = actsAsPartner(user as { permissions?: unknown; partner?: unknown } | null)

  const url = new URL(req.url)
  const year = Number(url.searchParams.get('year'))
  const month = Number(url.searchParams.get('month'))
  const format = (url.searchParams.get('format') ?? 'pdf').toLowerCase()
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
  }

  // Resolve the partner id to report on. A partner is locked to its own id;
  // a `finance` holder may target any partner via ?partnerId=.
  let partnerId: number | string | undefined
  if (partnerLogin) {
    partnerId = partnerIdOf(user as { permissions?: unknown; partner?: unknown } | null) ?? undefined
  } else {
    const requested = url.searchParams.get('partnerId')
    partnerId = requested ? Number(requested) : undefined
  }
  if (partnerId == null || !Number.isFinite(Number(partnerId))) {
    return NextResponse.json({ error: 'Partner not specified' }, { status: 400 })
  }

  const repo = getRepo()
  const partner = await repo.partners.byId(partnerId)
  if (!partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }

  const { document, sent } = await loadPartnerStatement(repo.db.query, {
    partner,
    year,
    month,
  })

  if (format === 'json') {
    // `sent` rides alongside the document rather than inside it: the document
    // is what was said about the month, and whether it has been posted is a
    // fact about the settlement rather than a line on it.
    return NextResponse.json({ document, sent })
  }

  const base = statementFileBase(document)

  if (format === 'csv') {
    return new NextResponse(statementToCsv(document), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const pdf = await renderStatementPdf({ doc: document })
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${base}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
