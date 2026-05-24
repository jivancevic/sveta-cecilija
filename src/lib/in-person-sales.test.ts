import { describe, it, expect, vi } from 'vitest'
import { addInPersonSales, type AddInPersonSalesDeps } from './in-person-sales'

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
