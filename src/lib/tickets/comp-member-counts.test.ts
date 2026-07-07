import { describe, it, expect, vi } from 'vitest'
import { getCompCountsByMember } from './sold-seats'

describe('getCompCountsByMember', () => {
  it('maps grouped rows to per-member comp counts, coercing the numeric columns', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { member_id: 1, member_name: 'Ana Horvat', adult_tickets: 6, child_tickets: 2, total_tickets: 8 },
        { member_id: 2, member_name: 'Marko Marić', adult_tickets: '3', child_tickets: '1', total_tickets: '4' },
      ],
    })
    expect(await getCompCountsByMember(query)).toEqual([
      { memberId: '1', memberName: 'Ana Horvat', adultTickets: 6, childTickets: 2, totalTickets: 8 },
      { memberId: '2', memberName: 'Marko Marić', adultTickets: 3, childTickets: 1, totalTickets: 4 },
    ])
  })

  it('sorts by total comps desc, then member name asc as the tie-break', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { member_id: 1, member_name: 'Bruno', adult_tickets: 5, child_tickets: 0, total_tickets: 5 },
        { member_id: 2, member_name: 'Ana', adult_tickets: 5, child_tickets: 0, total_tickets: 5 },
        { member_id: 3, member_name: 'Toni', adult_tickets: 20, child_tickets: 0, total_tickets: 20 },
      ],
    })
    const result = await getCompCountsByMember(query)
    expect(result.map((r) => r.memberName)).toEqual(['Toni', 'Ana', 'Bruno'])
  })

  it('keeps a member whose comps were all cancelled (counts default to 0)', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ member_id: 7, member_name: 'Ivo', adult_tickets: 0, child_tickets: 0, total_tickets: 0 }],
    })
    expect(await getCompCountsByMember(query)).toEqual([
      { memberId: '7', memberName: 'Ivo', adultTickets: 0, childTickets: 0, totalTickets: 0 },
    ])
  })

  it('treats a since-deleted member name as an empty string, never null', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ member_id: 9, member_name: null, adult_tickets: 1, child_tickets: 0, total_tickets: 1 }],
    })
    const [row] = await getCompCountsByMember(query)
    expect(row.memberName).toBe('')
  })

  it('returns an empty list when no comps have been issued', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await getCompCountsByMember(query)).toEqual([])
  })
})
