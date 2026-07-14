import { describe, it, expect, vi } from 'vitest'
import { getActiveTicketCountsByPromoCode } from './sold-seats'

describe('getActiveTicketCountsByPromoCode', () => {
  it('maps grouped rows to per-code sales, coercing the numeric columns', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { promo_code_id: 1, code: 'ANA10', member_name: 'Ana Horvat', tickets_sold: 12, revenue_cents: 18000 },
        { promo_code_id: 2, code: 'MARKO', member_name: 'Marko Marić', tickets_sold: 3, revenue_cents: '4500' },
      ],
    })
    expect(await getActiveTicketCountsByPromoCode(query)).toEqual([
      { promoCodeId: '1', code: 'ANA10', memberName: 'Ana Horvat', ticketsSold: 12, revenueCents: 18000 },
      { promoCodeId: '2', code: 'MARKO', memberName: 'Marko Marić', ticketsSold: 3, revenueCents: 4500 },
    ])
  })

  it('sorts by tickets sold desc, then code asc as the tie-break', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { promo_code_id: 1, code: 'BETA', member_name: 'B', tickets_sold: 5, revenue_cents: 0 },
        { promo_code_id: 2, code: 'ALFA', member_name: 'A', tickets_sold: 5, revenue_cents: 0 },
        { promo_code_id: 3, code: 'TOP', member_name: 'T', tickets_sold: 20, revenue_cents: 0 },
      ],
    })
    const result = await getActiveTicketCountsByPromoCode(query)
    expect(result.map((r) => r.code)).toEqual(['TOP', 'ALFA', 'BETA'])
  })

  it('keeps codes that have sold nothing yet (LEFT JOIN, count/revenue default to 0)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { promo_code_id: 7, code: 'UNUSED', member_name: 'Ivo', tickets_sold: 0, revenue_cents: 0 },
      ],
    })
    expect(await getActiveTicketCountsByPromoCode(query)).toEqual([
      { promoCodeId: '7', code: 'UNUSED', memberName: 'Ivo', ticketsSold: 0, revenueCents: 0 },
    ])
  })

  it('treats a missing member name as an empty string, never null', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ promo_code_id: 9, code: 'ORPHAN', member_name: null, tickets_sold: 1, revenue_cents: 2000 }],
    })
    const [row] = await getActiveTicketCountsByPromoCode(query)
    expect(row.memberName).toBe('')
  })

  it('returns an empty list when there are no promo codes', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await getActiveTicketCountsByPromoCode(query)).toEqual([])
  })
})
