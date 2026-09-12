import { describe, it, expect, vi } from 'vitest'
import {
  getOfflineSaleLinesForShow,
  getOfflineTotalsByShow,
  getSeasonOfflineTotals,
  recordOfflineSale,
} from './data'
import { publicPerformanceSql } from '../show-performance'

// A fake pg client that records every statement and answers the counter UPDATE
// with whatever total the test wants to simulate.
function fakePool(
  opts: {
    counterAfter?: number
    showMissing?: boolean
    /** Groups the (type, price) guard should report as having gone negative. */
    negativeGroups?: Array<Record<string, unknown>>
    rollbackFails?: boolean
  } = {},
) {
  const statements: Array<{ sql: string; params?: unknown[] }> = []
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      statements.push({ sql, params })
      if (opts.rollbackFails && /ROLLBACK/i.test(sql)) throw new Error('connection terminated')
      if (/^UPDATE shows/i.test(sql.trim())) {
        if (opts.showMissing) return { rows: [] }
        return { rows: [{ counter: opts.counterAfter ?? 100 }] }
      }
      if (/HAVING SUM\(quantity\) < 0/i.test(sql)) return { rows: opts.negativeGroups ?? [] }
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  const pool = { connect: vi.fn(async () => client) }
  return { pool, client, statements, sqls: () => statements.map((s) => s.sql) }
}

const doorLines = [
  { ticketType: 'adult' as const, quantity: 68 },
  { ticketType: 'adult' as const, quantity: 32, unitPriceCents: 1500, discountLabel: 'umirovljenici' },
]

describe('recordOfflineSale', () => {
  it('inserts the lines and moves the counter inside one transaction', async () => {
    const { pool, statements, sqls } = fakePool({ counterAfter: 100 })

    const result = await recordOfflineSale(pool, { showId: '3', source: 'door', lines: doorLines })

    const joined = sqls().join('\n')
    expect(joined).toMatch(/BEGIN/)
    expect(joined).toMatch(/INSERT INTO offline_sales/)
    expect(joined).toMatch(/COMMIT/)
    expect(joined).not.toMatch(/ROLLBACK/)

    // The insert carries one tuple per line, all under one statement.
    const insert = statements.find((s) => /INSERT INTO offline_sales/.test(s.sql))!
    expect(insert.sql.match(/\(\$1, \$2,/g)).toHaveLength(2)

    expect(result.counter).toBe(100)
    expect(result.totals).toMatchObject({ seats: 100, adult: 100, revenueCents: 68 * 2000 + 32 * 1500 })
  })

  it('moves in_person_sold for a door batch and legacy_reserved for a legacy one', async () => {
    const door = fakePool()
    await recordOfflineSale(door.pool, { showId: '1', source: 'door', lines: [{ ticketType: 'adult', quantity: 5 }] })
    const doorUpdate = door.statements.find((s) => /^UPDATE shows/i.test(s.sql.trim()))!
    expect(doorUpdate.sql).toMatch(/in_person_sold = COALESCE\(in_person_sold, 0\) \+ \$1/)
    expect(doorUpdate.params?.[0]).toBe(5)

    const legacy = fakePool()
    await recordOfflineSale(legacy.pool, {
      showId: '1',
      source: 'legacy',
      lines: [{ ticketType: 'adult', quantity: 75 }],
    })
    const legacyUpdate = legacy.statements.find((s) => /^UPDATE shows/i.test(s.sql.trim()))!
    expect(legacyUpdate.sql).toMatch(/legacy_reserved = COALESCE\(legacy_reserved, 0\) \+ \$1/)
    expect(legacyUpdate.params?.[0]).toBe(75)
  })

  it('moves the counter by the NET of the batch, so a correction subtracts', async () => {
    const { pool, statements } = fakePool()
    await recordOfflineSale(pool, {
      showId: '1',
      source: 'door',
      lines: [
        { ticketType: 'adult', quantity: 68 },
        { ticketType: 'adult', quantity: -20 },
      ],
    })
    const update = statements.find((s) => /^UPDATE shows/i.test(s.sql.trim()))!
    expect(update.params?.[0]).toBe(48)
  })

  it('rolls back and refuses to leave a performance owing seats', async () => {
    const { pool, sqls } = fakePool({ counterAfter: -5 })

    await expect(
      recordOfflineSale(pool, { showId: '1', source: 'door', lines: [{ ticketType: 'adult', quantity: -200 }] }),
    ).rejects.toThrow(/would leave -5 seats/i)

    expect(sqls().join('\n')).toMatch(/ROLLBACK/)
    expect(sqls().join('\n')).not.toMatch(/COMMIT/)
  })

  it('refuses a correction that takes back more than was ever recorded, at that price', async () => {
    // The money bug this guard exists for: 32 pensioners entered at €15, then
    // undone through the plain adult box, which defaults to the €20 face value.
    // Seats land on 0 but revenue lands on MINUS €160 with nothing to explain it.
    const { pool, sqls } = fakePool({
      counterAfter: 0,
      negativeGroups: [{ ticket_type: 'adult', unit_price_cents: 2000, q: -32 }],
    })

    await expect(
      recordOfflineSale(pool, {
        showId: '3',
        source: 'door',
        lines: [{ ticketType: 'adult', quantity: -32 }],
      }),
    ).rejects.toThrow(/takes back more adult tickets at €20\.00/i)

    expect(sqls().join('\n')).toMatch(/ROLLBACK/)
    expect(sqls().join('\n')).not.toMatch(/COMMIT/)
  })

  it('checks the correction guard per source, scoped to the performance', async () => {
    const { pool, statements } = fakePool()
    await recordOfflineSale(pool, {
      showId: '7',
      source: 'legacy',
      lines: [{ ticketType: 'adult', quantity: 1 }],
    })
    const guard = statements.find((s) => /HAVING SUM\(quantity\) < 0/i.test(s.sql))!
    expect(guard.params).toEqual([7, 'legacy'])
    expect(guard.sql).toMatch(/GROUP BY ticket_type, unit_price_cents/)
  })

  it('destroys the connection instead of pooling it when ROLLBACK itself fails', async () => {
    const { pool, client } = fakePool({ showMissing: true, rollbackFails: true })
    await expect(
      recordOfflineSale(pool, { showId: '1', source: 'door', lines: [{ ticketType: 'adult', quantity: 1 }] }),
    ).rejects.toThrow(/not found/i)
    // A client released WITH an error is evicted by pg rather than reused; a
    // connection still inside a transaction must never go back to the pool.
    expect(client.release).toHaveBeenCalledWith(expect.any(Error))
  })

  it('rolls back when the show does not exist', async () => {
    const { pool, sqls } = fakePool({ showMissing: true })
    await expect(
      recordOfflineSale(pool, { showId: '999', source: 'door', lines: [{ ticketType: 'adult', quantity: 1 }] }),
    ).rejects.toThrow(/not found/i)
    expect(sqls().join('\n')).toMatch(/ROLLBACK/)
  })

  it('validates before opening a transaction, so a bad batch never touches the DB', async () => {
    const { pool, client } = fakePool()
    await expect(
      recordOfflineSale(pool, {
        showId: '1',
        source: 'door',
        lines: [{ ticketType: 'adult', quantity: 5, unitPriceCents: 1500 }],
      }),
    ).rejects.toThrow(/discount label/i)
    expect(client.query).not.toHaveBeenCalled()
  })

  it('always returns the connection to the pool, even when the batch fails', async () => {
    const { pool, client } = fakePool({ showMissing: true })
    await expect(
      recordOfflineSale(pool, { showId: '1', source: 'door', lines: [{ ticketType: 'adult', quantity: 1 }] }),
    ).rejects.toThrow()
    expect(client.release).toHaveBeenCalled()
  })
})

// --- reads --------------------------------------------------------------------

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    show_id: 1,
    source: 'door',
    ticket_type: 'adult',
    quantity: 1,
    unit_price_cents: 2000,
    discount_label: null,
    note: null,
    created_at: new Date('2026-09-12T10:00:00Z'),
    ...over,
  }
}

