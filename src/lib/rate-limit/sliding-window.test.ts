import { describe, it, expect } from 'vitest'
import { createSlidingWindowLimiter } from './sliding-window'

describe('createSlidingWindowLimiter', () => {
  it('allows up to the limit within the window, then blocks', () => {
    const t = 1000
    const rl = createSlidingWindowLimiter({ limit: 3, windowMs: 60_000, now: () => t })

    expect(rl.hit('k').allowed).toBe(true) // 1
    expect(rl.hit('k').allowed).toBe(true) // 2
    expect(rl.hit('k').allowed).toBe(true) // 3
    const blocked = rl.hit('k') // 4 → over
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  it('a single legitimate claim is always allowed', () => {
    const rl = createSlidingWindowLimiter({ limit: 5, windowMs: 60_000 })
    expect(rl.hit('legit-token').allowed).toBe(true)
  })

  it('keeps separate budgets per key', () => {
    const t = 0
    const rl = createSlidingWindowLimiter({ limit: 1, windowMs: 1000, now: () => t })
    expect(rl.hit('a').allowed).toBe(true)
    expect(rl.hit('a').allowed).toBe(false) // a exhausted
    expect(rl.hit('b').allowed).toBe(true) // b independent
  })

  it('refills once the window passes', () => {
    let t = 0
    const rl = createSlidingWindowLimiter({ limit: 2, windowMs: 1000, now: () => t })
    expect(rl.hit('k').allowed).toBe(true)
    expect(rl.hit('k').allowed).toBe(true)
    expect(rl.hit('k').allowed).toBe(false) // over within window
    t = 1001 // window elapsed
    expect(rl.hit('k').allowed).toBe(true) // old hits aged out
  })

  it('a flood keeps the window full (blocked attempts still count)', () => {
    let t = 0
    const rl = createSlidingWindowLimiter({ limit: 2, windowMs: 1000, now: () => t })
    rl.hit('k'); rl.hit('k') // at limit
    // Hammer every 100ms — each blocked attempt is still recorded, so the
    // window never drains enough to let one through until the flood stops.
    for (let i = 0; i < 5; i++) {
      t += 100
      expect(rl.hit('k').allowed).toBe(false)
    }
  })

  it('reports retryAfterMs counting down to the oldest hit ageing out', () => {
    let t = 0
    const rl = createSlidingWindowLimiter({ limit: 1, windowMs: 1000, now: () => t })
    rl.hit('k') // hit at t=0, ages out at t=1000
    t = 200
    const blocked = rl.hit('k')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(800) // 1000 - 200
  })
})

describe('eviction (#445 review)', () => {
  it('forgets a key whose whole window has aged out', () => {
    let t = 1_000_000
    const rl = createSlidingWindowLimiter({ limit: 2, windowMs: 1000, now: () => t })

    // 512 distinct keys: the sweep runs on the last of them and finds every one
    // still fresh, so nothing is dropped yet.
    for (let i = 0; i < 512; i++) rl.hit(`k${i}`)
    expect(rl.size()).toBe(512)

    // A whole window later, 512 hits on ONE key sweep the stale ones away.
    t += 2000
    for (let i = 0; i < 512; i++) rl.hit('survivor')
    expect(rl.size()).toBe(1)
  })

  it('keeps a key that is still inside its window', () => {
    let t = 1_000_000
    const rl = createSlidingWindowLimiter({ limit: 1000, windowMs: 10_000, now: () => t })
    rl.hit('recent')
    t += 1000
    for (let i = 0; i < 512; i++) rl.hit('noisy')
    expect(rl.size()).toBe(2)
  })
})
