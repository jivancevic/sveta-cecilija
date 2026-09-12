import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { isPublicPerformance } from '@/lib/show-performance'
import { recordOfflineSale, type OfflineSaleTxPool } from '@/lib/offline-sales/data'
import {
  OfflineSaleValidationError,
  OFFLINE_SOURCES,
  type OfflineSaleLineDraft,
  type OfflineSource,
} from '@/lib/offline-sales/lines'
import type { PoolQuery } from '@/lib/tickets/sold-seats'

// The single writer of the offline sales ledger (ADR-0025). Replaces the old
// `in-person-sales` route, which accepted one positive integer and could record
// neither a ticket type, nor a price, nor a correction.
//
// A batch is all-or-nothing: the lines and the cached counter on `shows` move in
// one transaction inside `recordOfflineSale`, so the ledger and the counter can
// never disagree because a request died halfway.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'tickets')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const source: OfflineSource = body?.source ?? 'door'
  if (!OFFLINE_SOURCES.includes(source)) {
    return NextResponse.json({ error: `Unknown source: ${String(source)}` }, { status: 400 })
  }

  const lines = body?.lines
  if (!Array.isArray(lines)) {
    return NextResponse.json({ error: 'lines must be an array' }, { status: 400 })
  }

  const pool = (payload.db as unknown as { pool: { query: PoolQuery } & OfflineSaleTxPool }).pool
  const poolQuery: PoolQuery = (sql, p) => pool.query(sql, p)

  // #409 — a non-public performance sells no tickets, so an offline line
  // against one is meaningless. Checked before the transaction opens.
  const showRes = await poolQuery('SELECT id, is_public FROM shows WHERE id = $1', [Number(id)])
  const showRow = showRes.rows[0] as Record<string, unknown> | undefined
  if (!showRow) return NextResponse.json({ error: 'Show not found' }, { status: 404 })
  if (!isPublicPerformance(showRow)) {
    return NextResponse.json(
      { error: 'This performance is not public, so it has no seats to sell' },
      { status: 400 },
    )
  }

  try {
    const result = await recordOfflineSale(pool, {
      showId: id,
      source,
      lines: lines as OfflineSaleLineDraft[],
      createdById: user.id,
      note: typeof body?.note === 'string' ? body.note : null,
    })
    return NextResponse.json({
      source,
      counter: result.counter,
      totals: result.totals,
      lines: result.lines,
    })
  } catch (err) {
    if (err instanceof OfflineSaleValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : 'Failed to record offline sales'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
