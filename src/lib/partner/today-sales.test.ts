import { describe, it, expect, vi } from 'vitest'
import { getPartnerTodaySales } from './today-sales'

function rows(rs: Record<string, unknown>[]) {
  return { rows: rs }
}

describe('getPartnerTodaySales', () => {
  it('groups ticket rows into orders and derives CODE-N refs in issuance order', async () => {
    const query = vi.fn().mockResolvedValue(
      rows([
        { order_id: 5, code: 'ABCD', sold_at: '14:30', show_date: '2026-07-12', show_time: '21:00', show_venue: 'ljetno-kino', ticket_id: 10, ticket_type: 'adult', ticket_status: 'active' },
        { order_id: 5, code: 'ABCD', sold_at: '14:30', show_date: '2026-07-12', show_time: '21:00', show_venue: 'ljetno-kino', ticket_id: 11, ticket_type: 'adult', ticket_status: 'active' },
        { order_id: 5, code: 'ABCD', sold_at: '14:30', show_date: '2026-07-12', show_time: '21:00', show_venue: 'ljetno-kino', ticket_id: 12, ticket_type: 'child', ticket_status: 'cancelled' },
      ]),
    )
    const sales = await getPartnerTodaySales(7, { query })
    expect(sales).toHaveLength(1)
    expect(sales[0].orderId).toBe('5')
    expect(sales[0].code).toBe('ABCD')
    expect(sales[0].soldAt).toBe('14:30')
    expect(sales[0].tickets.map((t) => t.ref)).toEqual(['ABCD-1', 'ABCD-2', 'ABCD-3'])
    expect(sales[0].tickets[2].status).toBe('cancelled')
    expect(sales[0].showLabel).toContain('Ljetno kino')
    // Scoped to the partner id.
    expect(query.mock.calls[0][1]).toEqual([7])
  })

  it('returns multiple orders, newest first as returned by the query', async () => {
    const query = vi.fn().mockResolvedValue(
      rows([
        { order_id: 9, code: 'WXYZ', sold_at: '16:00', show_date: '2026-07-12', show_time: '21:00', show_venue: 'zimsko-kino', ticket_id: 20, ticket_type: 'adult', ticket_status: 'active' },
        { order_id: 5, code: 'ABCD', sold_at: '14:30', show_date: '2026-07-12', show_time: '21:00', show_venue: 'ljetno-kino', ticket_id: 10, ticket_type: 'adult', ticket_status: 'active' },
      ]),
    )
    const sales = await getPartnerTodaySales(7, { query })
    expect(sales.map((s) => s.orderId)).toEqual(['9', '5'])
  })

  it('handles an order with no tickets (LEFT JOIN null row) as an empty ticket list', async () => {
    const query = vi.fn().mockResolvedValue(
      rows([
        { order_id: 5, code: 'ABCD', sold_at: '14:30', show_date: '2026-07-12', show_time: '21:00', show_venue: 'ljetno-kino', ticket_id: null, ticket_type: null, ticket_status: null },
      ]),
    )
    const sales = await getPartnerTodaySales(7, { query })
    expect(sales).toHaveLength(1)
    expect(sales[0].tickets).toEqual([])
  })

  it('returns [] for a non-numeric partner id without querying', async () => {
    const query = vi.fn()
    const sales = await getPartnerTodaySales('not-a-number', { query })
    expect(sales).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })
})
