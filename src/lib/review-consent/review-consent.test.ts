import { describe, it, expect, vi } from 'vitest'
import { resolveOptOut, ensureOptOutToken } from './review-consent'

describe('resolveOptOut', () => {
  it('marks the order opted out and returns OK when the token matches', async () => {
    const markOptedOut = vi.fn().mockResolvedValue(true)
    const result = await resolveOptOut('tok_abc', { markOptedOut })
    expect(result).toBe('OK')
    expect(markOptedOut).toHaveBeenCalledWith('tok_abc')
  })

  it('returns NOT_FOUND for an unknown token', async () => {
    const result = await resolveOptOut('tok_missing', { markOptedOut: vi.fn().mockResolvedValue(false) })
    expect(result).toBe('NOT_FOUND')
  })

  it('returns NOT_FOUND for a blank token without hitting the DB', async () => {
    const markOptedOut = vi.fn()
    expect(await resolveOptOut('', { markOptedOut })).toBe('NOT_FOUND')
    expect(await resolveOptOut('   ', { markOptedOut })).toBe('NOT_FOUND')
    expect(markOptedOut).not.toHaveBeenCalled()
  })

  it('is idempotent: a repeat click still returns OK (the atomic UPDATE re-matches)', async () => {
    // markOptedOut returns true whether or not the flag was already set.
    const markOptedOut = vi.fn().mockResolvedValue(true)
    expect(await resolveOptOut('tok_abc', { markOptedOut })).toBe('OK')
    expect(await resolveOptOut('tok_abc', { markOptedOut })).toBe('OK')
  })
})

describe('ensureOptOutToken', () => {
  it('returns the existing token without generating a new one', async () => {
    const deps = {
      getExistingToken: vi.fn().mockResolvedValue('tok_existing'),
      setTokenIfAbsent: vi.fn(),
      generateToken: vi.fn(),
    }
    expect(await ensureOptOutToken('order_1', deps)).toBe('tok_existing')
    expect(deps.setTokenIfAbsent).not.toHaveBeenCalled()
    expect(deps.generateToken).not.toHaveBeenCalled()
  })

  it('generates and persists a token when the order has none', async () => {
    const deps = {
      getExistingToken: vi.fn().mockResolvedValue(null),
      setTokenIfAbsent: vi.fn().mockResolvedValue('tok_new'),
      generateToken: vi.fn().mockReturnValue('tok_new'),
    }
    expect(await ensureOptOutToken('order_1', deps)).toBe('tok_new')
    expect(deps.setTokenIfAbsent).toHaveBeenCalledWith('order_1', 'tok_new')
  })

  it('re-reads the winner token when it loses the set race', async () => {
    const deps = {
      getExistingToken: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('tok_winner'),
      setTokenIfAbsent: vi.fn().mockResolvedValue(null), // another writer won
      generateToken: vi.fn().mockReturnValue('tok_mine'),
    }
    expect(await ensureOptOutToken('order_1', deps)).toBe('tok_winner')
  })
})
