import { describe, it, expect, vi } from 'vitest'
import {
  rescheduleShow,
  previewReschedule,
  type RescheduleDeps,
  type RescheduleShow,
  type RescheduleBuyer,
} from './show-reschedule'

function show(overrides: Partial<RescheduleShow> = {}): RescheduleShow {
  return { id: '7', date: '2026-06-22', time: '21:00', venue: 'ljetno-kino', ...overrides }
}

function buyer(overrides: Partial<RescheduleBuyer> = {}): RescheduleBuyer {
  return { orderId: '1', name: 'Ana', email: 'ana@example.com', locale: 'en', ...overrides }
}

function makeDeps(overrides: Partial<RescheduleDeps> = {}): RescheduleDeps {
  return {
    getShow: vi.fn().mockResolvedValue(show()),
    findBuyers: vi.fn().mockResolvedValue([buyer({ orderId: '1' }), buyer({ orderId: '2', email: 'b@x.hr', locale: 'hr' })]),
    claimReschedule: vi.fn().mockResolvedValue(true),
    sendDateChangeEmail: vi.fn().mockResolvedValue(true),
    findReissueOrderIds: vi.fn().mockResolvedValue(['1', '2']),
    reissueTicket: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

const RESCHEDULED = {
  status: 'rescheduled',
  oldDate: '2026-06-22',
  newDate: '2026-06-23',
  total: 2,
  sent: 2,
  failed: 0,
  reissued: 2,
  reissueFailed: 0,
}

describe('rescheduleShow', () => {
  it('claims the new date then emails every buyer', async () => {
    const deps = makeDeps()
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(deps.claimReschedule).toHaveBeenCalledWith('7', '3', '2026-06-22', '2026-06-23')
    expect(deps.sendDateChangeEmail).toHaveBeenCalledTimes(2)
    expect(deps.sendDateChangeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: '1' }),
      { oldDate: '2026-06-22', newDate: '2026-06-23', time: '21:00', venue: 'ljetno-kino' },
    )
    expect(result).toEqual(RESCHEDULED)
  })

  it('claims BEFORE sending so a lost race never double-notifies', async () => {
    const order: string[] = []
    const deps = makeDeps({
      claimReschedule: vi.fn(async () => { order.push('claim'); return true }),
      sendDateChangeEmail: vi.fn(async () => { order.push('send'); return true }),
    })
    await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(order[0]).toBe('claim')
  })

  it('is a no-op when the new date equals the current date', async () => {
    const deps = makeDeps()
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-22' }, deps)
    expect(result).toEqual({ status: 'no-op', date: '2026-06-22' })
    expect(deps.claimReschedule).not.toHaveBeenCalled()
    expect(deps.sendDateChangeEmail).not.toHaveBeenCalled()
    expect(deps.reissueTicket).not.toHaveBeenCalled()
  })

  it('reports date-mismatch (no send) when the atomic claim loses the race', async () => {
    const deps = makeDeps({ claimReschedule: vi.fn().mockResolvedValue(false) })
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(result).toEqual({ status: 'date-mismatch' })
    expect(deps.sendDateChangeEmail).not.toHaveBeenCalled()
    expect(deps.reissueTicket).not.toHaveBeenCalled()
  })

  it('counts partial send failures', async () => {
    const deps = makeDeps({
      sendDateChangeEmail: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    })
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(result).toEqual({ ...RESCHEDULED, sent: 1, failed: 1 })
  })

  it('throws when the show does not exist', async () => {
    const deps = makeDeps({ getShow: vi.fn().mockResolvedValue(null) })
    await expect(rescheduleShow({ showId: 'x', userId: '3', newDate: '2026-06-23' }, deps)).rejects.toThrow('Show not found')
  })
})

