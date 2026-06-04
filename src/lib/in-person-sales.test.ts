import { describe, it, expect, vi } from 'vitest'
import { addInPersonSales, incrementInPersonSold, type AddInPersonSalesDeps } from './in-person-sales'

function makeDeps(
  newTotal: number | null = 5,
  overrides: Partial<AddInPersonSalesDeps> = {},
): AddInPersonSalesDeps {
  return {
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
