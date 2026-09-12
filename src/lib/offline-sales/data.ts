// The offline sales ledger, impure half (ADR-0025). Owns the SQL: the
// append-only insert, the two cached counters on `shows`, and the aggregate
// reads. All arithmetic is delegated to ./lines.ts so revenue has exactly one
// definition.
//
// THE INVARIANT this module exists to hold:
//   shows.in_person_sold  = SUM(quantity) WHERE source = 'door'
//   shows.legacy_reserved = SUM(quantity) WHERE source = 'legacy'
// The counters are a denormalised cache, kept so the seat formula
// (`remainingSeats`) and its eight call sites keep working untouched. Capacity
// reads the counters; money and the adult/child split read the ledger. A writer
// who moves one without the other breaks the pair — which is why the insert and
// the counter update share one transaction here and there is no second writer.

import type { PoolQuery } from '../tickets/sold-seats'
import { publicPerformanceSql } from '../show-performance'
import {
  addOfflineTotals,
  EMPTY_OFFLINE_TOTALS,
  netQuantity,
  OfflineSaleValidationError,
  resolveOfflineSaleLines,
  sumOfflineLines,
  type OfflineSaleLine,
  type OfflineSaleLineDraft,
  type OfflineSource,
  type OfflineTicketType,
  type OfflineTotals,
} from './lines'

/** Minimal slice of node-postgres we depend on, so this is unit-testable. */
export interface OfflineSaleTxClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
  release?: () => void
}
export interface OfflineSaleTxPool {
  connect: () => Promise<OfflineSaleTxClient>
}

// Which cached counter each source maintains. A closed map, never user input —
// the column name is interpolated into SQL below and this is what makes that safe.
const COUNTER_COLUMN: Record<OfflineSource, 'in_person_sold' | 'legacy_reserved'> = {
  door: 'in_person_sold',
  legacy: 'legacy_reserved',
}

export interface RecordOfflineSaleInput {
  showId: string | number
  source: OfflineSource
  lines: readonly OfflineSaleLineDraft[]
  createdById?: string | number | null
  note?: string | null
}

export interface RecordOfflineSaleResult {
  lines: OfflineSaleLine[]
  totals: OfflineTotals
  /** The cached counter's new value for this source. */
  counter: number
}

/**
 * Append a batch of lines and move the cached counter by their net quantity, in
 * one transaction.
 *
 * Refuses to drive a counter below zero: a correction may cancel earlier lines
 * but can never leave a performance owing seats, which would silently inflate
 * remaining capacity everywhere the counter is subtracted.
 *
 * Deliberately NOT capacity-guarded. This records what already happened, often
 * for a performance that took place weeks ago, so a capacity check could only
 * ever refuse to write down the truth.
 */
export async function recordOfflineSale(
  pool: OfflineSaleTxPool,
  input: RecordOfflineSaleInput,
): Promise<RecordOfflineSaleResult> {
  const lines = resolveOfflineSaleLines(input.lines)
  const showId = Number(input.showId)
  if (!Number.isInteger(showId)) {
    throw new OfflineSaleValidationError('BAD_QUANTITY', 'Show id must be numeric')
  }
  const column = COUNTER_COLUMN[input.source]
  if (!column) {
    throw new OfflineSaleValidationError('BAD_TYPE', `Unknown source: ${String(input.source)}`)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // One multi-row INSERT: $1 show, $2 source, $3 author, $4 note, then four
    // placeholders per line.
    const params: unknown[] = [showId, input.source, input.createdById ?? null, input.note ?? null]
    const tuples = lines.map((line) => {
      const base = params.length
      params.push(line.ticketType, line.quantity, line.unitPriceCents, line.discountLabel)
      return `($1, $2, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $3, $4)`
    })
    await client.query(
      `INSERT INTO offline_sales
         (show_id, source, ticket_type, quantity, unit_price_cents, discount_label, created_by_id, note)
       VALUES ${tuples.join(', ')}`,
      params,
    )

    // Atomic `col = col + $1` — never read-modify-write (the accumulating-column
    // hard rule, docs/agents/db-bootstrap.md).
    const delta = netQuantity(lines)
    const res = await client.query(
      `UPDATE shows SET ${column} = COALESCE(${column}, 0) + $1, updated_at = NOW()
       WHERE id = $2 RETURNING ${column} AS counter`,
      [delta, showId],
    )
    if (res.rows.length === 0) throw new Error('Show not found')
    const counter = Number(res.rows[0].counter)
    if (counter < 0) {
      throw new OfflineSaleValidationError(
        'BAD_QUANTITY',
        `That correction would leave ${counter} seats recorded for this performance`,
      )
    }

    await client.query('COMMIT')
    return { lines, totals: sumOfflineLines(lines), counter }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release?.()
  }
}

