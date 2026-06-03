import { describe, it, expect, vi } from 'vitest'
import {
  moveShowToZimsko,
  previewVenueMove,
  type MoveToZimskoDeps,
  type VenueChangeShow,
  type VenueChangeBuyer,
} from './venue-change'

function show(overrides: Partial<VenueChangeShow> = {}): VenueChangeShow {
  return {
    id: '7',
    date: '2026-07-15',
    time: '21:00',
    venue: 'ljetno-kino',
    venueChangedAt: null,
    ...overrides,
  }
}

function buyer(overrides: Partial<VenueChangeBuyer> = {}): VenueChangeBuyer {
  return { orderId: '1', name: 'Ana', email: 'ana@example.com', locale: 'en', ...overrides }
}

function makeDeps(overrides: Partial<MoveToZimskoDeps> = {}): MoveToZimskoDeps {
  return {
    getShow: vi.fn().mockResolvedValue(show()),
    findBuyers: vi.fn().mockResolvedValue([buyer({ orderId: '1' }), buyer({ orderId: '2', email: 'b@x.hr', locale: 'hr' })]),
    claimMove: vi.fn().mockResolvedValue(true),
    sendVenueChangeEmail: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('moveShowToZimsko', () => {
  it('claims the move then emails every buyer', async () => {
    const deps = makeDeps()
    const result = await moveShowToZimsko({ showId: '7', userId: '3' }, deps)
    expect(deps.claimMove).toHaveBeenCalledWith('7', '3')
    expect(deps.sendVenueChangeEmail).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ status: 'moved', total: 2, sent: 2, failed: 0 })
  })

  it('claims BEFORE sending so a lost race never double-notifies', async () => {
    const order: string[] = []
    const deps = makeDeps({
      claimMove: vi.fn(async () => { order.push('claim'); return true }),
      sendVenueChangeEmail: vi.fn(async () => { order.push('send'); return true }),
    })
    await moveShowToZimsko({ showId: '7', userId: '3' }, deps)
    expect(order[0]).toBe('claim')
  })

  it('is a no-op when the show is already marked moved', async () => {
    const deps = makeDeps({ getShow: vi.fn().mockResolvedValue(show({ venueChangedAt: '2026-07-14T18:00:00Z' })) })
    const result = await moveShowToZimsko({ showId: '7', userId: '3' }, deps)
    expect(result).toEqual({ status: 'already-moved', venueChangedAt: '2026-07-14T18:00:00Z' })
    expect(deps.claimMove).not.toHaveBeenCalled()
    expect(deps.sendVenueChangeEmail).not.toHaveBeenCalled()
  })

  it('does not move a natively-Zimsko show', async () => {
    const deps = makeDeps({ getShow: vi.fn().mockResolvedValue(show({ venue: 'zimsko-kino' })) })
    const result = await moveShowToZimsko({ showId: '7', userId: '3' }, deps)
    expect(result).toEqual({ status: 'not-applicable', venue: 'zimsko-kino' })
    expect(deps.sendVenueChangeEmail).not.toHaveBeenCalled()
  })

  it('reports already-moved (no send) when the atomic claim loses the race', async () => {
    const deps = makeDeps({ claimMove: vi.fn().mockResolvedValue(false) })
    const result = await moveShowToZimsko({ showId: '7', userId: '3' }, deps)
    expect(result).toEqual({ status: 'already-moved', venueChangedAt: null })
    expect(deps.sendVenueChangeEmail).not.toHaveBeenCalled()
  })

  it('counts partial send failures', async () => {
    const deps = makeDeps({
      sendVenueChangeEmail: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    })
    const result = await moveShowToZimsko({ showId: '7', userId: '3' }, deps)
    expect(result).toEqual({ status: 'moved', total: 2, sent: 1, failed: 1 })
  })

  it('throws when the show does not exist', async () => {
    const deps = makeDeps({ getShow: vi.fn().mockResolvedValue(null) })
    await expect(moveShowToZimsko({ showId: 'x', userId: '3' }, deps)).rejects.toThrow('Show not found')
  })
})

describe('previewVenueMove', () => {
  it('returns count + up to 5 sample emails without writing', async () => {
    const buyers = Array.from({ length: 7 }, (_, i) => buyer({ orderId: String(i), email: `b${i}@x.hr` }))
    const deps = makeDeps({ findBuyers: vi.fn().mockResolvedValue(buyers) })
    const result = await previewVenueMove('7', deps)
    expect(result.buyerCount).toBe(7)
    expect(result.sampleEmails).toHaveLength(5)
    expect(result.alreadyMoved).toBe(false)
    expect(deps.claimMove).not.toHaveBeenCalled()
  })

  it('flags an already-moved show', async () => {
    const deps = makeDeps({ getShow: vi.fn().mockResolvedValue(show({ venueChangedAt: '2026-07-14T18:00:00Z' })) })
    const result = await previewVenueMove('7', deps)
    expect(result.alreadyMoved).toBe(true)
    expect(result.venueChangedAt).toBe('2026-07-14T18:00:00Z')
  })
})
