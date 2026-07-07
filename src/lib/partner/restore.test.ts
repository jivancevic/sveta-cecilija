import { describe, it, expect, vi } from 'vitest'
import { performRestore, RestoreError, SEAT_TAKEN, type RestoreDeps } from './restore'

// Fresh spy per call. `restore` defaults to a happy 4-ticket restore; override
// with a value, or pass a rejection to simulate seat-taken / unexpected errors.
function deps(over: { restore?: number | (() => Promise<number>) } = {}): RestoreDeps & {
  restore: ReturnType<typeof vi.fn>
} {
  const r = over.restore
  const impl =
    typeof r === 'function' ? r : async () => (typeof r === 'number' ? r : 4)
  return { restore: vi.fn(impl) }
}

describe('performRestore — partner ownership', () => {
  it('lets a partner undo its OWN same-day storno', async () => {
    const d = deps()
    const res = await performRestore(
      {
        orderCreatedAt: '2026-07-12T09:00:00Z',
        now: '2026-07-12T10:00:00Z',
        actor: { kind: 'partner', partnerId: 7 },
        orderPartnerId: 7,
        target: { kind: 'order' },
      },
      d,
    )
    expect(res).toEqual({ restored: 4 })
    expect(d.restore).toHaveBeenCalledOnce()
  })

  it('matches owner across number/string id types', async () => {
    const d = deps()
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'partner', partnerId: '7' },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ restored: 4 })
  })

  it('blocks a partner undoing ANOTHER partner’s order with NOT_OWNER', async () => {
    const d = deps()
    await expect(
      performRestore(
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
    expect(d.restore).not.toHaveBeenCalled()
  })

  it('blocks a partner on an order with no owner (online channel) with NOT_OWNER', async () => {
    const d = deps()
    await expect(
      performRestore(
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

  it('a partner cannot restore a comp (partner-less) order — NOT_OWNER (ADR-0019, #321)', async () => {
    // A comp voided by an admin must never be un-voided through the partner undo
    // path; orderPartnerId is null so ownership fails before any restore runs.
    const d = deps()
    await expect(
      performRestore(
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
    expect(d.restore).not.toHaveBeenCalled()
  })
})

describe('performRestore — partner same-day window', () => {
  it('allows a 23:50 storno undone at 23:59 the same Zagreb day', async () => {
    const d = deps()
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-07-12T21:50:00Z',
          now: '2026-07-12T21:59:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ restored: 4 })
  })

  it('blocks a next-Zagreb-day undo with WINDOW_CLOSED', async () => {
    const d = deps()
    await expect(
      performRestore(
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
    expect(d.restore).not.toHaveBeenCalled()
  })

  it('checks ownership BEFORE the window (other-partner next-day → NOT_OWNER)', async () => {
    const d = deps()
    await expect(
      performRestore(
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
})

describe('performRestore — admin anytime', () => {
  it('lets an admin undo any storno with NO window (months later)', async () => {
    const d = deps()
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-01-01T09:00:00Z',
          now: '2026-09-01T09:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: 8,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ restored: 4 })
  })

  it('lets an admin undo an order that has no partner', async () => {
    const d = deps()
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-01-01T09:00:00Z',
          now: '2026-09-01T09:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: null,
          target: { kind: 'order' },
        },
        d,
      ),
    ).resolves.toEqual({ restored: 4 })
  })
})

describe('performRestore — per-ticket target', () => {
  it('restores a single ticket when target is a ticket', async () => {
    const d = deps({ restore: 1 })
    const res = await performRestore(
      {
        orderCreatedAt: '2026-07-12T09:00:00Z',
        now: '2026-07-12T10:00:00Z',
        actor: { kind: 'partner', partnerId: 7 },
        orderPartnerId: 7,
        target: { kind: 'ticket', ticketId: 'tk_9' },
      },
      d,
    )
    expect(res).toEqual({ restored: 1 })
    expect(d.restore).toHaveBeenCalledOnce()
  })
})

describe('performRestore — seat retaken', () => {
  it('maps a SEAT_TAKEN sentinel string rejection to RestoreError SEAT_TAKEN', async () => {
    const d = deps({
      restore: async () => {
        throw SEAT_TAKEN
      },
    })
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'partner', partnerId: 7 },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'SEAT_TAKEN' })
  })

  it('maps a SEAT_TAKEN-coded error object to RestoreError SEAT_TAKEN', async () => {
    const d = deps({
      restore: async () => {
        throw Object.assign(new Error('boom'), { code: SEAT_TAKEN })
      },
    })
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'SEAT_TAKEN' })
  })

  it('re-throws an unexpected deps.restore error unchanged (not SEAT_TAKEN)', async () => {
    const boom = new Error('db exploded')
    const d = deps({
      restore: async () => {
        throw boom
      },
    })
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toBe(boom)
  })
})

describe('performRestore — nothing to restore', () => {
  it('throws NOTHING_TO_RESTORE when restore returns 0 (already active / unknown / refund void)', async () => {
    const d = deps({ restore: 0 })
    await expect(
      performRestore(
        {
          orderCreatedAt: '2026-07-12T09:00:00Z',
          now: '2026-07-12T10:00:00Z',
          actor: { kind: 'admin' },
          orderPartnerId: 7,
          target: { kind: 'order' },
        },
        d,
      ),
    ).rejects.toMatchObject({ code: 'NOTHING_TO_RESTORE' })
  })

  it('exposes a typed RestoreError instance', async () => {
    const d = deps({ restore: 0 })
    try {
      await performRestore(
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
      expect(e).toBeInstanceOf(RestoreError)
    }
  })
})
