import { describe, it, expect, vi } from 'vitest'
import {
  voidOrderTickets,
  voidSingleTicket,
  voidUnscannedOrderTickets,
  voidUnscannedTicket,
} from './ticket-void'

// The module owns the SQL now; tests inject a fake executor and assert the
// voided count + that the statement was run. The SQL's actual seat-freeing is
// regression-checked against a real DB by scripts/probe-refund-void.mjs.
const fakeDb = (result: { rows?: unknown[] } | unknown[]) => ({
  execute: vi.fn().mockResolvedValue(result),
})

describe('voidOrderTickets', () => {
  it('returns the count of rows the UPDATE voided ({ rows } shape)', async () => {
    const db = fakeDb({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    const result = await voidOrderTickets(db, 'ord_1', 'refund')
    expect(result).toEqual({ voided: 3 })
    expect(db.execute).toHaveBeenCalledOnce()
  })

  it('handles a bare-array driver result', async () => {
    const db = fakeDb([{ id: 1 }])
    expect(await voidOrderTickets(db, 'ord_1', 'storno')).toEqual({ voided: 1 })
  })

  it('is idempotent: voiding an already-cancelled order is a no-op (0 voided)', async () => {
    const db = fakeDb({ rows: [] })
    expect(await voidOrderTickets(db, 'ord_1', 'refund')).toEqual({ voided: 0 })
  })
})

describe('voidSingleTicket', () => {
  it('returns 1 when one active ticket is voided', async () => {
    const db = fakeDb({ rows: [{ id: 7 }] })
    const result = await voidSingleTicket(db, 'tk_1', 'storno')
    expect(result).toEqual({ voided: 1 })
    expect(db.execute).toHaveBeenCalledOnce()
  })

  it('is idempotent: voiding an already-cancelled ticket is a no-op (0 voided)', async () => {
    const db = fakeDb({ rows: [] })
    expect(await voidSingleTicket(db, 'tk_1', 'refund')).toEqual({ voided: 0 })
  })
})

// The statement text, without a database: every literal chunk of the drizzle
// `sql` object joined. Enough to assert which WHERE clause a void carries.
function statementOf(db: { execute: ReturnType<typeof vi.fn> }): string {
  const q = db.execute.mock.calls[0][0] as { queryChunks: Array<{ value?: string[] }> }
  return q.queryChunks.map((c) => (c.value ?? []).join('')).join(' ')
}

describe('the comp void leaves a scanned ticket alone (#701)', () => {
  it('voidUnscannedOrderTickets only touches unscanned rows', async () => {
    const db = fakeDb({ rows: [{ id: 1 }, { id: 2 }] })
    expect(await voidUnscannedOrderTickets(db, 'ord_1', 'storno')).toEqual({ voided: 2 })
    expect(statementOf(db)).toMatch(/status = 'active' AND scanned = false/)
  })

  it('voidUnscannedTicket only touches an unscanned row', async () => {
    const db = fakeDb({ rows: [] })
    expect(await voidUnscannedTicket(db, 'tk_1', 'storno')).toEqual({ voided: 0 })
    expect(statementOf(db)).toMatch(/status = 'active' AND scanned = false/)
  })

  it('the refund and partner voids stay unconditional', async () => {
    const db = fakeDb({ rows: [] })
    await voidOrderTickets(db, 'ord_1', 'refund')
    expect(statementOf(db)).not.toMatch(/scanned/)
  })
})
