import { describe, expect, it, vi } from 'vitest'
import { loadStatsSeason } from './stats-screen-loaders'
import type { StatsRepo } from '@/lib/repo/stats'

// The season resolution and the one access rule that lives in the loader
// rather than in the pure builder: a reader without `tickets` never has the
// comp report FETCHED, so no member's name reaches the server's payload at all.

function repo(overrides: Partial<StatsRepo> = {}): StatsRepo {
  return {
    publicPerformances: vi.fn(async () => []),
    ticketsByShow: vi.fn(async () => new Map()),
    offlineByShow: vi.fn(async () => new Map()),
    scannedByShow: vi.fn(async () => new Map()),
    compsByMemberForSeason: vi.fn(async () => []),
    firstSeason: vi.fn(async () => 2024),
    ...overrides,
  }
}

const now = () => new Date('2026-08-01T10:00:00.000Z')
const access = { canOpenPerformances: true, canSeeComps: true }

describe('the season a request opens on', () => {
  it('offers every year from the first performance to this one, newest first', async () => {
    const screen = await loadStatsSeason(repo(), undefined, { now, ...access })
    expect(screen.seasons).toEqual([2026, 2025, 2024])
    expect(screen.season).toBe(2026)
  })

  it('opens on the requested year when it is one of them', async () => {
    const r = repo()
    const screen = await loadStatsSeason(r, '2025', { now, ...access })
    expect(screen.season).toBe(2025)
    expect(r.publicPerformances).toHaveBeenCalledWith(2025)
  })

  it('falls back to this season for a mistyped or unknown year', async () => {
    for (const bad of ['sezona', '20xx', '1999', '', undefined]) {
      const screen = await loadStatsSeason(repo(), bad, { now, ...access })
      expect(screen.season, `?season=${String(bad)}`).toBe(2026)
    }
  })
})

describe('the comp report', () => {
  it('is read for a tickets holder', async () => {
    const r = repo()
    await loadStatsSeason(r, undefined, { now, ...access })
    expect(r.compsByMemberForSeason).toHaveBeenCalledWith(2026)
  })

  it('is never even queried for a reader who may not see it', async () => {
    const r = repo()
    const screen = await loadStatsSeason(r, undefined, {
      now,
      canOpenPerformances: false,
      canSeeComps: false,
    })
    expect(r.compsByMemberForSeason).not.toHaveBeenCalled()
    expect(screen.comps).toBeNull()
  })
})
