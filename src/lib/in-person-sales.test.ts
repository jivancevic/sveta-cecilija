import { describe, it, expect, vi } from 'vitest'
import { addInPersonSales, incrementInPersonSold, type AddInPersonSalesDeps } from './in-person-sales'

function makeDeps(
  newTotal: number | null = 5,
  overrides: Partial<AddInPersonSalesDeps> = {},
): AddInPersonSalesDeps {
  return {
    getShow: vi.fn().mockResolvedValue({ id: 'show_1', isPublic: true }),
    atomicIncrement: vi.fn().mockResolvedValue(newTotal === null ? null : { inPersonSold: newTotal }),
    ...overrides,
  }
}

describe('addInPersonSales', () => {
  it('returns the new in-person total from the atomic increment', async () => {
    const deps = makeDeps(5)
    const result = await addInPersonSales({ showId: 'show_1', count: 3 }, deps)
    expect(result.inPersonSold).toBe(5)
    expect(deps.atomicIncrement).toHaveBeenCalledWith('show_1', 3)
  })

  it('rejects zero or negative counts before touching the DB', async () => {
    const deps = makeDeps()
    await expect(addInPersonSales({ showId: 'show_1', count: 0 }, deps)).rejects.toThrow(/positive/i)
    await expect(addInPersonSales({ showId: 'show_1', count: -3 }, deps)).rejects.toThrow(/positive/i)
    expect(deps.atomicIncrement).not.toHaveBeenCalled()
  })

  it('rejects non-integer counts before touching the DB', async () => {
    const deps = makeDeps()
    await expect(addInPersonSales({ showId: 'show_1', count: 1.5 }, deps)).rejects.toThrow(/integer/i)
    expect(deps.atomicIncrement).not.toHaveBeenCalled()
  })

  it('throws when the show does not exist', async () => {
    const deps = makeDeps(null)
    await expect(addInPersonSales({ showId: 'missing', count: 1 }, deps)).rejects.toThrow(/not found/i)
  })

  // #409 — a non-public performance sells no tickets at all, so a door count
  // against one is meaningless. The menu item is hidden; the action refuses too.
  it('refuses to add sales to a non-public performance', async () => {
    const deps = makeDeps(5, {
      getShow: vi.fn().mockResolvedValue({ id: 'show_1', isPublic: false }),
    })
    await expect(addInPersonSales({ showId: 'show_1', count: 3 }, deps)).rejects.toThrow(
      /not a public performance/i,
    )
    expect(deps.atomicIncrement).not.toHaveBeenCalled()
  })

  it('throws when the show lookup finds no row', async () => {
    const deps = makeDeps(5, { getShow: vi.fn().mockResolvedValue(null) })
    await expect(addInPersonSales({ showId: 'missing', count: 1 }, deps)).rejects.toThrow(
      /not found/i,
    )
    expect(deps.atomicIncrement).not.toHaveBeenCalled()
  })

  it('adds to a row carrying no isPublic value (pre-phase-2 rows are public)', async () => {
    const deps = makeDeps(5, { getShow: vi.fn().mockResolvedValue({ id: 'show_1' }) })
    await expect(addInPersonSales({ showId: 'show_1', count: 3 }, deps)).resolves.toEqual({
      inPersonSold: 5,
    })
  })
})

describe('incrementInPersonSold', () => {
  it('issues a single atomic UPDATE (col = col + $1) with [delta, showId] and returns the new total', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ in_person_sold: 17 }] })
    const result = await incrementInPersonSold(query, '42', 5)

    expect(result).toEqual({ inPersonSold: 17 })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0]
    // Atomic increment — never read-modify-write (atomic-columns hard rule).
    expect(sql).toMatch(/in_person_sold\s*=\s*COALESCE\(in_person_sold,\s*0\)\s*\+\s*\$1/i)
    expect(sql).toMatch(/RETURNING in_person_sold/i)
    expect(params).toEqual([5, 42]) // showId coerced to a number for the pk match
  })

  it('returns null when the show id matches no row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await incrementInPersonSold(query, '999', 3)).toBeNull()
  })
})
