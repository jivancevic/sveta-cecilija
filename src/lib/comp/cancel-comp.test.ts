import { describe, it, expect, vi } from 'vitest'
import { cancelComp, CancelCompError, type CancelCompDeps, type CancelCompOrder } from './cancel-comp'

// Fresh spies per call so we can assert which void path ran. Defaults model a
// comp order whose whole-order void cancels 3 tickets and single-ticket void 1.
function deps(
  over: Partial<{
    order: CancelCompOrder | null
    ticketOrderId: string | null
    orderVoided: number
    ticketVoided: number
  }> = {},
): CancelCompDeps & {
  loadOrder: ReturnType<typeof vi.fn>
  ticketOrderId: ReturnType<typeof vi.fn>
  voidOrder: ReturnType<typeof vi.fn>
  voidTicket: ReturnType<typeof vi.fn>
} {
  return {
    loadOrder: vi.fn().mockResolvedValue(
      'order' in over ? over.order : ({ channel: 'comp' } satisfies CancelCompOrder),
    ),
    ticketOrderId: vi.fn().mockResolvedValue('ticketOrderId' in over ? over.ticketOrderId : 'ord_1'),
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
    const d = deps({ ticketOrderId: 'ord_1' })
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
    const d = deps({ ticketOrderId: 'ord_OTHER' })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'ticket', ticketId: 't_9' } }, d),
    ).rejects.toMatchObject({ code: 'TICKET_NOT_IN_ORDER' })
    expect(d.voidTicket).not.toHaveBeenCalled()
  })

  it('rejects an unknown ticket id with TICKET_NOT_IN_ORDER', async () => {
    const d = deps({ ticketOrderId: null })
    await expect(
      cancelComp({ orderId: 'ord_1', target: { kind: 'ticket', ticketId: 't_x' } }, d),
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
