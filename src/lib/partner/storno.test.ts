import { describe, it, expect, vi } from 'vitest'
import { performStorno, isSameZagrebDay, StornoError, type StornoDeps } from './storno'

// Helpers wiring fresh spies per call so we can assert which void path ran.
function deps(over: Partial<{ order: number; ticket: number }> = {}): StornoDeps & {
  voidOrder: ReturnType<typeof vi.fn>
  voidTicket: ReturnType<typeof vi.fn>
} {
  return {
    voidOrder: vi.fn().mockResolvedValue(over.order ?? 4),
    voidTicket: vi.fn().mockResolvedValue(over.ticket ?? 1),
  }
}

describe('isSameZagrebDay', () => {
  it('treats two instants on the same Zagreb calendar day as same-day', () => {
    // Both 2026-07-12 in Zagreb (UTC+2 in summer).
    expect(isSameZagrebDay('2026-07-12T08:00:00Z', '2026-07-12T20:00:00Z')).toBe(true)
  })

  it('around Zagreb midnight: a 23:50 sale and 23:59 attempt are same-day', () => {
    // Summer UTC+2: 23:50 Zagreb = 21:50Z, 23:59 Zagreb = 21:59Z, both 2026-07-12.
    const sale = '2026-07-12T21:50:00Z'
    const attempt = '2026-07-12T21:59:00Z'
    expect(isSameZagrebDay(sale, attempt)).toBe(true)
  })

  it('around Zagreb midnight: a 23:30 sale and 00:10 next-day attempt are NOT same-day', () => {
    // 23:30 Zagreb 12 Jul = 21:30Z 12 Jul; 00:10 Zagreb 13 Jul = 22:10Z 12 Jul.
    const sale = '2026-07-12T21:30:00Z'
    const attempt = '2026-07-12T22:10:00Z'
    expect(isSameZagrebDay(sale, attempt)).toBe(false)
  })

  it('DST spring-forward day (2026-03-29): instants before and after the jump are same Zagreb day', () => {
    // Croatia springs forward 01:00->03:00 UTC at 2026-03-29 01:00Z.
    // 00:30Z = 01:30 Zagreb (CET, UTC+1); 12:00Z = 14:00 Zagreb (CEST, UTC+2).
    // Both are 2026-03-29 in Zagreb despite the offset change.
    expect(isSameZagrebDay('2026-03-29T00:30:00Z', '2026-03-29T12:00:00Z')).toBe(true)
  })

  it('DST spring-forward boundary: 23:30 the prior day vs after-midnight is NOT same-day', () => {
    // 2026-03-28 23:30 Zagreb (CET, UTC+1) = 22:30Z; 2026-03-29 12:00 Zagreb = 11:00Z.
    expect(isSameZagrebDay('2026-03-28T22:30:00Z', '2026-03-29T11:00:00Z')).toBe(false)
  })

  it('DST fall-back day (2026-10-25): instants spanning the repeated hour are same Zagreb day', () => {
    // Croatia falls back 03:00->02:00 at 2026-10-25 01:00Z.
    // 00:30Z = 02:30 Zagreb (CEST, UTC+2); 12:00Z = 13:00 Zagreb (CET, UTC+1).
    expect(isSameZagrebDay('2026-10-25T00:30:00Z', '2026-10-25T12:00:00Z')).toBe(true)
  })
})

describe('performStorno — partner ownership', () => {
  it('lets a partner storno its OWN same-day order', async () => {
    const d = deps()
    const res = await performStorno(
      {
        orderCreatedAt: '2026-07-12T09:00:00Z',
        now: '2026-07-12T10:00:00Z',
        actor: { kind: 'partner', partnerId: 7 },
        orderPartnerId: 7,
        target: { kind: 'order' },
      },
      d,
    )
    expect(res).toEqual({ voided: 4 })
    expect(d.voidOrder).toHaveBeenCalledOnce()
    expect(d.voidTicket).not.toHaveBeenCalled()
  })

  it('matches owner across number/string id types', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'partner', partnerId: '7' },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ voided: 4 })
  })

  it('blocks a partner stornoing ANOTHER partner’s order with NOT_OWNER', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 8,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' })
    expect(d.voidOrder).not.toHaveBeenCalled()
  })

  it('blocks a partner on an order with no owner (online channel) with NOT_OWNER', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: null,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' })
  })

  it('a partner cannot storno a comp (partner-less) order — NOT_OWNER (ADR-0019, #321)', async () => {
    // Comp orders carry member attribution, never a partner, so orderPartnerId is
    // null: the partner self-service path can never reach a comp.
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: null,
          target: { kind: 'ticket', ticketId: 't_comp' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' })
    expect(d.voidTicket).not.toHaveBeenCalled()
  })
})

describe('performStorno — partner same-day window', () => {
  it('allows a 23:50 sale stornoed at 23:59 the same Zagreb day', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T21:50:00Z',
          now: '2026-07-12T21:59:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ voided: 4 })
  })

  it('blocks a 23:30 sale stornoed at 00:10 the next Zagreb day with WINDOW_CLOSED', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T21:30:00Z',
          now: '2026-07-12T22:10:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'WINDOW_CLOSED' })
    expect(d.voidOrder).not.toHaveBeenCalled()
  })

  it('checks ownership BEFORE the window (other-partner next-day → NOT_OWNER, not WINDOW_CLOSED)', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T21:30:00Z',
          now: '2026-07-13T22:10:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 8,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' })
  })

  it('allows a partner storno on a DST-transition day', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-03-29T00:30:00Z',
          now: '2026-03-29T12:00:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ voided: 4 })
  })
})

describe('performStorno — admin anytime', () => {
  it('lets an admin storno any order with NO window (months later)', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-01-01T09:00:00Z',
          now: '2026-09-01T09:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: 8,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ voided: 4 })
  })

  it('lets an admin storno an order that has no partner', async () => {
    const d = deps()
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-01-01T09:00:00Z',
          now: '2026-09-01T09:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: null,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ voided: 4 })
  })
})

describe('performStorno — per-ticket vs whole-sale', () => {
  it('voids a single ticket when target is a ticket', async () => {
    const d = deps({ ticket: 1 })
    const res = await performStorno(
      {
        orderCreatedAt: '2026-07-12T09:00:00Z',
        now: '2026-07-12T10:00:00Z',
        actor: { kind: 'partner', partnerId: 7 },
        orderPartnerId: 7,
        target: { kind: 'ticket', ticketId: 'tk_9' },
      },
      d,
    )
    expect(res).toEqual({ voided: 1 })
    expect(d.voidTicket).toHaveBeenCalledWith('tk_9')
    expect(d.voidOrder).not.toHaveBeenCalled()
  })
})

describe('performStorno — nothing to void', () => {
  it('throws NOTHING_TO_VOID when an already-cancelled order voids 0', async () => {
    const d = deps({ order: 0 })
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'NOTHING_TO_VOID' })
  })

  it('throws NOTHING_TO_VOID when a single ticket voids 0 (already cancelled / unknown)', async () => {
    const d = deps({ ticket: 0 })
    await expect(
      performStorno(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 7,
          target: { kind: 'ticket', ticketId: 'tk_9' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'NOTHING_TO_VOID' })
  })

  it('exposes a typed StornoError instance', async () => {
    const d = deps({ order: 0 })
    try {
      await performStorno(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      )
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(StornoError)
    }
  })
})
