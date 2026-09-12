import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { isPublicPerformance } from '@/lib/show-performance'
import {
  getOfflineSaleLinesForShow,
  recordOfflineSale,
  type OfflineSaleTxPool,
} from '@/lib/offline-sales/data'
import { sumOfflineLines } from '@/lib/offline-sales/lines'
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

  // `note` is varchar(255); without this the overflow surfaces as a raw
  // Postgres error reported to the operator as "your input was wrong".
  const note = typeof body?.note === 'string' ? body.note.trim() : null
  if (note !== null && note.length > 255) {
    return NextResponse.json({ error: 'note is longer than 255 characters' }, { status: 400 })
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
      note: note || null,
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
    if (/not found/i.test(message)) return NextResponse.json({ error: message }, { status: 404 })
    // Anything left is ours, not the caller's: a dead pool, a constraint the app
    // failed to enforce first. Reporting those as 400 tells the operator to fix
    // input that was fine.
    console.error('[offline-sales] unexpected failure', err)
    return NextResponse.json({ error: 'Failed to record the sale' }, { status: 500 })
  }
}

// What is already on the books for this performance.
//
// This is a safety feature, not a convenience. The write guard can prove a
// correction never drives a (type, price) group negative, but it cannot know
// WHICH line the operator meant to undo: enter 32 pensioners at €15, then type
// -32 into the plain adult box, and the ledger faithfully records "36 adults at
// €20 plus 32 at €15" when the operator meant "68 adults at €20". Same seat
// count, €160 apart, and nothing on screen to notice it by. So the entry UI
// shows the lines, and a correction is made against something visible.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'tickets')
  if (gate.error) return gate.error
  const { payload } = gate

  const { id } = await params
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, p) => pool.query(sql, p)

  try {
    const lines = await getOfflineSaleLinesForShow(poolQuery, id)
    return NextResponse.json({ lines, totals: sumOfflineLines(lines) })
  } catch (err) {
    console.error('[offline-sales] read failed', err)
    return NextResponse.json({ error: 'Failed to read the sales ledger' }, { status: 500 })
  }
}
