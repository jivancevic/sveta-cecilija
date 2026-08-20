import { describe, it, expect, vi } from 'vitest'
import {
  dispatchReviewEmails,
  REVIEW_WINDOW_DAYS,
  type DispatchDeps,
  type EligibleOrder,
  type SendWindow,
} from './dispatch-review-emails'

function order(overrides: Partial<EligibleOrder> = {}): EligibleOrder {
  return {
    id: '1',
    buyerName: 'Ana',
    email: 'ana@example.com',
    locale: 'en',
    attended: true,
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
  it('passes a window whose ceiling is exactly 1.5h before now', async () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const deps = makeDeps()
    await dispatchReviewEmails({ now }, deps)
    const arg = (deps.findEligibleOrders as ReturnType<typeof vi.fn>).mock.calls[0][0] as SendWindow
    expect(arg.to.toISOString()).toBe('2026-06-01T10:30:00.000Z')
  })

  it('floors the window at REVIEW_WINDOW_DAYS before now, so old no-shows drop out', async () => {
    const now = new Date('2026-06-01T12:00:00Z')
    const deps = makeDeps()
    await dispatchReviewEmails({ now }, deps)
    const arg = (deps.findEligibleOrders as ReturnType<typeof vi.fn>).mock.calls[0][0] as SendWindow
    expect(REVIEW_WINDOW_DAYS).toBe(7)
    expect(arg.from.toISOString()).toBe('2026-05-25T12:00:00.000Z')
    // A no-show is never claimed, so an unbounded query would re-select it on
    // every run forever. The floor is the only thing that retires it.
    expect(arg.from.getTime()).toBeLessThan(arg.to.getTime())
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
    expect(result).toEqual({
      considered: 2,
      sent: 2,
      skippedAlreadyClaimed: 0,
      skippedNoShow: 0,
      failed: 0,
    })
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
    expect(result).toEqual({
      considered: 0,
      sent: 0,
      skippedAlreadyClaimed: 0,
      skippedNoShow: 0,
      failed: 0,
    })
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  // #378 — attendance gate. Door scanning is the source of truth for "did they
  // come": asking a no-show to review a show they missed produced a payment
  // dispute and a 1-star review.
  describe('attendance gate', () => {
    it('sends to an order with a scanned active ticket (attended)', async () => {
      const deps = makeDeps({
        findEligibleOrders: vi.fn().mockResolvedValue([order({ id: '1', attended: true })]),
      })
      const result = await dispatchReviewEmails({ now: new Date() }, deps)
      expect(deps.sendEmail).toHaveBeenCalledTimes(1)
      expect(result.sent).toBe(1)
      expect(result.skippedNoShow).toBe(0)
    })

    it('does not send to an order whose tickets were never scanned (no-show)', async () => {
      const deps = makeDeps({
        findEligibleOrders: vi.fn().mockResolvedValue([order({ id: '1', attended: false })]),
      })
      const result = await dispatchReviewEmails({ now: new Date() }, deps)
      expect(deps.sendEmail).not.toHaveBeenCalled()
      expect(result).toEqual({
        considered: 1,
        sent: 0,
        skippedAlreadyClaimed: 0,
        skippedNoShow: 1,
        failed: 0,
      })
    })

    it('leaves a no-show unclaimed so a late scan correction can still send', async () => {
      // review_email_sent_at must stay NULL: claimOrder is what writes it, so
      // never calling it is the whole guarantee.
      const deps = makeDeps({
        findEligibleOrders: vi.fn().mockResolvedValue([order({ id: '1', attended: false })]),
      })
      await dispatchReviewEmails({ now: new Date() }, deps)
      expect(deps.claimOrder).not.toHaveBeenCalled()
      expect(deps.releaseClaim).not.toHaveBeenCalled()

      // Same order, now scanned at the door: the next run sends.
      const later = makeDeps({
        findEligibleOrders: vi.fn().mockResolvedValue([order({ id: '1', attended: true })]),
      })
      const result = await dispatchReviewEmails({ now: new Date() }, later)
      expect(later.claimOrder).toHaveBeenCalledWith('1')
      expect(result.sent).toBe(1)
    })

    it('sends to a partially scanned party (one scanned ticket is enough)', async () => {
      // A party of four where the door scanned a single phone still attended;
      // findEligibleOrders reports attended=true for any scanned active ticket.
      const deps = makeDeps({
        findEligibleOrders: vi.fn().mockResolvedValue([order({ id: '4', attended: true })]),
      })
      const result = await dispatchReviewEmails({ now: new Date() }, deps)
      expect(deps.sendEmail).toHaveBeenCalledTimes(1)
      expect(result.sent).toBe(1)
    })

    it('counts no-shows separately from already-claimed skips in one run', async () => {
      const deps = makeDeps({
        findEligibleOrders: vi.fn().mockResolvedValue([
          order({ id: '1', attended: true }),
          order({ id: '2', attended: false }),
          order({ id: '3', attended: true }),
        ]),
        claimOrder: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      })
      const result = await dispatchReviewEmails({ now: new Date() }, deps)
      expect(result).toEqual({
        considered: 3,
        sent: 1,
        skippedAlreadyClaimed: 1,
        skippedNoShow: 1,
        failed: 0,
      })
      // The no-show never reached the claim, so only the two attendees did.
      expect(deps.claimOrder).toHaveBeenCalledTimes(2)
    })
  })
})
