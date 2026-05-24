import { describe, it, expect, vi } from 'vitest'
import { addInPersonSales, type AddInPersonSalesDeps } from './in-person-sales'

function makeDeps(
  showOverrides: Partial<{ id: string; onlineSold: number; inPersonSold: number }> = {},
  overrides: Partial<AddInPersonSalesDeps> = {},
): AddInPersonSalesDeps {
  const show = { id: 'show_1', onlineSold: 5, inPersonSold: 2, ...showOverrides }
  return {
    findShow: vi.fn().mockResolvedValue(show),
    updateShow: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('addInPersonSales', () => {
  it('increments inPersonSold by the entered count', async () => {
    const deps = makeDeps({ inPersonSold: 2 })
    const result = await addInPersonSales({ showId: 'show_1', count: 3 }, deps)
    expect(result.inPersonSold).toBe(5)
    expect(deps.updateShow).toHaveBeenCalledWith('show_1', { inPersonSold: 5 })
  })

  it('does not touch onlineSold in the update payload', async () => {
    const deps = makeDeps({ onlineSold: 50, inPersonSold: 10 })
    await addInPersonSales({ showId: 'show_1', count: 2 }, deps)
    const [, data] = (deps.updateShow as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(data).not.toHaveProperty('onlineSold')
  })

  it('rejects zero or negative counts', async () => {
    const deps = makeDeps()
    await expect(addInPersonSales({ showId: 'show_1', count: 0 }, deps)).rejects.toThrow(/positive/i)
    await expect(addInPersonSales({ showId: 'show_1', count: -3 }, deps)).rejects.toThrow(/positive/i)
    expect(deps.updateShow).not.toHaveBeenCalled()
  })

  it('rejects non-integer counts', async () => {
    const deps = makeDeps()
    await expect(addInPersonSales({ showId: 'show_1', count: 1.5 }, deps)).rejects.toThrow(/integer/i)
  })

  it('throws when show does not exist', async () => {
    const deps = makeDeps()
    ;(deps.findShow as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(addInPersonSales({ showId: 'missing', count: 1 }, deps)).rejects.toThrow(/not found/i)
  })
})
