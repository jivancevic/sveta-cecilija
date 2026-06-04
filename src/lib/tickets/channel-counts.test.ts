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
    expect(await getActiveTicketCountsByChannel(query)).toEqual({ online: 120, partner: 20 })
  })

  it('folds null/unknown channels into online (the select default)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { channel: null, sold: 5 },
        { channel: 'online', sold: 10 },
        { channel: 'partner', sold: 3 },
      ],
    })
    expect(await getActiveTicketCountsByChannel(query)).toEqual({ online: 15, partner: 3 })
  })

  it('is all-zero when there are no active tickets', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await getActiveTicketCountsByChannel(query)).toEqual({ online: 0, partner: 0 })
  })
})
