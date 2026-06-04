import { describe, it, expect, vi } from 'vitest'
import { getPartnerRecentSalesPage } from './recent-sales-page'

function rows(rs: Record<string, unknown>[]) {
  return { rows: rs }
}

// A fake PoolQuery that routes by SQL text: the orders query selects FROM orders,
// the tickets-for-today query selects FROM tickets. Each returns its canned rows.
function fakeQuery(orderRows: Record<string, unknown>[], ticketRows: Record<string, unknown>[]) {
  return vi.fn(async (sql: string, _params?: unknown[]) => {
    if (/FROM\s+tickets/i.test(sql)) return rows(ticketRows)
    return rows(orderRows)
  })
}

function orderRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    order_id: 5,
    code: 'ABCD',
    created_at: '2026-06-04T12:30:00.000Z',
    sold_at: '14:30',
    show_date: '2026-07-12',
    show_time: '21:00',
    show_venue: 'ljetno-kino',
    adult_count: 2,
    child_count: 1,
    total: 5000,
    is_today: true,
    ...over,
  }
}

describe('getPartnerRecentSalesPage', () => {
  it('short-circuits for a non-finite partner id without querying', async () => {
    const query = vi.fn()
    const res = await getPartnerRecentSalesPage(query, Number('nope'), { page: 1, pageSize: 5 })
    expect(res).toEqual({ sales: [], hasMore: false })
    expect(query).not.toHaveBeenCalled()
  })

  it('preserves newest-first ordering and scopes by partner id', async () => {
    const query = fakeQuery(
      [
        orderRow({ order_id: 9, code: 'WXYZ', is_today: false }),
        orderRow({ order_id: 5, code: 'ABCD', is_today: false }),
      ],
      [],
    )
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 5 })
    expect(res.sales.map((s) => s.orderId)).toEqual(['9', '5'])
    // First positional param of the orders query is the partner id.
    expect((query.mock.calls[0][1] as unknown[])[0]).toBe(7)
  })

  it('trims pageSize+1 to compute hasMore', async () => {
    // pageSize 2, query returns 3 (pageSize+1) → hasMore true, 2 returned.
    const query = fakeQuery(
      [
        orderRow({ order_id: 3, is_today: false }),
        orderRow({ order_id: 2, is_today: false }),
        orderRow({ order_id: 1, is_today: false }),
      ],
      [],
    )
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 2 })
    expect(res.hasMore).toBe(true)
    expect(res.sales.map((s) => s.orderId)).toEqual(['3', '2'])
  })

  it('reports hasMore false when fewer than pageSize+1 rows returned', async () => {
    const query = fakeQuery([orderRow({ order_id: 1, is_today: false })], [])
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 5 })
    expect(res.hasMore).toBe(false)
    expect(res.sales).toHaveLength(1)
  })

  it('uses LIMIT pageSize+1 and OFFSET (page-1)*pageSize', async () => {
    const query = fakeQuery([orderRow({ is_today: false })], [])
    await getPartnerRecentSalesPage(query, 7, { page: 3, pageSize: 5 })
    const params = query.mock.calls[0][1] as unknown[]
    // [partnerId, limit, offset]
    expect(params).toEqual([7, 6, 10])
  })

  it('populates tickets with CODE-N refs in issuance order for isToday rows', async () => {
    const query = fakeQuery(
      [orderRow({ order_id: 5, code: 'ABCD', is_today: true })],
      [
        { order_id: 5, ticket_id: 10, type: 'adult', status: 'active' },
        { order_id: 5, ticket_id: 11, type: 'adult', status: 'active' },
        { order_id: 5, ticket_id: 12, type: 'child', status: 'cancelled' },
      ],
    )
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 5 })
    expect(res.sales[0].isToday).toBe(true)
    expect(res.sales[0].tickets.map((t) => t.ref)).toEqual(['ABCD-1', 'ABCD-2', 'ABCD-3'])
    expect(res.sales[0].tickets[2].status).toBe('cancelled')
    expect(res.sales[0].tickets[2].type).toBe('child')
    expect(res.sales[0].adultCount).toBe(2)
    expect(res.sales[0].childCount).toBe(1)
    expect(res.sales[0].totalCents).toBe(5000)
    expect(res.sales[0].showLabel).toContain('Ljetno kino')
  })

  it('numbers refs per order independently when multiple today orders exist', async () => {
    const query = fakeQuery(
      [
        orderRow({ order_id: 9, code: 'WXYZ', is_today: true }),
        orderRow({ order_id: 5, code: 'ABCD', is_today: true }),
      ],
      [
        { order_id: 5, ticket_id: 10, type: 'adult', status: 'active' },
        { order_id: 5, ticket_id: 11, type: 'child', status: 'active' },
        { order_id: 9, ticket_id: 20, type: 'adult', status: 'active' },
      ],
    )
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 5 })
    const byId = new Map(res.sales.map((s) => [s.orderId, s]))
    expect(byId.get('5')!.tickets.map((t) => t.ref)).toEqual(['ABCD-1', 'ABCD-2'])
    expect(byId.get('9')!.tickets.map((t) => t.ref)).toEqual(['WXYZ-1'])
  })

  it('gives non-today rows an empty ticket list and does not query tickets', async () => {
    const query = fakeQuery(
      [orderRow({ order_id: 5, code: 'ABCD', is_today: false })],
      [{ order_id: 5, ticket_id: 10, type: 'adult', status: 'active' }],
    )
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 5 })
    expect(res.sales[0].isToday).toBe(false)
    expect(res.sales[0].tickets).toEqual([])
    // Only the orders query ran (no today rows → no tickets query).
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('queries tickets only for the today rows on the page', async () => {
    const query = fakeQuery(
      [
        orderRow({ order_id: 9, code: 'WXYZ', is_today: true }),
        orderRow({ order_id: 5, code: 'ABCD', is_today: false }),
      ],
      [{ order_id: 9, ticket_id: 20, type: 'adult', status: 'active' }],
    )
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 5 })
    const byId = new Map(res.sales.map((s) => [s.orderId, s]))
    expect(byId.get('9')!.tickets.map((t) => t.ref)).toEqual(['WXYZ-1'])
    expect(byId.get('5')!.tickets).toEqual([])
    // Second call is the tickets query, scoped to only the today order ids.
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1][1]).toEqual([[9]])
  })

  it('exposes createdAt as an ISO string', async () => {
    const query = fakeQuery(
      [orderRow({ created_at: '2026-06-04T12:30:00.000Z', is_today: false })],
      [],
    )
    const res = await getPartnerRecentSalesPage(query, 7, { page: 1, pageSize: 5 })
    expect(res.sales[0].createdAt).toBe('2026-06-04T12:30:00.000Z')
  })
})
