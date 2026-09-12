import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { CancelShowDeps } from '@/lib/show-cancel'

// The orchestration itself is unit-tested in src/lib/show-cancel.test.ts. What
// is exercised here is everything the ROUTE owns and the seam cannot see:
//   * the permission the money half is gated on (`refunds`, not `tickets`);
//   * the wiring of each dep to the real engines — in particular that the
//     shared refund engine's own "your refund of €X" email is REPLACED, so a
//     cancelled evening produces one honest message instead of two, and that
//     partner/comp seats are voided as 'storno' (which is what takes them off
//     the monthly statement) rather than 'refund';
//   * the roster push, which no Payload hook fires for because the cancel is a
//     raw `UPDATE … RETURNING` claim (#441);
//   * the test-send path, which bypasses the seam and needs its own #409 gate.

const cancelShow = vi.fn<(...a: unknown[]) => Promise<{ status: string; notified: number }>>(async () => ({
  status: 'cancelled',
  notified: 2,
}))
const previewCancel = vi.fn<(...a: unknown[]) => Promise<{ alreadyCancelled: boolean; toNotify: number }>>(
  async () => ({ alreadyCancelled: false, toNotify: 2 }),
)
const refundOrder = vi.fn<(...a: unknown[]) => Promise<{ refunded: boolean; amountCents: number }>>(async () => ({
  refunded: true,
  amountCents: 4000,
}))
const voidOrderTickets = vi.fn<(...a: unknown[]) => Promise<{ voided: number }>>(async () => ({ voided: 2 }))
const sendShowCancelledEmail = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true)
const recordCriticalEvent = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {})
const poolQuery = vi.fn<(...a: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(async () => ({
  rows: [],
}))
const pushQuery = vi.fn()
const send = vi.fn(async () => ({ recipients: 1, devices: 1, delivered: 1, dead: 0, failed: 0 }))
const release = vi.fn(async () => {})
const requirePermission = vi.fn<(...a: unknown[]) => Promise<Record<string, unknown>>>(async () => ({
  payload: { db: { pool: { query: poolQuery }, drizzle: { execute: vi.fn() } } },
  user: { id: 8, email: 'tatjana@moreska.eu' },
  error: null,
}))

vi.mock('@/lib/access/route-guard', () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...(args as [])),
}))
vi.mock('@/lib/show-cancel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/show-cancel')>()
  return {
    ...actual,
    cancelShow: (...args: unknown[]) => cancelShow(...(args as [])),
    previewCancel: (...args: unknown[]) => previewCancel(...(args as [])),
  }
})
vi.mock('@/lib/refund-order', () => ({ refundOrder: (...args: unknown[]) => refundOrder(...(args as [])) }))
vi.mock('@/lib/refund/build-refund-order-deps', () => ({
  buildRefundOrderDeps: () => ({ sendRefundEmail: vi.fn(async () => {}) }),
}))
vi.mock('@/lib/tickets/ticket-void', () => ({
  voidOrderTickets: (...args: unknown[]) => voidOrderTickets(...(args as [])),
}))
vi.mock('@/lib/email/send-show-cancelled-email', () => ({
  sendShowCancelledEmail: (...args: unknown[]) => sendShowCancelledEmail(...(args as [])),
}))
vi.mock('@/lib/critical-events/record', () => ({
  recordCriticalEvent: (...args: unknown[]) => recordCriticalEvent(...(args as [])),
}))
vi.mock('@/lib/push/push-data', () => ({
  createPushDeps: () => ({
    query: pushQuery,
    loadAttendance: async () => [],
    loadMoreskanti: async () => [],
    loadUserIdsByMember: async () => new Map(),
    loadVoditeljUserIds: async () => [],
    send,
    release,
  }),
}))

import { GET, POST } from './route'

const showRow = (over: Record<string, unknown> = {}) => ({
  id: 7,
  date: new Date('2026-08-05T12:00:00.000Z'),
  time: '21:00',
  kind: 'redovna',
  is_public: true,
  venue: 'ljetno-kino',
  location: null,
  status: 'active',
  voditelj_note: null,
  updated_at: new Date('2026-07-01T10:00:00.000Z'),
  ...over,
})

const params = { params: Promise.resolve({ id: '7' }) }

const post = (body: Record<string, unknown> = {}) =>
  new NextRequest('http://localhost/api/shows/7/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** The deps object the route built and handed to the seam. */
function builtDeps(): CancelShowDeps {
  return cancelShow.mock.calls[0][1] as unknown as CancelShowDeps
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BREVO_API_KEY = 'test-key'
  pushQuery.mockResolvedValue({ rows: [showRow()] })
  poolQuery.mockResolvedValue({ rows: [showRow()] })
})

