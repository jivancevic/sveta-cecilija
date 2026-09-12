import { describe, expect, it } from 'vitest'
import { createJoinRateLimiter } from './join-rate-limit'

/** A clock the test moves by hand; no sleeping on the wall. */
function fakeClock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('createJoinRateLimiter', () => {
  it('lets a dancer at a rehearsal through', () => {
    const limiter = createJoinRateLimiter({ now: fakeClock().now })
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(true)
  })

  /**
   * The number that matters. A hall of dancers on one wifi is ONE IP, and the
   * forgot route's ten an hour would lock the back half of the roster out of
   * the very evening this exists for.
   */
  it('lets a whole roster join from behind one NAT', () => {
    const limiter = createJoinRateLimiter({ now: fakeClock().now })
    for (let i = 0; i < 60; i++) expect(limiter.allow('ABC123', '1.2.3.4')).toBe(true)
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(false)
    // Somebody on mobile data is unaffected: the window is per IP.
    expect(limiter.allow('ABC123', '9.9.9.9')).toBe(true)
  })

  it('stops a flood aimed at one code', () => {
    const limiter = createJoinRateLimiter({ perIpLimit: 1000, now: fakeClock().now })
    for (let i = 0; i < 200; i++) expect(limiter.allow('ABC123', `10.0.0.${i % 250}`)).toBe(true)
    expect(limiter.allow('ABC123', '10.0.1.1')).toBe(false)
    // A different code has its own budget.
    expect(limiter.allow('XYZ789', '10.0.1.1')).toBe(true)
  })

  it('treats one code as one code, whatever the casing or padding', () => {
    const limiter = createJoinRateLimiter({ perCodeLimit: 1, now: fakeClock().now })
    expect(limiter.allow('abc123', '1.2.3.4')).toBe(true)
    expect(limiter.allow('  ABC123 ', '5.6.7.8')).toBe(false)
  })

  it('refills once the window has passed', () => {
    const clock = fakeClock()
    const limiter = createJoinRateLimiter({ perIpLimit: 1, now: clock.now })
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(true)
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(false)
    clock.advance(60 * 60 * 1000 + 1)
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(true)
  })

  // Both windows are hit on every call, so a flood on one dimension keeps its
  // window full instead of refilling while the other one blocks.
  it('keeps counting the code even while the IP is blocked', () => {
    const limiter = createJoinRateLimiter({ perCodeLimit: 3, perIpLimit: 1, now: fakeClock().now })
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(true)
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(false)
    expect(limiter.allow('ABC123', '1.2.3.4')).toBe(false)
    // The code's own budget is spent by those three calls, so another host is
    // refused too.
    expect(limiter.allow('ABC123', '9.9.9.9')).toBe(false)
  })
})
