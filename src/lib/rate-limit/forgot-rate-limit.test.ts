import { describe, expect, it } from 'vitest'
import { createForgotRateLimiter } from './forgot-rate-limit'

/** A clock the test moves by hand; no sleeping on the wall. */
function fakeClock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('createForgotRateLimiter', () => {
  it('lets a dancer who really forgot through', () => {
    const limiter = createForgotRateLimiter({ now: fakeClock().now })
    expect(limiter.allow('cici', '1.2.3.4')).toBe(true)
  })

  it('stops the fourth request for one identifier within the hour', () => {
    const clock = fakeClock()
    const limiter = createForgotRateLimiter({ now: clock.now })
    for (let i = 0; i < 3; i++) expect(limiter.allow('cici', '1.2.3.4')).toBe(true)
    expect(limiter.allow('cici', '1.2.3.4')).toBe(false)
  })

  it('treats one identifier as one identifier, whatever the casing or padding', () => {
    const limiter = createForgotRateLimiter({ perIdentifierLimit: 1, now: fakeClock().now })
    expect(limiter.allow('cici', '1.2.3.4')).toBe(true)
    expect(limiter.allow('  CICI ', '5.6.7.8')).toBe(false)
  })

  it('stops one host walking a list of usernames', () => {
    const clock = fakeClock()
    const limiter = createForgotRateLimiter({ now: clock.now })
    for (let i = 0; i < 10; i++) expect(limiter.allow(`dancer${i}`, '1.2.3.4')).toBe(true)
    expect(limiter.allow('dancer10', '1.2.3.4')).toBe(false)
    // Another host is unaffected: the per-IP window is per IP.
    expect(limiter.allow('dancer10', '9.9.9.9')).toBe(true)
  })

  it('refills once the window has passed', () => {
    const clock = fakeClock()
    const limiter = createForgotRateLimiter({ now: clock.now })
    for (let i = 0; i < 3; i++) limiter.allow('cici', '1.2.3.4')
    expect(limiter.allow('cici', '1.2.3.4')).toBe(false)
    clock.advance(60 * 60 * 1000 + 1)
    expect(limiter.allow('cici', '1.2.3.4')).toBe(true)
  })

  it('keeps counting a blocked flood, so spacing requests does not reset it', () => {
    const clock = fakeClock()
    const limiter = createForgotRateLimiter({ perIdentifierLimit: 2, now: clock.now })
    limiter.allow('cici', '1.2.3.4')
    limiter.allow('cici', '1.2.3.4')
    for (let i = 0; i < 5; i++) expect(limiter.allow('cici', '1.2.3.4')).toBe(false)
    // The blocked attempts are in the window too, so the oldest one ageing out
    // does not immediately open the gate.
    clock.advance(60 * 60 * 1000 - 10)
    expect(limiter.allow('cici', '1.2.3.4')).toBe(false)
  })
})
