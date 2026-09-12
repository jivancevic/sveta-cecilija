import { describe, it, expect, vi } from 'vitest'
import {
  getActiveTicketCountsByChannel,
  getActiveTicketCountsByShowAndChannel,
} from './sold-seats'

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

describe('getActiveTicketCountsByShowAndChannel', () => {
  it('keeps one show channel split apart from the next', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { show_id: 1, channel: 'online', sold: 60 },
        { show_id: 1, channel: 'partner', sold: 12 },
        { show_id: 2, channel: 'online', sold: 5 },
      ],
    })
    const byShow = await getActiveTicketCountsByShowAndChannel(query)
    expect(byShow.get('1')).toEqual({ online: 60, partner: 12, comp: 0 })
    expect(byShow.get('2')).toEqual({ online: 5, partner: 0, comp: 0 })
  })

  it('folds null/unknown channels into online, per show', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { show_id: 3, channel: null, sold: 5 },
        { show_id: 3, channel: 'online', sold: 10 },
      ],
    })
    expect((await getActiveTicketCountsByShowAndChannel(query)).get('3')).toEqual({
      online: 15,
      partner: 0,
      comp: 0,
    })
  })

  it('keeps comp tickets in their own per-show count (ADR-0019)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { show_id: 4, channel: 'online', sold: 30 },
        { show_id: 4, channel: 'comp', sold: 4 },
      ],
    })
    expect((await getActiveTicketCountsByShowAndChannel(query)).get('4')).toEqual({
      online: 30,
      partner: 0,
      comp: 4,
    })
  })

  it('omits shows with no ticket rows so callers default to zero', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const byShow = await getActiveTicketCountsByShowAndChannel(query)
    expect(byShow.size).toBe(0)
    expect(byShow.get('99')).toBeUndefined()
  })
})
