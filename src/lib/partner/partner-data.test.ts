import { describe, it, expect, vi } from 'vitest'
import { getStatistikaShows } from './partner-data'

// The partner Statistika bars list every season performance the partner COULD
// have sold, so they must exclude non-public performances (#407, ADR-0024).
describe('getStatistikaShows', () => {
  function query(rows: Array<Record<string, unknown>>) {
    return vi.fn(async () => ({ rows }))
  }

  it('filters to active PUBLIC performances in the SQL', async () => {
    const q = query([])
    await getStatistikaShows(q)
    const [sql] = q.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/is_public\s*=\s*true/)
    expect(sql).toMatch(/status\s*=\s*'active'/)
  })

  it('normalises the pg Date (or string) show date to an ISO calendar day', async () => {
    const q = query([
      { id: 7, date: new Date('2026-07-12T12:00:00.000Z') },
      { id: 8, date: '2026-07-13' },
    ])
    expect(await getStatistikaShows(q)).toEqual([
      { showId: '7', showDate: '2026-07-12' },
      { showId: '8', showDate: '2026-07-13' },
    ])
  })
})
