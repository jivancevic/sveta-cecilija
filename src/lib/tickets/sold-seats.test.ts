import { describe, it, expect, vi } from 'vitest'
import {
  getActiveTicketCountsByShow,
  getActiveTicketCountForShow,
  getScannedTicketCountsByShow,
  getScannedTicketCountForShow,
} from './sold-seats'

describe('getActiveTicketCountsByShow', () => {
  it('maps each show id to its active ticket count', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { show_id: 1, sold: 4 },
        { show_id: 2, sold: 11 },
      ],
    })
    const map = await getActiveTicketCountsByShow(query)
    expect(map.get('1')).toBe(4)
    expect(map.get('2')).toBe(11)
    expect(map.get('3')).toBeUndefined()
    // Only active tickets are counted.
    expect(query.mock.calls[0][0]).toMatch(/status = 'active'/)
  })

  it('returns an empty map when no shows have tickets', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect((await getActiveTicketCountsByShow(query)).size).toBe(0)
  })
})

describe('getActiveTicketCountForShow', () => {
  it('returns the count for a single show', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ sold: 7 }] })
    expect(await getActiveTicketCountForShow(query, 5)).toBe(7)
    expect(query.mock.calls[0][1]).toEqual([5])
  })

  it('returns 0 for a non-numeric id without querying', async () => {
    const query = vi.fn()
    expect(await getActiveTicketCountForShow(query, 'abc')).toBe(0)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 0 when the show has no active tickets', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ sold: 0 }] })
    expect(await getActiveTicketCountForShow(query, 9)).toBe(0)
  })
})

describe('getScannedTicketCountsByShow', () => {
  it('maps each show id to its scanned-people count', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { show_id: 1, scanned: 2 },
        { show_id: 2, scanned: 9 },
      ],
    })
    const map = await getScannedTicketCountsByShow(query)
    expect(map.get('1')).toBe(2)
    expect(map.get('2')).toBe(9)
    expect(map.get('3')).toBeUndefined()
    // Only scanned, active tickets count.
    expect(query.mock.calls[0][0]).toMatch(/scanned = true/)
    expect(query.mock.calls[0][0]).toMatch(/status = 'active'/)
  })

  it('returns an empty map when no shows have scanned tickets', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect((await getScannedTicketCountsByShow(query)).size).toBe(0)
  })
})

describe('getScannedTicketCountForShow', () => {
  it('returns the scanned count for a single show', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ scanned: 6 }] })
    expect(await getScannedTicketCountForShow(query, 5)).toBe(6)
    expect(query.mock.calls[0][1]).toEqual([5])
    expect(query.mock.calls[0][0]).toMatch(/scanned = true/)
  })

  it('returns 0 for a non-numeric id without querying', async () => {
    const query = vi.fn()
    expect(await getScannedTicketCountForShow(query, 'abc')).toBe(0)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 0 when the show has no scanned tickets', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ scanned: 0 }] })
    expect(await getScannedTicketCountForShow(query, 9)).toBe(0)
  })
})
