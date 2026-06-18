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
    ...overrides,
  }
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
    expect(result).toEqual({ status: 'rescheduled', oldDate: '2026-06-22', newDate: '2026-06-23', total: 2, sent: 2, failed: 0 })
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
  })

  it('reports date-mismatch (no send) when the atomic claim loses the race', async () => {
    const deps = makeDeps({ claimReschedule: vi.fn().mockResolvedValue(false) })
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(result).toEqual({ status: 'date-mismatch' })
    expect(deps.sendDateChangeEmail).not.toHaveBeenCalled()
  })

  it('counts partial send failures', async () => {
    const deps = makeDeps({
      sendDateChangeEmail: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    })
    const result = await rescheduleShow({ showId: '7', userId: '3', newDate: '2026-06-23' }, deps)
    expect(result).toEqual({ status: 'rescheduled', oldDate: '2026-06-22', newDate: '2026-06-23', total: 2, sent: 1, failed: 1 })
  })

  it('throws when the show does not exist', async () => {
    const deps = makeDeps({ getShow: vi.fn().mockResolvedValue(null) })
    await expect(rescheduleShow({ showId: 'x', userId: '3', newDate: '2026-06-23' }, deps)).rejects.toThrow('Show not found')
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
