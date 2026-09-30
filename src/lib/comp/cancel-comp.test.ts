import { describe, it, expect, vi } from 'vitest'
import {
  cancelComp,
  CancelCompError,
  compVoidCounts,
  type CancelCompDeps,
  type CancelCompOrder,
} from './cancel-comp'

// Fresh spies per call so we can assert which void path ran. Defaults model a
// comp order whose whole-order void cancels 3 tickets and single-ticket void 1.
function deps(
  over: Partial<{
    order: CancelCompOrder | null
    ticket: { orderId: string; scanned: boolean } | null
    orderVoided: number
    ticketVoided: number
  }> = {},
): CancelCompDeps & {
  loadOrder: ReturnType<typeof vi.fn>
  loadTicket: ReturnType<typeof vi.fn>
  voidOrder: ReturnType<typeof vi.fn>
  voidTicket: ReturnType<typeof vi.fn>
} {
  return {
    loadOrder: vi.fn().mockResolvedValue(
      'order' in over ? over.order : ({ channel: 'comp' } satisfies CancelCompOrder),
    ),
    loadTicket: vi
      .fn()
      .mockResolvedValue('ticket' in over ? over.ticket : { orderId: 'ord_1', scanned: false }),
    voidOrder: vi.fn().mockResolvedValue(over.orderVoided ?? 3),
    voidTicket: vi.fn().mockResolvedValue(over.ticketVoided ?? 1),
  }
}

describe('cancelComp', () => {
  it('voids a whole comp order and reports the count', async () => {
    const d = deps()
    const res = await cancelComp({ orderId: 'ord_1', target: { kind: 'order' } }, d)
    expect(res).toEqual({ voided: 3 })
    expect(d.voidOrder).toHaveBeenCalledOnce()
    expect(d.voidTicket).not.toHaveBeenCalled()
  })

  it('voids a single comp ticket that belongs to the order', async () => {
    const d = deps({ ticket: { orderId: 'ord_1', scanned: false } })
    const res = await cancelComp({ orderId: 'ord_1', target: { kind: 'ticket', ticketId: 't_9' } }, d)
    expect(res).toEqual({ voided: 1 })
    expect(d.voidTicket).toHaveBeenCalledWith('t_9')
    expect(d.voidOrder).not.toHaveBeenCalled()
  })

  it('refuses a paid ONLINE order (protects seats from a no-refund void)', async () => {
    const d = deps({ order: { channel: 'online' } })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'order' } }, d),
    ).rejects.toMatchObject({ code: 'NOT_A_COMP' })
    expect(d.voidOrder).not.toHaveBeenCalled()
  })

  it('refuses a PARTNER order (it has its own storno path)', async () => {
    const d = deps({ order: { channel: 'partner' } })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'order' } }, d),
    ).rejects.toMatchObject({ code: 'NOT_A_COMP' })
    expect(d.voidOrder).not.toHaveBeenCalled()
  })

  it('rejects an unknown order with ORDER_NOT_FOUND', async () => {
    const d = deps({ order: null })
    await expect(
      cancelComp({ orderId: 'ghost', target: { kind: 'order' } }, d),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })

  it('rejects a ticket that belongs to another order with TICKET_NOT_IN_ORDER', async () => {
    const d = deps({ ticket: { orderId: 'ord_OTHER', scanned: false } })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'ticket', ticketId: 't_9' } }, d),
    ).rejects.toMatchObject({ code: 'TICKET_NOT_IN_ORDER' })
    expect(d.voidTicket).not.toHaveBeenCalled()
  })

  it('rejects an unknown ticket id with TICKET_NOT_IN_ORDER', async () => {
    const d = deps({ ticket: null })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'ticket', ticketId: 't_x' } }, d),
    ).rejects.toMatchObject({ code: 'TICKET_NOT_IN_ORDER' })
  })

  // #701: a scanned comp is somebody who came in. Voiding it would rewrite the
  // evening's "ušlo X od Y" after the fact, so the refusal is the domain's and
  // every screen inherits it.
  it('refuses a SCANNED ticket with TICKET_SCANNED and voids nothing', async () => {
    const d = deps({ ticket: { orderId: 'ord_1', scanned: true } })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'ticket', ticketId: 't_9' } }, d),
    ).rejects.toMatchObject({ code: 'TICKET_SCANNED' })
    expect(d.voidTicket).not.toHaveBeenCalled()
  })

  it('checks the ticket belongs to the order before saying it is scanned', async () => {
    const d = deps({ ticket: { orderId: 'ord_OTHER', scanned: true } })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'ticket', ticketId: 't_9' } }, d),
    ).rejects.toMatchObject({ code: 'TICKET_NOT_IN_ORDER' })
  })

  it('maps a no-op void (already cancelled) to NOTHING_TO_VOID', async () => {
    const d = deps({ orderVoided: 0 })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'order' } }, d),
    ).rejects.toMatchObject({ code: 'NOTHING_TO_VOID' })
  })

  it('throws a typed CancelCompError instance', async () => {
    const d = deps({ order: null })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'order' } }, d),
    ).rejects.toBeInstanceOf(CancelCompError)
  })
})

describe('compVoidCounts (#701)', () => {
  it('counts only active tickets, splitting the scanned ones out', () => {
    expect(
      compVoidCounts([
        { cancelled: false, scanned: false },
        { cancelled: false, scanned: false },
        { cancelled: false, scanned: true },
        { cancelled: true, scanned: false },
        { cancelled: true, scanned: true },
      ]),
    ).toEqual({ voidable: 2, keptScanned: 1 })
  })

  it('is zero on an empty or fully voided order', () => {
    expect(compVoidCounts([])).toEqual({ voidable: 0, keptScanned: 0 })
    expect(compVoidCounts([{ cancelled: true, scanned: false }])).toEqual({
      voidable: 0,
      keptScanned: 0,
    })
  })
})
