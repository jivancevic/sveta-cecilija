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

const ON_FILE = { name: 'Ana Anić', email: 'ana@example.com' }

function makeDeps(overrides: Partial<ClaimDeps> = {}): ClaimDeps {
  return {
    attachBuyer: vi.fn().mockResolvedValue(ORDER),
    loadClaimedOrder: vi.fn().mockResolvedValue({ order: ORDER, buyer: ON_FILE }),
    sendClaimedTickets: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('claimOrder', () => {
  it('first claim wins: attaches the buyer and emails the tickets exactly once', async () => {
    const deps = makeDeps()
    const result = await claimOrder({ orderId: 'ord_1', name: 'Ana Anić', email: 'Ana@Example.com' }, deps)
    expect(result).toEqual({ status: 'CLAIMED', emailed: true })
    // email is normalised (trimmed + lowercased) before attach
    expect(deps.attachBuyer).toHaveBeenCalledWith('ord_1', 'Ana Anić', 'ana@example.com')
    expect(deps.sendClaimedTickets).toHaveBeenCalledTimes(1)
    expect(deps.sendClaimedTickets).toHaveBeenCalledWith(ORDER, { name: 'Ana Anić', email: 'ana@example.com' })
  })

  it('comp (goodwill, total=0) claim wins and emails the digital ticket just like a paid slip', async () => {
    // ADR-0019 #320: a family/friend claims a free comp slip. The claim flow is
    // price-agnostic — totalCents=0 must still attach the buyer and send the PDF,
    // overwriting the printed member name with the guest's name.
    const COMP: ClaimableOrder = { ...ORDER, orderId: 'ord_comp', code: 'CMP7', totalCents: 0 }
    const attachBuyer = vi.fn().mockResolvedValue(COMP)
    const sendClaimedTickets = vi.fn().mockResolvedValue(true)
    const deps = makeDeps({ attachBuyer, sendClaimedTickets })
    const result = await claimOrder(
      { orderId: 'ord_comp', name: 'Guest Gost', email: 'guest@example.com' },
      deps,
    )
    expect(result).toEqual({ status: 'CLAIMED', emailed: true })
    expect(attachBuyer).toHaveBeenCalledWith('ord_comp', 'Guest Gost', 'guest@example.com')
    expect(sendClaimedTickets).toHaveBeenCalledTimes(1)
    expect(sendClaimedTickets).toHaveBeenCalledWith(COMP, { name: 'Guest Gost', email: 'guest@example.com' })
  })

  it('winning claim but the send fails: reports CLAIMED + emailed:false (no false "sent")', async () => {
    const deps = makeDeps({ sendClaimedTickets: vi.fn().mockResolvedValue(false) })
    const result = await claimOrder({ orderId: 'ord_1', name: 'Ana', email: 'ana@example.com' }, deps)
    expect(result).toEqual({ status: 'CLAIMED', emailed: false })
  })

  it('already claimed: re-sends to the ON-FILE buyer (self-heal), never the new input', async () => {
    const deps = makeDeps({ attachBuyer: vi.fn().mockResolvedValue(null) })
    const result = await claimOrder({ orderId: 'ord_1', name: 'Mallory', email: 'mallory@evil.com' }, deps)
    expect(result).toEqual({ status: 'ALREADY_CLAIMED', emailed: true })
    // re-send targets the on-file buyer, NOT the re-submitter's address
    expect(deps.sendClaimedTickets).toHaveBeenCalledWith(ORDER, ON_FILE)
    expect(deps.sendClaimedTickets).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'mallory@evil.com' }),
    )
  })

  it('already claimed but the order can no longer be loaded: ALREADY_CLAIMED + emailed:false, no send', async () => {
    const deps = makeDeps({
      attachBuyer: vi.fn().mockResolvedValue(null),
      loadClaimedOrder: vi.fn().mockResolvedValue(null),
    })
    const result = await claimOrder({ orderId: 'ord_1', name: 'Bob', email: 'bob@example.com' }, deps)
    expect(result).toEqual({ status: 'ALREADY_CLAIMED', emailed: false })
    expect(deps.sendClaimedTickets).not.toHaveBeenCalled()
  })

  it('already claimed and the re-send fails: ALREADY_CLAIMED + emailed:false', async () => {
    const deps = makeDeps({
      attachBuyer: vi.fn().mockResolvedValue(null),
      sendClaimedTickets: vi.fn().mockResolvedValue(false),
    })
    const result = await claimOrder({ orderId: 'ord_1', name: 'Bob', email: 'bob@example.com' }, deps)
    expect(result).toEqual({ status: 'ALREADY_CLAIMED', emailed: false })
  })

  it('concurrent claims: only the winner attaches; losers re-send to the on-file email', async () => {
    // Simulate the DB: the first attach wins, the rest see email already set.
    let claimed = false
    const attachBuyer = vi.fn(async () => {
      if (claimed) return null
      claimed = true
      return ORDER
    })
    const sendClaimedTickets = vi.fn().mockResolvedValue(true)
    const deps = makeDeps({ attachBuyer, sendClaimedTickets })
    const results = await Promise.all([
      claimOrder({ orderId: 'ord_1', name: 'A', email: 'a@example.com' }, deps),
      claimOrder({ orderId: 'ord_1', name: 'B', email: 'b@example.com' }, deps),
      claimOrder({ orderId: 'ord_1', name: 'C', email: 'c@example.com' }, deps),
    ])
    expect(results.filter((r) => r.status === 'CLAIMED')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'ALREADY_CLAIMED')).toHaveLength(2)
    // exactly one fresh attach; everyone who returns reports an honest emailed flag
    expect(attachBuyer).toHaveBeenCalledTimes(3)
    expect(results.every((r) => r.emailed === true)).toBe(true)
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
