import { describe, expect, it } from 'vitest'
import { MORESKA_SCOPE, bearerToken, isMissingUserError, mcpAuthScopes } from './gate'
import { createMcpRateLimiter } from '@/lib/rate-limit/mcp-rate-limit'

describe('mcpAuthScopes', () => {
  it('adds the permission scope while the account holds it', () => {
    expect(mcpAuthScopes(['mcp'], true)).toEqual(['mcp', MORESKA_SCOPE])
  })

  it('leaves it off when the account does not', () => {
    expect(mcpAuthScopes(['mcp'], false)).toEqual(['mcp'])
  })

  it('STRIPS a stored copy, so a scope can never stand in for the permission', () => {
    // The dangerous case: a token row that somehow carries the word.
    expect(mcpAuthScopes(['mcp', MORESKA_SCOPE], false)).toEqual(['mcp'])
    // …and no duplicate when the account really does hold it.
    expect(mcpAuthScopes(['mcp', MORESKA_SCOPE], true)).toEqual(['mcp', MORESKA_SCOPE])
  })

  it('never mutates the stored list', () => {
    const stored = ['mcp', MORESKA_SCOPE]
    mcpAuthScopes(stored, true)
    expect(stored).toEqual(['mcp', MORESKA_SCOPE])
  })
})

describe('isMissingUserError', () => {
  it('reads a 404 as "the account is gone"', () => {
    expect(isMissingUserError({ status: 404 })).toBe(true)
  })

  it('reads everything else as a failure to be rethrown', () => {
    expect(isMissingUserError(new Error('ECONNREFUSED'))).toBe(false)
    expect(isMissingUserError({ status: 500 })).toBe(false)
    expect(isMissingUserError(null)).toBe(false)
    expect(isMissingUserError(undefined)).toBe(false)
  })
})

describe('bearerToken', () => {
  it('reads the token whatever the case of the scheme', () => {
    expect(bearerToken('Bearer abc')).toBe('abc')
    expect(bearerToken('bearer abc')).toBe('abc')
    expect(bearerToken('BEARER  abc ')).toBe('abc')
  })

  it('is empty for anything that is not a bearer credential', () => {
    expect(bearerToken(null)).toBe('')
    expect(bearerToken('')).toBe('')
    expect(bearerToken('Basic abc')).toBe('')
    expect(bearerToken('JWT abc')).toBe('')
  })
})

describe('the rate limit is only reached by a token that verified (#445 review)', () => {
  it('grows one key per TOKEN ROW, never one per bearer string', () => {
    const limiter = createMcpRateLimiter({ limit: 5, windowMs: 60_000 })
    // The route calls `allow` only when `verifyAccessToken` returned a row, and
    // it passes that row's id. A thousand invented bearers therefore never
    // reach this call at all; the same token seen a thousand times is one key.
    for (let i = 0; i < 1000; i++) limiter.allow('42')
    expect(limiter.size()).toBe(1)
  })

  it('blocks past the limit and lets the next window through', () => {
    let t = 0
    const limiter = createMcpRateLimiter({ limit: 3, windowMs: 1000, now: () => t })
    expect([limiter.allow('7'), limiter.allow('7'), limiter.allow('7')]).toEqual([true, true, true])
    expect(limiter.allow('7')).toBe(false)
    t += 2000
    expect(limiter.allow('7')).toBe(true)
  })

  it('gives each token its own budget', () => {
    const limiter = createMcpRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    expect(limiter.allow('b')).toBe(true)
  })
})
