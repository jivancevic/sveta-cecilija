import { describe, expect, it } from 'vitest'
import { getCompTicketsInSeason, getFirstCompSeason, getRecentComps } from './comp-report'

/** A pool that records what it was asked and answers from a script. */
function fakeQuery(answers: Record<string, unknown>[][]) {
  const calls: { sql: string; params: unknown[] }[] = []
  let i = 0
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] })
    return { rows: answers[i++] ?? [] }
  }
  return { query, calls }
}

describe('getCompTicketsInSeason', () => {
  it('asks for one calendar year of comps and flattens them to one row per ticket', async () => {
    const { query, calls } = fakeQuery([
      [
        { member_id: 4, member_name: 'Ante Marić', type: 'adult', status: 'active' },
        { member_id: 4, member_name: 'Ante Marić', type: 'child', status: 'cancelled' },
      ],
    ])

    const rows = await getCompTicketsInSeason(query, 2026)

    expect(rows).toEqual([
      { memberId: '4', memberName: 'Ante Marić', type: 'adult', cancelled: false },
      { memberId: '4', memberName: 'Ante Marić', type: 'child', cancelled: true },
    ])
    // The season is the performance's calendar year (ADR-0022's definition),
    // bounded in SQL rather than filtered in memory.
    expect(calls[0].params).toEqual(['2026-01-01', '2027-01-01'])
    expect(calls[0].sql).toContain("o.channel = 'comp'")
  })

  it('treats anything that is not an active ticket as voided', async () => {
    const { query } = fakeQuery([
      [{ member_id: 1, member_name: 'X', type: 'adult', status: 'cancelled' }],
    ])
    expect((await getCompTicketsInSeason(query, 2026))[0].cancelled).toBe(true)
  })

  it('drops a comp with no member rather than inventing an attribution', async () => {
    const { query } = fakeQuery([
      [{ member_id: null, member_name: null, type: 'adult', status: 'active' }],
    ])
    expect(await getCompTicketsInSeason(query, 2026)).toEqual([])
  })
})

describe('getRecentComps', () => {
  it('reads the newest comp orders and hangs their tickets off them in order', async () => {
    const { query, calls } = fakeQuery([
      [
        {
          id: 12,
          code: 'ABC123',
          created_at: '2026-09-01T10:00:00.000Z',
          buyer_name: 'Ante Marić',
          email: null,
          member_id: 4,
          member_name: 'Ante Marić',
          show_id: 7,
          show_date: '2026-09-10T12:00:00.000Z',
          show_time: '21:30',
          venue: 'ljetno-kino',
        },
      ],
      [
        { order_id: 12, id: 101, type: 'adult', status: 'active', scanned: false },
        { order_id: 12, id: 102, type: 'child', status: 'cancelled', scanned: false },
      ],
    ])

    const [order] = await getRecentComps(query, 5)

    expect(order).toMatchObject({
      orderId: '12',
      code: 'ABC123',
      memberName: 'Ante Marić',
      showDate: '2026-09-10',
      showTime: '21:30',
      venue: 'ljetno-kino',
      activeCount: 1,
    })
    // The slip reference is issuance order, the way the PDF numbers them.
    expect(order.tickets).toEqual([
      { id: '101', ref: 'ABC123-1', type: 'adult', cancelled: false, scanned: false },
      { id: '102', ref: 'ABC123-2', type: 'child', cancelled: true, scanned: false },
    ])
    expect(calls[0].params).toEqual([5])
  })

  it('asks for no tickets at all when there is no comp to show them for', async () => {
    const { query, calls } = fakeQuery([[]])
    expect(await getRecentComps(query, 5)).toEqual([])
    expect(calls).toHaveLength(1)
  })
})

describe('getFirstCompSeason', () => {
  it('is the calendar year of the earliest evening a comp was issued for', async () => {
    const { query } = fakeQuery([[{ first: '2025-07-04T12:00:00.000Z' }]])
    expect(await getFirstCompSeason(query)).toBe(2025)
  })

  it('is null before the first comp exists', async () => {
    const { query } = fakeQuery([[{ first: null }]])
    expect(await getFirstCompSeason(query)).toBeNull()
  })
})
