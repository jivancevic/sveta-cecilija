import { describe, it, expect, vi } from 'vitest'
import {
  claimOrder,
  maskEmail,
  isPlausibleEmail,
  ClaimValidationError,
  type ClaimableOrder,
  type ClaimDeps,
} from './claim-order'

const ORDER: ClaimableOrder = {
  orderId: 'ord_1',
  code: 'AB23',
  showId: 'show_1',
  adultCount: 2,
  childCount: 1,
  totalCents: 5000,
  locale: 'en',
}

function makeDeps(overrides: Partial<ClaimDeps> = {}): ClaimDeps {
  return {
    attachBuyer: vi.fn().mockResolvedValue(ORDER),
    sendClaimedTickets: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('claimOrder', () => {
  it('first claim wins: attaches the buyer and emails the tickets exactly once', async () => {
    const deps = makeDeps()
    const result = await claimOrder({ orderId: 'ord_1', name: 'Ana Anić', email: 'Ana@Example.com' }, deps)
    expect(result).toEqual({ status: 'CLAIMED' })
    // email is normalised (trimmed + lowercased) before attach
    expect(deps.attachBuyer).toHaveBeenCalledWith('ord_1', 'Ana Anić', 'ana@example.com')
    expect(deps.sendClaimedTickets).toHaveBeenCalledTimes(1)
    expect(deps.sendClaimedTickets).toHaveBeenCalledWith(ORDER, { name: 'Ana Anić', email: 'ana@example.com' })
  })

  it('already claimed (attach returns null): no overwrite, no email', async () => {
    const deps = makeDeps({ attachBuyer: vi.fn().mockResolvedValue(null) })
    const result = await claimOrder({ orderId: 'ord_1', name: 'Bob', email: 'bob@example.com' }, deps)
    expect(result).toEqual({ status: 'ALREADY_CLAIMED' })
    expect(deps.sendClaimedTickets).not.toHaveBeenCalled()
  })

  it('concurrent claims: only the winner emails (the loser is a no-op)', async () => {
    // Simulate the DB: the first attach wins, the rest see email already set.
    let claimed = false
    const attachBuyer = vi.fn(async () => {
      if (claimed) return null
      claimed = true
      return ORDER
    })
    const sendClaimedTickets = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({ attachBuyer, sendClaimedTickets })
    const results = await Promise.all([
      claimOrder({ orderId: 'ord_1', name: 'A', email: 'a@example.com' }, deps),
      claimOrder({ orderId: 'ord_1', name: 'B', email: 'b@example.com' }, deps),
      claimOrder({ orderId: 'ord_1', name: 'C', email: 'c@example.com' }, deps),
    ])
    expect(results.filter((r) => r.status === 'CLAIMED')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'ALREADY_CLAIMED')).toHaveLength(2)
    expect(sendClaimedTickets).toHaveBeenCalledTimes(1)
  })

  it('rejects a missing name', async () => {
    const deps = makeDeps()
    await expect(claimOrder({ orderId: 'ord_1', name: '  ', email: 'a@example.com' }, deps)).rejects.toBeInstanceOf(
      ClaimValidationError,
    )
    expect(deps.attachBuyer).not.toHaveBeenCalled()
  })

  it('rejects an implausible email before touching the DB', async () => {
    const deps = makeDeps()
    await expect(claimOrder({ orderId: 'ord_1', name: 'Ana', email: 'not-an-email' }, deps)).rejects.toBeInstanceOf(
      ClaimValidationError,
    )
    expect(deps.attachBuyer).not.toHaveBeenCalled()
    expect(deps.sendClaimedTickets).not.toHaveBeenCalled()
  })
})

describe('isPlausibleEmail', () => {
  it.each(['a@b.co', 'josip.ivancevic00@gmail.com', 'x+tag@sub.domain.hr'])('accepts %s', (e) => {
    expect(isPlausibleEmail(e)).toBe(true)
  })
  it.each(['', 'no-at', 'a@b', 'a @b.co', 'a@b .co', '@b.co'])('rejects %s', (e) => {
    expect(isPlausibleEmail(e)).toBe(false)
  })
})

describe('maskEmail', () => {
  it('keeps the first char + domain, masks the rest', () => {
    expect(maskEmail('josip@gmail.com')).toBe('j***@gmail.com')
    expect(maskEmail('a@b.co')).toBe('a***@b.co')
  })
  it('degrades safely on a malformed address', () => {
    expect(maskEmail('garbage')).toBe('***')
    expect(maskEmail('@nolocal.com')).toBe('***')
  })
})