describe('getOfflineTotalsByShow', () => {
  it('scopes to public performances and folds per show and per source', async () => {
    let seen = ''
    const query = vi.fn(async (sql: string) => {
      seen = sql
      return {
        rows: [
          row({ id: 1, show_id: 1, source: 'door', quantity: 48 }),
          row({ id: 2, show_id: 1, source: 'legacy', quantity: 75 }),
          row({ id: 3, show_id: 2, source: 'door', ticket_type: 'child', quantity: 6, unit_price_cents: 1000 }),
        ],
      }
    })

    const byShow = await getOfflineTotalsByShow(query)

    expect(seen).toContain(publicPerformanceSql('s'))
    expect(byShow.get('1')!.door).toMatchObject({ seats: 48, revenueCents: 96000 })
    expect(byShow.get('1')!.legacy).toMatchObject({ seats: 75, revenueCents: 150000 })
    expect(byShow.get('2')!.door).toMatchObject({ seats: 6, child: 6, revenueCents: 6000 })
    expect(byShow.get('2')!.legacy).toMatchObject({ seats: 0, revenueCents: 0 })
  })
})

describe('getSeasonOfflineTotals', () => {
  it('rolls every show up into one figure per source', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: [
        row({ id: 1, show_id: 1, source: 'door', quantity: 48 }),
        row({ id: 2, show_id: 2, source: 'door', quantity: 83 }),
        row({ id: 3, show_id: 1, source: 'legacy', quantity: 75 }),
      ],
    }))

    const totals = await getSeasonOfflineTotals(query)
    expect(totals.door).toMatchObject({ seats: 131, revenueCents: 131 * 2000 })
    expect(totals.legacy).toMatchObject({ seats: 75, revenueCents: 75 * 2000 })
  })
})

describe('getOfflineSaleLinesForShow', () => {
  it('reads one performance oldest first, so a correction reads after what it corrects', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: [row({ id: 1, quantity: 68 }), row({ id: 2, quantity: -20 })],
    }))
    const lines = await getOfflineSaleLinesForShow(query, '3')
    expect(lines.map((l) => l.quantity)).toEqual([68, -20])
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY id ASC/)
    expect(lines[0].createdAt).toBe('2026-09-12T10:00:00.000Z')
  })
})
