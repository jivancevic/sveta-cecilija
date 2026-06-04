import { describe, it, expect, vi } from 'vitest'
import { resolveEnvInfo, parseDatabaseName } from './env-info'
import { getDataIntegrity } from './data-integrity'
import { getIntegrationHealth } from './integration-health'
import { summarizeStripeBalance, createStripeBalanceCache } from './stripe-balance'
import { gatherDevDiagnostics } from './gather'

describe('resolveEnvInfo', () => {
  it('classifies staging before production (NEXT_PUBLIC_ENV wins)', () => {
    const info = resolveEnvInfo({
      NEXT_PUBLIC_ENV: 'staging',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host:5432/sveta_cecilija_staging',
      NEXT_PUBLIC_BASE_URL: 'https://dev.moreska.eu',
    })
    expect(info.environment).toBe('staging')
    expect(info.databaseName).toBe('sveta_cecilija_staging')
    expect(info.danger).toBe(false)
  })

  it('classifies production and marks it dangerous', () => {
    const info = resolveEnvInfo({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host:5432/sveta_cecilija',
      NEXT_PUBLIC_BASE_URL: 'https://moreska.eu',
    })
    expect(info.environment).toBe('production')
    expect(info.danger).toBe(true)
    expect(info.databaseName).toBe('sveta_cecilija')
  })

  it('classifies local dev', () => {
    const info = resolveEnvInfo({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sveta_cecilija_dev',
    })
    expect(info.environment).toBe('development')
    expect(info.danger).toBe(false)
    expect(info.databaseName).toBe('sveta_cecilija_dev')
  })

  it('parseDatabaseName tolerates a missing or garbage URL', () => {
    expect(parseDatabaseName(undefined)).toBeNull()
    expect(parseDatabaseName('not a url')).toBeNull()
    expect(parseDatabaseName('postgresql://h/db?sslmode=require')).toBe('db')
  })
})

describe('getDataIntegrity', () => {
  it('runs an anomaly query and a counts query, coercing bigint strings', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          orders_without_tickets: '2',
          tickets_without_order: '0',
          past_active_shows: '3',
          incomplete_refunds: '1',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ orders: '10', tickets: '40', shows: '22', critical_events: '5' }],
      })

    const res = await getDataIntegrity(query)
    expect(query).toHaveBeenCalledTimes(2)
    // anomaly query references all four checks
    const anomalySql = query.mock.calls[0][0]
    expect(anomalySql).toMatch(/orders_without_tickets/)
    expect(anomalySql).toMatch(/past_active_shows/)
    expect(anomalySql).toMatch(/refund_status = 'refunded'/)
    expect(res.anomalies).toEqual({
      ordersWithoutTickets: 2,
      ticketsWithoutOrder: 0,
      pastActiveShows: 3,
      incompleteRefunds: 1,
    })
    expect(res.rowCounts.orders).toBe(10)
    expect(res.rowCounts.tickets).toBe(40)
    // a table absent from the mock row coerces to 0, not NaN
    expect(res.rowCounts.partners).toBe(0)
  })
})

describe('getIntegrationHealth', () => {
  it('maps the latest online order and review email timestamps to ISO', async () => {
    const order = new Date('2026-06-04T09:00:00Z')
    const query = vi.fn().mockResolvedValue({
      rows: [{ last_online_order_at: order, last_review_email_at: null }],
    })
    const res = await getIntegrationHealth(query)
    expect(res.lastOnlineOrderAt).toBe('2026-06-04T09:00:00.000Z')
    expect(res.lastReviewEmailAt).toBeNull()
    expect(query.mock.calls[0][0]).toMatch(/channel = 'online'/)
  })
})

describe('stripe balance', () => {
  it('summarizes only EUR amounts into major units', () => {
    const summary = summarizeStripeBalance(
      {
        available: [{ amount: 12345, currency: 'eur' }, { amount: 999, currency: 'usd' }],
        pending: [{ amount: 500, currency: 'eur' }],
      },
      '2026-06-04T10:00:00.000Z',
    )
    expect(summary.availableEur).toBe(123.45)
    expect(summary.pendingEur).toBe(5)
    expect(summary.fetchedAt).toBe('2026-06-04T10:00:00.000Z')
  })

  it('returns null per-bucket when there are no EUR funds', () => {
    const summary = summarizeStripeBalance({ available: [], pending: [] }, '2026-06-04T10:00:00.000Z')
    expect(summary.availableEur).toBeNull()
    expect(summary.pendingEur).toBeNull()
  })

  it('caches within the TTL and refetches after it', async () => {
    let t = 1_000
    const retrieve = vi.fn().mockResolvedValue({ available: [{ amount: 100, currency: 'eur' }], pending: [] })
    const get = createStripeBalanceCache({ retrieve, now: () => t, ttlMs: 60_000 })

    await get()
    await get()
    expect(retrieve).toHaveBeenCalledOnce() // cached within TTL

    t += 60_001
    await get()
    expect(retrieve).toHaveBeenCalledTimes(2) // refetched after TTL
  })

  it('serves the last good value on a retrieve error, else null', async () => {
    let t = 0
    const retrieve = vi.fn()
      .mockResolvedValueOnce({ available: [{ amount: 100, currency: 'eur' }], pending: [] })
      .mockRejectedValueOnce(new Error('stripe down'))
    const get = createStripeBalanceCache({ retrieve, now: () => t, ttlMs: 10 })

    const first = await get()
    expect(first?.availableEur).toBe(1)
    t += 100 // expire cache
    const second = await get() // retrieve throws → stale value served
    expect(second?.availableEur).toBe(1)
  })

  it('returns null when the first retrieve fails (no prior value)', async () => {
    const get = createStripeBalanceCache({ retrieve: vi.fn().mockRejectedValue(new Error('no key')) })
    expect(await get()).toBeNull()
  })
})

describe('gatherDevDiagnostics (superadmin gating)', () => {
  const deps = () => ({
    query: vi.fn().mockResolvedValue({ rows: [{}] }),
    stripeBalance: vi.fn().mockResolvedValue(null),
    env: { NODE_ENV: 'development', DATABASE_URL: 'postgresql://h/sveta_cecilija_dev' },
  })

  it.each([
    ['admin'],
    ['tehnika'],
    ['partner'],
    [undefined],
  ])('returns null and runs no queries for role=%s', async (role) => {
    const d = deps()
    const result = await gatherDevDiagnostics(role ? { role } : null, d)
    expect(result).toBeNull()
    expect(d.query).not.toHaveBeenCalled()
    expect(d.stripeBalance).not.toHaveBeenCalled()
  })

  it('bundles every section for a superadmin', async () => {
    const d = deps()
    const result = await gatherDevDiagnostics({ role: 'superadmin' }, d)
    expect(result).not.toBeNull()
    expect(result!.env.environment).toBe('development')
    expect(result!.integrity).toBeDefined()
    expect(result!.health).toBeDefined()
    expect(d.query).toHaveBeenCalled()
    expect(d.stripeBalance).toHaveBeenCalledOnce()
  })

  it('one failing probe degrades to a fallback, not a thrown dashboard', async () => {
    const d = deps()
    d.query.mockRejectedValue(new Error('db down'))
    const result = await gatherDevDiagnostics({ role: 'superadmin' }, d)
    expect(result).not.toBeNull()
    expect(result!.integrity.anomalies.ordersWithoutTickets).toBe(0)
    expect(result!.criticalEvents).toEqual([])
  })
})
