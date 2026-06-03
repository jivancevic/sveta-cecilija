import { describe, it, expect, vi } from 'vitest'
import { isEmailOptedOut } from './opt-out'

describe('isEmailOptedOut', () => {
  it('returns true when a matching row exists', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
    expect(await isEmailOptedOut(query, 'ana@example.com')).toBe(true)
    expect(query.mock.calls[0][0]).toMatch(/marketing_optouts/)
    expect(query.mock.calls[0][1]).toEqual(['ana@example.com'])
  })

  it('returns false when no row matches', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    expect(await isEmailOptedOut(query, 'ana@example.com')).toBe(false)
  })

  it('normalizes case and surrounding whitespace before matching', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await isEmailOptedOut(query, '  Ana@Example.COM  ')
    expect(query.mock.calls[0][1]).toEqual(['ana@example.com'])
  })

  it('treats a blank email as not opted out without querying', async () => {
    const query = vi.fn()
    expect(await isEmailOptedOut(query, '   ')).toBe(false)
    expect(query).not.toHaveBeenCalled()
  })

  it('propagates a store error rather than reporting "not opted out"', async () => {
    const query = vi.fn().mockRejectedValue(new Error('db down'))
    await expect(isEmailOptedOut(query, 'ana@example.com')).rejects.toThrow(/db down/)
  })
})
