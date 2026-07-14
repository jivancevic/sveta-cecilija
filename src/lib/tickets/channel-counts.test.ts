import { describe, it, expect, vi } from 'vitest'
import { getActiveTicketCountsByChannel } from './sold-seats'

describe('getActiveTicketCountsByChannel', () => {
  it('splits active tickets into online and partner', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { channel: 'online', sold: 120 },
        { channel: 'partner', sold: 20 },
      ],
    })
    expect(await getActiveTicketCountsByChannel(query)).toEqual({ online: 120, partner: 20, comp: 0 })
  })

  it('folds null/unknown channels into online (the select default)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { channel: null, sold: 5 },
        { channel: 'online', sold: 10 },
        { channel: 'partner', sold: 3 },
      ],
    })
    expect(await getActiveTicketCountsByChannel(query)).toEqual({ online: 15, partner: 3, comp: 0 })
  })

  it('keeps comp tickets in their own count, NOT folded into online (ADR-0019, #322)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { channel: 'online', sold: 100 },
        { channel: 'partner', sold: 20 },
        { channel: 'comp', sold: 7 },
      ],
    })
    // comp is reported separately so seat math reconciles, but it must NOT be
    // summed into online (a sales channel) or any money total.
    expect(await getActiveTicketCountsByChannel(query)).toEqual({ online: 100, partner: 20, comp: 7 })
  })

  it('is all-zero when there are no active tickets', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await getActiveTicketCountsByChannel(query)).toEqual({ online: 0, partner: 0, comp: 0 })
  })
})
