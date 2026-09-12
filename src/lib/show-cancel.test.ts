import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cancelShow,
  previewCancel,
  refundModeFor,
  BREVO_DAILY_MAIL_LIMIT,
  type CancelOrderRow,
  type CancelShowDeps,
  type CancelShowRow,
} from './show-cancel'
import { NON_PUBLIC_PERFORMANCE_MESSAGE } from './show-admin-actions'

const show = (over: Partial<CancelShowRow> = {}): CancelShowRow => ({
  id: '7',
  date: '2026-08-05',
  time: '21:00',
  venue: 'ljetno-kino',
  isPublic: true,
  cancelled: false,
  ...over,
})

const order = (over: Partial<CancelOrderRow> = {}): CancelOrderRow => ({
  orderId: '1',
  channel: 'online',
  buyerName: 'Ivan Horvat',
  email: 'ivan@example.com',
  locale: 'hr',
  totalCents: 4000,
  seats: 2,
  refunded: false,
  notified: false,
  ...over,
})

function deps(over: Partial<CancelShowDeps> = {}): CancelShowDeps {
  return {
    getShow: vi.fn(async () => show()),
    findOrders: vi.fn(async () => [] as CancelOrderRow[]),
    claimCancel: vi.fn(async () => true),
    refundOnlineOrder: vi.fn(async () => ({ refunded: true, amountCents: 4000 })),
    voidTickets: vi.fn(async () => 2),
    sendCancellationEmail: vi.fn(async () => true),
    markNotified: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => {}),
    ...over,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('refundModeFor', () => {
  it('maps each channel to what its buyer is told about the money', () => {
    expect(refundModeFor('online')).toBe('refund')
    expect(refundModeFor('partner')).toBe('point-of-sale')
    expect(refundModeFor('comp')).toBe('none')
  })
})

describe('cancelShow', () => {
  it('throws when the show does not exist', async () => {
    await expect(cancelShow({ showId: '9', userId: '1' }, deps({ getShow: async () => null }))).rejects.toThrow(
      /not found/i,
    )
  })

  it('refuses a non-public performance without cancelling anything', async () => {
    const d = deps({ getShow: async () => show({ isPublic: false }) })
    await expect(cancelShow({ showId: '7', userId: '1' }, d)).rejects.toThrow(NON_PUBLIC_PERFORMANCE_MESSAGE)
    expect(d.claimCancel).not.toHaveBeenCalled()
  })

  it('claims the cancellation BEFORE touching money, so the show stops selling first', async () => {
    const calls: string[] = []
    const d = deps({
      findOrders: async () => [order()],
      claimCancel: vi.fn(async () => {
        calls.push('claim')
        return true
      }),
      refundOnlineOrder: vi.fn(async () => {
        calls.push('refund')
        return { refunded: true, amountCents: 4000 }
      }),
    })
    await cancelShow({ showId: '7', userId: '1' }, d)
    expect(calls).toEqual(['claim', 'refund'])
  })

  it('refunds online orders, voids partner and comp seats, and mails everyone with an address', async () => {
    const d = deps({
      findOrders: async () => [
        order({ orderId: '1', channel: 'online' }),
        order({ orderId: '2', channel: 'partner', email: 'hotel-guest@example.com', totalCents: 4000 }),
        order({ orderId: '3', channel: 'comp', email: null, totalCents: 0 }),
      ],
      voidTickets: vi.fn(async () => 2),
    })
    const result = await cancelShow({ showId: '7', userId: '1' }, d)

    expect(result).toMatchObject({
      status: 'cancelled',
      orders: 3,
      refunded: 1,
      refundedCents: 4000,
      refundFailed: 0,
      voided: 4,
      notified: 2,
      notifyFailed: 0,
      noEmail: 1,
    })
    expect(d.refundOnlineOrder).toHaveBeenCalledTimes(1)
    expect(d.voidTickets).toHaveBeenCalledTimes(2)
    expect(d.markNotified).toHaveBeenCalledTimes(2)
  })

  it('tells each channel the truth about its money', async () => {
    const send = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true)
    await cancelShow(
      { showId: '7', userId: '1' },
      deps({
        findOrders: async () => [
          order({ orderId: '1', channel: 'online' }),
          order({ orderId: '2', channel: 'partner' }),
          order({ orderId: '3', channel: 'comp' }),
        ],
        sendCancellationEmail: send,
      }),
    )
    expect(send.mock.calls.map((c) => c[2])).toEqual(['refund', 'point-of-sale', 'none'])
    // The show facts travel with every notice, so the buyer can tell which
    // evening of several is gone.
    expect(send.mock.calls[0][1]).toEqual({ date: '2026-08-05', time: '21:00', venue: 'ljetno-kino' })
  })

  it('is re-runnable: an already-cancelled show still finishes the unfinished half', async () => {
    const d = deps({
      getShow: async () => show({ cancelled: true }),
      claimCancel: async () => false,
      findOrders: async () => [
        // Refunded and told last time: nothing left to do.
        order({ orderId: '1', refunded: true, notified: true }),
        // Refunded last time, but Brevo failed: only the mail is retried.
        order({ orderId: '2', refunded: true, notified: false, email: 'two@example.com' }),
      ],
      refundOnlineOrder: vi.fn(async () => ({ refunded: false, amountCents: 4000 })),
    })
    const result = await cancelShow({ showId: '7', userId: '1' }, d)

    expect(result.status).toBe('already-cancelled')
    // The engine is still called (it self-heals a stuck void) but nothing is
    // counted as newly refunded, so the report never double-counts money.
    expect(result.refunded).toBe(0)
    expect(result.refundedCents).toBe(0)
    expect(result.notified).toBe(1)
    expect(d.sendCancellationEmail).toHaveBeenCalledTimes(1)
    expect(d.markNotified).toHaveBeenCalledWith('2')
  })

  it('never promises a refund it just failed to make, and records the failure', async () => {
    const d = deps({
      findOrders: async () => [order({ orderId: '1' }), order({ orderId: '2', email: 'two@example.com' })],
      refundOnlineOrder: vi.fn(async (orderId: string) => {
        if (orderId === '1') throw new Error('Stripe timeout')
        return { refunded: true, amountCents: 4000 }
      }),
    })
    const result = await cancelShow({ showId: '7', userId: '1' }, d)

    expect(result.refundFailed).toBe(1)
    expect(result.refunded).toBe(1)
    // Only the buyer whose money actually moved was written to.
    expect(d.sendCancellationEmail).toHaveBeenCalledTimes(1)
    expect(d.recordFailure).toHaveBeenCalledWith(
      'show_cancel_refund_failed',
      expect.objectContaining({ orderId: '1', error: 'Stripe timeout' }),
    )
  })

  it('leaves cancel_notified_at unset when the send fails, so a re-run retries exactly that buyer', async () => {
    const d = deps({
      findOrders: async () => [order()],
      sendCancellationEmail: vi.fn(async () => false),
    })
    const result = await cancelShow({ showId: '7', userId: '1' }, d)

    expect(result).toMatchObject({ notified: 0, notifyFailed: 1 })
    expect(d.markNotified).not.toHaveBeenCalled()
    expect(d.recordFailure).toHaveBeenCalledWith(
      'show_cancel_email_failed',
      expect.objectContaining({ orderId: '1' }),
    )
  })

  it('treats a thrown send as a failed send rather than abandoning the other buyers', async () => {
    const d = deps({
      findOrders: async () => [order({ orderId: '1' }), order({ orderId: '2', email: 'two@example.com' })],
      sendCancellationEmail: vi.fn(async (o: CancelOrderRow) => {
        if (o.orderId === '1') throw new Error('fetch exploded')
        return true
      }),
    })
    const result = await cancelShow({ showId: '7', userId: '1' }, d)
    expect(result).toMatchObject({ notified: 1, notifyFailed: 1 })
  })

  it('counts a buyer as notified even if the stamp fails, and records the risk of a double mail', async () => {
    const d = deps({
      findOrders: async () => [order()],
      markNotified: vi.fn(async () => {
        throw new Error('db gone')
      }),
    })
    const result = await cancelShow({ showId: '7', userId: '1' }, d)
    expect(result.notified).toBe(1)
    expect(d.recordFailure).toHaveBeenCalledWith(
      'show_cancel_stamp_failed',
      expect.objectContaining({ orderId: '1' }),
    )
  })

  it('a failed partner void does not stop the run and is recorded', async () => {
    const d = deps({
      findOrders: async () => [order({ orderId: '1', channel: 'partner' }), order({ orderId: '2', channel: 'comp', email: 'c@example.com' })],
      voidTickets: vi.fn(async (orderId: string) => {
        if (orderId === '1') throw new Error('deadlock')
        return 1
      }),
    })
    const result = await cancelShow({ showId: '7', userId: '1' }, d)
    expect(result.voided).toBe(1)
    expect(result.notified).toBe(1)
    expect(d.recordFailure).toHaveBeenCalledWith(
      'show_cancel_void_failed',
      expect.objectContaining({ orderId: '1', channel: 'partner' }),
    )
  })
})

