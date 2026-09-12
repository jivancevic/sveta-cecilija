import { describe, it, expect, vi } from 'vitest'
import { getSeasonTicketRowsByShow } from './season-data'

describe('getSeasonTicketRowsByShow', () => {
  it('maps each show to its adult/child and channel split', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { show_id: 1, adult: 80, child: 20, online: 90, partner: 5, comp: 5 },
        { show_id: 2, adult: 10, child: 0, online: 10, partner: 0, comp: 0 },
      ],
    })

    const rows = await getSeasonTicketRowsByShow(query)

    expect(rows).toEqual([
      { showId: '1', adult: 80, child: 20, online: 90, partner: 5, comp: 5 },
      { showId: '2', adult: 10, child: 0, online: 10, partner: 0, comp: 0 },
    ])
  })

  it('counts only active tickets, so cancelled and refunded self-heal', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await getSeasonTicketRowsByShow(query)
    expect(query.mock.calls[0][0]).toMatch(/t\.status = 'active'/)
  })

  it('folds any other/null channel into online, matching the seat model', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await getSeasonTicketRowsByShow(query)
    const sql = query.mock.calls[0][0]
    // online is the complement of partner+comp, so a legacy NULL channel counts
    // as online rather than vanishing from the mix.
    expect(sql).toMatch(/IS DISTINCT FROM 'partner'/)
    expect(sql).toMatch(/IS DISTINCT FROM 'comp'/)
  })

  it('coerces missing or non-numeric counts to 0', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ show_id: 7 }] })
    const rows = await getSeasonTicketRowsByShow(query)
    expect(rows).toEqual([
      { showId: '7', adult: 0, child: 0, online: 0, partner: 0, comp: 0 },
    ])
  })

  it('returns an empty list when no tickets exist', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await getSeasonTicketRowsByShow(query)).toEqual([])
  })
})
