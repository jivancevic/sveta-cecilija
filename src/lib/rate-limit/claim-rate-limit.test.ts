import { describe, it, expect } from 'vitest'
import { createClaimRateLimiter, clientIpFromHeaders } from './claim-rate-limit'

describe('createClaimRateLimiter', () => {
  it('allows a single legitimate claim', () => {
    const rl = createClaimRateLimiter()
    expect(rl.check('tok', '1.2.3.4').allowed).toBe(true)
  })

  it('blocks once per-token attempts exceed the limit (same token, same IP)', () => {
    const t = 0
    const rl = createClaimRateLimiter({ perTokenLimit: 3, perIpLimit: 100, windowMs: 60_000, now: () => t })
    expect(rl.check('tok', 'ip').allowed).toBe(true)
    expect(rl.check('tok', 'ip').allowed).toBe(true)
    expect(rl.check('tok', 'ip').allowed).toBe(true)
    const blocked = rl.check('tok', 'ip')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('blocks once per-IP attempts exceed the limit even across different tokens', () => {
    const t = 0
    const rl = createClaimRateLimiter({ perTokenLimit: 100, perIpLimit: 2, windowMs: 60_000, now: () => t })
    expect(rl.check('tokA', 'ip').allowed).toBe(true)
    expect(rl.check('tokB', 'ip').allowed).toBe(true)
    expect(rl.check('tokC', 'ip').allowed).toBe(false) // IP budget spent
  })

  it('keeps different IPs independent (shared NAT does not lock everyone out)', () => {
    const t = 0
    const rl = createClaimRateLimiter({ perTokenLimit: 100, perIpLimit: 1, windowMs: 60_000, now: () => t })
    expect(rl.check('tokA', 'ip1').allowed).toBe(true)
    expect(rl.check('tokB', 'ip1').allowed).toBe(false)
    expect(rl.check('tokC', 'ip2').allowed).toBe(true) // different IP, fresh budget
  })
})

describe('clientIpFromHeaders', () => {
  it('takes the first IP from x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
    expect(clientIpFromHeaders(h)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '198.51.100.2' })
    expect(clientIpFromHeaders(h)).toBe('198.51.100.2')
  })

  it('returns "unknown" when no proxy header is present', () => {
    expect(clientIpFromHeaders(new Headers())).toBe('unknown')
  })
})