describe('previewCancel', () => {
  it('sums the money, the seats and the buyers the confirm would touch', async () => {
    const preview = await previewCancel(
      '7',
      deps({
        findOrders: async () => [
          order({ orderId: '1', channel: 'online', totalCents: 4000, seats: 2 }),
          order({ orderId: '2', channel: 'online', totalCents: 3000, seats: 2, refunded: true, notified: true }),
          order({ orderId: '3', channel: 'partner', totalCents: 6000, seats: 3, email: null }),
          order({ orderId: '4', channel: 'comp', totalCents: 0, seats: 1, email: 'guest@example.com' }),
        ],
      }),
    )

    expect(preview).toMatchObject({
      alreadyCancelled: false,
      date: '2026-08-05',
      // The already-refunded order is money that has already moved: counting it
      // would overstate what this action costs.
      onlineOrders: 1,
      refundCents: 4000,
      partnerOrders: 1,
      partnerSeats: 3,
      compOrders: 1,
      compSeats: 1,
      toNotify: 2,
      noEmail: 1,
      overDailyMailLimit: false,
      dailyMailLimit: BREVO_DAILY_MAIL_LIMIT,
    })
    expect(preview.sampleEmails).toEqual(['ivan@example.com', 'guest@example.com'])
  })

  it('flags a cancelled row so the modal can say this run only finishes the job', async () => {
    const preview = await previewCancel('7', deps({ getShow: async () => show({ cancelled: true }) }))
    expect(preview.alreadyCancelled).toBe(true)
  })

  it('warns when the sends alone would exceed a day of Brevo', async () => {
    const many = Array.from({ length: BREVO_DAILY_MAIL_LIMIT + 1 }, (_, i) =>
      order({ orderId: String(i), email: `b${i}@example.com` }),
    )
    const preview = await previewCancel('7', deps({ findOrders: async () => many }))
    expect(preview.toNotify).toBe(BREVO_DAILY_MAIL_LIMIT + 1)
    expect(preview.overDailyMailLimit).toBe(true)
    expect(preview.sampleEmails).toHaveLength(5)
  })

  it('refuses a non-public performance', async () => {
    await expect(previewCancel('7', deps({ getShow: async () => show({ isPublic: false }) }))).rejects.toThrow(
      NON_PUBLIC_PERFORMANCE_MESSAGE,
    )
  })
})
