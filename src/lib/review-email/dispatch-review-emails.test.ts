import { describe, it, expect, vi } from 'vitest'
import {
  dispatchReviewEmails,
  type DispatchDeps,
  type EligibleOrder,
} from './dispatch-review-emails'

function order(overrides: Partial<EligibleOrder> = {}): EligibleOrder {
  return {
    id: '1',
    buyerName: 'Ana',
    email: 'ana@example.com',
    locale: 'en',
    ...overrides,
  }
}

function makeDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    findEligibleOrders: vi.fn().mockResolvedValue([]),
    claimOrder: vi.fn().mockResolvedValue(true),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('dispatchReviewEmails', () => {
  it('passes a cutoff exactly 2h before now to findEligibleOrders', async () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const deps = makeDeps()
    await dispatchReviewEmails({ now }, deps)
    const arg = (deps.findEligibleOrders as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date
    expect(arg.toISOString()).toBe('2026-06-01T10:00:00.000Z')
  })

  it('sends one email per eligible order when claim succeeds', async () => {
    const deps = makeDeps({
      findEligibleOrders: vi.fn().mockResolvedValue([
        order({ id: '1' }),
        order({ id: '2', email: 'b@x' }),
      ]),
    })
    const result = await dispatchReviewEmails({ now: new Date() }, deps)
    expect(deps.sendEmail).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ considered: 2, sent: 2, skippedAlreadyClaimed: 0, failed: 0 })
  })

  it('skips orders that another worker already claimed (atomic claim returns false)', async () => {
    const deps = makeDeps({
      findEligibleOrders: vi.fn().mockResolvedValue([order({ id: '1' }), order({ id: '2' })]),
      claimOrder: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    })
    const result = await dispatchReviewEmails({ now: new Date() }, deps)
    expect(deps.sendEmail).toHaveBeenCalledTimes(1)
    expect(result.sent).toBe(1)
    expect(result.skippedAlreadyClaimed).toBe(1)
  })

  it('idempotency under concurrent dispatch: only first run wins the claim — second sends zero', async () => {
    // Simulate two parallel cron invocations seeing the same eligible row.
    // The shared "DB" lets the first claimOrder succeed and subsequent ones
    // fail — mirroring the SQL guarantee.
    const claimed = new Set<string>()
    const sharedClaim = vi.fn(async (id: string) => {
      if (claimed.has(id)) return false
      claimed.add(id)
      return true
    })
    const eligible = [order({ id: '1' }), order({ id: '2' })]
    const depsA = makeDeps({
      findEligibleOrders: vi.fn().mockResolvedValue(eligible),
      claimOrder: sharedClaim,
    })
    const depsB = makeDeps({
      findEligibleOrders: vi.fn().mockResolvedValue(eligible),
      claimOrder: sharedClaim,
    })

    const [a, b] = await Promise.all([
      dispatchReviewEmails({ now: new Date() }, depsA),
      dispatchReviewEmails({ now: new Date() }, depsB),
    ])

    expect(a.sent + b.sent).toBe(2)
    expect((depsA.sendEmail as ReturnType<typeof vi.fn>).mock.calls.length
      + (depsB.sendEmail as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('releases the claim when send fails so cron can retry next run', async () => {
    const deps = makeDeps({
      findEligibleOrders: vi.fn().mockResolvedValue([order({ id: '7' })]),
      sendEmail: vi.fn().mockRejectedValue(new Error('Brevo 502')),
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await dispatchReviewEmails({ now: new Date() }, deps)
    errSpy.mockRestore()
    expect(deps.releaseClaim).toHaveBeenCalledWith('7')
    expect(result.failed).toBe(1)
    expect(result.sent).toBe(0)
  })

  it('forwards the eligible order (incl. locale) into sendEmail unchanged', async () => {
    const ord = order({ id: '9', locale: 'hr', buyerName: 'Marko' })
    const deps = makeDeps({
      findEligibleOrders: vi.fn().mockResolvedValue([ord]),
    })
    await dispatchReviewEmails({ now: new Date() }, deps)
    expect(deps.sendEmail).toHaveBeenCalledWith(ord)
  })

  it('returns considered=0 when there are no eligible orders', async () => {
    const deps = makeDeps()
    const result = await dispatchReviewEmails({ now: new Date() }, deps)
    expect(result).toEqual({ considered: 0, sent: 0, skippedAlreadyClaimed: 0, failed: 0 })
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })
})
