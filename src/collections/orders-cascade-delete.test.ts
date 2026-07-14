import { describe, expect, it, vi } from 'vitest'
import { Orders, cascadeOrderTicketsDelete } from './Orders'

// Regression guard for the "delete order errors in admin" bug. The DB FK is
// ON DELETE SET NULL on a NOT NULL column, so deleting an order that has
// tickets throws unless the tickets are removed first. The beforeDelete hook
// does exactly that, in the same transaction.

describe('Orders beforeDelete cascade', () => {
  it('is wired as an Orders beforeDelete hook', () => {
    expect(Orders.hooks?.beforeDelete).toContain(cascadeOrderTicketsDelete)
  })

  it("deletes the order's tickets in the same transaction (req passed) with overrideAccess", async () => {
    const del = vi.fn().mockResolvedValue({ docs: [] })
    const req = { payload: { delete: del }, transactionID: 'tx-1' }

    // Payload calls beforeDelete with the doc id being deleted.
    await cascadeOrderTicketsDelete({ req, id: 42, collection: {} as never, context: {} } as never)

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({
      collection: 'tickets',
      where: { order: { equals: 42 } },
      req, // same req → same transaction, so tickets + order commit/rollback together
      overrideAccess: true,
    })
  })

  it('propagates a ticket-delete failure so the order delete rolls back', async () => {
    const del = vi.fn().mockRejectedValue(new Error('boom'))
    const req = { payload: { delete: del }, transactionID: 'tx-2' }
    await expect(
      cascadeOrderTicketsDelete({ req, id: 7, collection: {} as never, context: {} } as never),
    ).rejects.toThrow('boom')
  })
})
