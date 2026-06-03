import { describe, it, expect, vi } from 'vitest'
import { withShowSellLock, SEAT_SELL_LOCK_NAMESPACE } from './sell-lock'

function fakePool() {
  const queries: { sql: string; params?: unknown[] }[] = []
  const release = vi.fn()
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return { rows: [] }
    }),
    release,
  }
  const pool = { connect: vi.fn(async () => client) }
  return { pool, client, queries, release }
}

describe('withShowSellLock', () => {
  it('acquires the advisory lock before running the critical section and releases after', async () => {
    const { pool, queries } = fakePool()
    const order: string[] = []

    await withShowSellLock(pool, 42, async () => {
      order.push('critical')
      return 'ok'
    })

    expect(queries[0].sql).toMatch(/pg_advisory_lock/)
    expect(queries[0].params).toEqual([SEAT_SELL_LOCK_NAMESPACE, 42])
    expect(queries[queries.length - 1].sql).toMatch(/pg_advisory_unlock/)
    expect(queries[queries.length - 1].params).toEqual([SEAT_SELL_LOCK_NAMESPACE, 42])
    // Lock acquired, then critical, then unlock — in that order.
    expect(queries.map((q) => q.sql.replace(/.*pg_advisory_(\w+).*/, '$1'))).toEqual(['lock', 'unlock'])
    expect(order).toEqual(['critical'])
  })

  it('returns the critical section result', async () => {
    const { pool } = fakePool()
    const result = await withShowSellLock(pool, 1, async () => ({ orderId: '99' }))
    expect(result).toEqual({ orderId: '99' })
  })

  it('releases the lock AND the connection even when the critical section throws', async () => {
    const { pool, client, queries, release } = fakePool()

    await expect(
      withShowSellLock(pool, 7, async () => {
        throw new Error('insert failed')
      }),
    ).rejects.toThrow('insert failed')

    // Both lock and unlock ran despite the throw.
    expect(queries.some((q) => /pg_advisory_lock/.test(q.sql))).toBe(true)
    expect(queries.some((q) => /pg_advisory_unlock/.test(q.sql))).toBe(true)
    expect(release).toHaveBeenCalledTimes(1)
    void client
  })

  it('keys the lock on the show id, so different shows get different lock keys', async () => {
    const { pool, queries } = fakePool()
    await withShowSellLock(pool, 100, async () => null)
    await withShowSellLock(pool, 200, async () => null)
    const lockCalls = queries.filter((q) => /pg_advisory_lock/.test(q.sql))
    expect(lockCalls.map((q) => (q.params as number[])[1])).toEqual([100, 200])
  })
})