describe('POST /api/shows/[id]/cancel', () => {
  it('is gated on `refunds`, because it moves money', async () => {
    await POST(post(), params)
    expect(requirePermission.mock.calls[0][1]).toBe('refunds')
  })

  it('returns 500 without a Brevo key rather than cancelling silently', async () => {
    delete process.env.BREVO_API_KEY
    const res = await POST(post(), params)
    expect(res.status).toBe(500)
    expect(cancelShow).not.toHaveBeenCalled()
  })

  it('tells the roster, which no Payload hook does for a raw claim', async () => {
    const res = await POST(post(), params)
    expect(res.status).toBe(200)
    expect(cancelShow).toHaveBeenCalledOnce()
    // Before-row read, then the after-row read inside notifyRawPerformanceSave.
    expect(pushQuery.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('maps a missing show to 404 and any other failure to 400', async () => {
    cancelShow.mockRejectedValueOnce(new Error('Show not found'))
    expect((await POST(post(), params)).status).toBe(404)
    cancelShow.mockRejectedValueOnce(new Error('This is not a public performance, so ticket actions do not apply to it.'))
    expect((await POST(post(), params)).status).toBe(400)
  })
})

describe('the deps the route wires', () => {
  it('refunds through the shared engine with its own refund email replaced', async () => {
    await POST(post(), params)
    const result = await builtDeps().refundOnlineOrder('12')

    expect(result).toEqual({ refunded: true, amountCents: 4000 })
    expect(refundOrder).toHaveBeenCalledOnce()
    const [input, deps] = refundOrder.mock.calls[0] as unknown as [
      { orderId: string },
      { sendRefundEmail: () => Promise<void> },
    ]
    expect(input).toEqual({ orderId: '12' })
    // The engine's generic "your refund of €X" would arrive alongside the
    // cancellation notice and explain nothing; the override makes it a no-op.
    await expect(deps.sendRefundEmail()).resolves.toBeUndefined()
    expect(sendShowCancelledEmail).not.toHaveBeenCalled()
  })

  it('voids partner and comp seats as a storno, so they leave the statement', async () => {
    await POST(post(), params)
    const voided = await builtDeps().voidTickets('12')

    expect(voided).toBe(2)
    expect(voidOrderTickets.mock.calls[0][1]).toBe('12')
    expect(voidOrderTickets.mock.calls[0][2]).toBe('storno')
  })

  it('stamps cancel_notified_at on the order it just mailed', async () => {
    await POST(post(), params)
    poolQuery.mockClear()
    await builtDeps().markNotified('12')

    const [sql, args] = poolQuery.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/UPDATE orders SET cancel_notified_at = NOW\(\) WHERE id = \$1/)
    expect(args).toEqual([12])
  })

  it('claims the cancellation only while the row is still active', async () => {
    await POST(post(), params)
    poolQuery.mockClear()
    poolQuery.mockResolvedValue({ rows: [{ id: 7 }] })
    const claimed = await builtDeps().claimCancel('7', '8')

    expect(claimed).toBe(true)
    const [sql] = poolQuery.mock.calls[0] as unknown as [string]
    expect(sql).toMatch(/status = 'cancelled'/)
    expect(sql).toMatch(/WHERE id = \$1 AND status <> 'cancelled'/)
  })

  it('reads the show row through the #409 gate and normalises the pg Date', async () => {
    await POST(post(), params)
    poolQuery.mockResolvedValue({ rows: [showRow({ status: 'cancelled' })] })
    const row = await builtDeps().getShow('7')

    expect(row).toEqual({
      id: '7',
      isPublic: true,
      date: '2026-08-05',
      time: '21:00',
      venue: 'ljetno-kino',
      cancelled: true,
    })
  })

  it('maps an order row, keeping an empty email as "nobody to write to"', async () => {
    await POST(post(), params)
    poolQuery.mockResolvedValue({
      rows: [
        {
          id: 3,
          channel: 'partner',
          buyer_name: null,
          email: '',
          locale: null,
          total: '6000',
          adult_count: '2',
          child_count: '1',
          refund_status: 'none',
          cancel_notified_at: null,
        },
      ],
    })
    const [row] = await builtDeps().findOrders('7')

    expect(row).toEqual({
      orderId: '3',
      channel: 'partner',
      buyerName: '',
      email: null,
      locale: null,
      totalCents: 6000,
      seats: 3,
      refunded: false,
      notified: false,
    })
  })
})

describe('POST { test: true }', () => {
  it('sends the EN + HR notice to the caller and writes nothing', async () => {
    const res = await POST(post({ test: true }), params)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'test-sent', to: 'tatjana@moreska.eu' })
    expect(sendShowCancelledEmail).toHaveBeenCalledTimes(2)
    expect(sendShowCancelledEmail.mock.calls.map((c) => (c[0] as { locale: string }).locale)).toEqual(['en', 'hr'])
    // The online buyer's version: the only one that carries money and therefore
    // the only one worth proofreading.
    expect(sendShowCancelledEmail.mock.calls[0][0]).toMatchObject({ mode: 'refund', orderId: 'TEST' })
    expect(cancelShow).not.toHaveBeenCalled()
  })

  it('refuses a non-public performance, which bypasses the seam', async () => {
    poolQuery.mockResolvedValue({ rows: [showRow({ is_public: false })] })
    const res = await POST(post({ test: true }), params)

    expect(res.status).toBe(400)
    expect(sendShowCancelledEmail).not.toHaveBeenCalled()
  })
})

describe('GET /api/shows/[id]/cancel', () => {
  it('lets a `tickets` holder read what a cancellation would cost', async () => {
    const res = await GET(new NextRequest('http://localhost/api/shows/7/cancel'), params)

    expect(res.status).toBe(200)
    expect(requirePermission.mock.calls[0][1]).toEqual(['tickets', 'refunds'])
    expect(await res.json()).toMatchObject({ toNotify: 2 })
  })

  it('maps a missing show to 404', async () => {
    previewCancel.mockRejectedValueOnce(new Error('Show not found'))
    const res = await GET(new NextRequest('http://localhost/api/shows/7/cancel'), params)
    expect(res.status).toBe(404)
  })
})