// #379 — the notice alone left buyers holding a PDF with the old date. After the
// move we reissue the ticket itself, once per affected ORDER (not per buyer: the
// notice is deduped by email, a ticket is not).
describe('rescheduleShow ticket reissue', () => {
  it('reissues exactly once per affected order, after the notice', async () => {
    const calls: string[] = []
    const deps = makeDeps({
      findReissueOrderIds: vi.fn().mockResolvedValue(['1', '2', '3']),
      sendDateChangeEmail: vi.fn(async () => { calls.push('notice'); return true }),
      reissueTicket: vi.fn(async (orderId: string) => { calls.push(`reissue:${orderId}`); return true }),
    })

    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)

    expect(deps.findReissueOrderIds).toHaveBeenCalledWith('7')
    expect(deps.reissueTicket).toHaveBeenCalledTimes(3)
    expect(deps.reissueTicket).toHaveBeenNthCalledWith(1, '1')
    expect(deps.reissueTicket).toHaveBeenNthCalledWith(2, '2')
    expect(deps.reissueTicket).toHaveBeenNthCalledWith(3, '3')
    // Ticket last, so the newest ticket-shaped thing in the inbox is the correct one.
    expect(calls).toEqual(['notice', 'notice', 'reissue:1', 'reissue:2', 'reissue:3'])
    expect(result).toEqual({ ...RESCHEDULED, reissued: 3 })
  })

  it('reissues per order even when two orders share one buyer email', async () => {
    // findBuyers dedupes by email (one notice per person); findReissueOrderIds
    // does not (each order has its own QR codes and its own PDF).
    const deps = makeDeps({
      findBuyers: vi.fn().mockResolvedValue([buyer({ orderId: '1' })]),
      findReissueOrderIds: vi.fn().mockResolvedValue(['1', '2']),
    })
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(deps.sendDateChangeEmail).toHaveBeenCalledTimes(1)
    expect(deps.reissueTicket).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ...RESCHEDULED, total: 1, sent: 1, reissued: 2 })
  })

  it('does not roll back the date change when a reissue fails', async () => {
    const deps = makeDeps({
      reissueTicket: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    })

    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)

    // The claim is the only write, it already happened, and nothing undoes it.
    expect(deps.claimReschedule).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ...RESCHEDULED, reissued: 1, reissueFailed: 1 })
  })

  it('does not roll back or abort the loop when a reissue THROWS', async () => {
    const deps = makeDeps({
      findReissueOrderIds: vi.fn().mockResolvedValue(['1', '2', '3']),
      reissueTicket: vi
        .fn()
        .mockRejectedValueOnce(new Error('brevo exploded'))
        .mockResolvedValue(true),
    })

    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)

    // Order 1 blew up; orders 2 and 3 still got their ticket, and the admin still
    // gets a 'rescheduled' result rather than an exception on a committed move.
    expect(deps.reissueTicket).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ ...RESCHEDULED, reissued: 2, reissueFailed: 1 })
  })

  it('still reports the completed move when the reissue lookup itself fails', async () => {
    const deps = makeDeps({
      findReissueOrderIds: vi.fn().mockRejectedValue(new Error('db gone')),
    })
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(result).toEqual({ ...RESCHEDULED, reissued: 0, reissueFailed: 0 })
    expect(deps.reissueTicket).not.toHaveBeenCalled()
  })
})

describe('previewReschedule', () => {
  it('returns current date, count + up to 5 sample emails without writing', async () => {
    const buyers = Array.from({ length: 7 }, (_, i) => buyer({ orderId: String(i), email: `b${i}@x.hr` }))
    const deps = makeDeps({ findBuyers: vi.fn().mockResolvedValue(buyers) })
    const result = await previewReschedule('7', deps)
    expect(result.currentDate).toBe('2026-06-22')
    expect(result.time).toBe('21:00')
    expect(result.buyerCount).toBe(7)
    expect(result.sampleEmails).toHaveLength(5)
    expect(deps.claimReschedule).not.toHaveBeenCalled()
  })

  it('throws when the show does not exist', async () => {
    const deps = makeDeps({ getShow: vi.fn().mockResolvedValue(null) })
    await expect(previewReschedule('x', deps)).rejects.toThrow('Show not found')
  })
})