/** One stored line, as read back for display. */
export interface StoredOfflineSaleLine extends OfflineSaleLine {
  id: number
  showId: string
  source: OfflineSource
  note: string | null
  createdAt: string
}

function toLine(row: Record<string, unknown>): StoredOfflineSaleLine {
  return {
    id: Number(row.id),
    showId: String(row.show_id),
    source: row.source as OfflineSource,
    ticketType: row.ticket_type as OfflineTicketType,
    quantity: Number(row.quantity),
    unitPriceCents: Number(row.unit_price_cents),
    discountLabel: (row.discount_label as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

/** Every line of one performance, oldest first, so a correction reads after what it corrects. */
export async function getOfflineSaleLinesForShow(
  query: PoolQuery,
  showId: string | number,
): Promise<StoredOfflineSaleLine[]> {
  const res = await query(
    `SELECT id, show_id, source, ticket_type, quantity, unit_price_cents, discount_label, note, created_at
     FROM offline_sales WHERE show_id = $1 ORDER BY id ASC`,
    [Number(showId)],
  )
  return res.rows.map(toLine)
}

/** Per-source totals for one performance. */
export type OfflineTotalsBySource = Record<OfflineSource, OfflineTotals>

export function emptyTotalsBySource(): OfflineTotalsBySource {
  return { door: { ...EMPTY_OFFLINE_TOTALS }, legacy: { ...EMPTY_OFFLINE_TOTALS } }
}

function foldBySource(rows: Array<Record<string, unknown>>): Map<string, OfflineTotalsBySource> {
  const out = new Map<string, OfflineTotalsBySource>()
  for (const row of rows) {
    const line = toLine(row)
    const key = line.showId
    let entry = out.get(key)
    if (!entry) {
      entry = emptyTotalsBySource()
      out.set(key, entry)
    }
    entry[line.source] = addOfflineTotals(entry[line.source], sumOfflineLines([line]))
  }
  return out
}

/**
 * Totals per show, per source, across PUBLIC performances only (ADR-0024): a
 * non-public performance has no venue, no capacity and no door, so it can never
 * carry an offline line.
 */
export async function getOfflineTotalsByShow(
  query: PoolQuery,
): Promise<Map<string, OfflineTotalsBySource>> {
  const res = await query(
    `SELECT os.id, os.show_id, os.source, os.ticket_type, os.quantity,
            os.unit_price_cents, os.discount_label, os.note, os.created_at
     FROM offline_sales os
     JOIN shows s ON s.id = os.show_id
     WHERE ${publicPerformanceSql('s')}`,
  )
  return foldBySource(res.rows)
}

/** The same rows folded to one season figure per source. */
export async function getSeasonOfflineTotals(query: PoolQuery): Promise<OfflineTotalsBySource> {
  const byShow = await getOfflineTotalsByShow(query)
  const out = emptyTotalsBySource()
  for (const entry of byShow.values()) {
    out.door = addOfflineTotals(out.door, entry.door)
    out.legacy = addOfflineTotals(out.legacy, entry.legacy)
  }
  return out
}
