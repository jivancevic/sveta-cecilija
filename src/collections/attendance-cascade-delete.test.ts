import { describe, expect, it, vi } from 'vitest'
import { Shows, cascadeShowAttendanceDelete } from './Shows'
import { Members, cascadeMemberAttendanceDelete } from './Members'

// The same regression guard `orders-cascade-delete.test.ts` carries, for the
// two relationships attendance adds (#422). Both FKs are ON DELETE SET NULL on
// NOT NULL columns — Payload's own shape, which db/schema mirrors and the drift
// gate enforces — so deleting a performance or a member that has answers throws
// unless the answers go first, in the same transaction.

describe.each([
  ['Shows', Shows, cascadeShowAttendanceDelete, 'performance'],
  ['Members', Members, cascadeMemberAttendanceDelete, 'member'],
] as const)('%s beforeDelete cascade', (_name, collection, hook, field) => {
  it('is wired as a beforeDelete hook', () => {
    expect(collection.hooks?.beforeDelete).toContain(hook)
  })

  it(`deletes the attendance rows that point at it, in the same transaction`, async () => {
    const del = vi.fn().mockResolvedValue({ docs: [] })
    const req = { payload: { delete: del }, transactionID: 'tx-1' }

    await hook({ req, id: 42, collection: {} as never, context: {} } as never)

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({
      collection: 'attendance',
      where: { [field]: { equals: 42 } },
      // Same req → same transaction: the answers and the row commit or roll
      // back together.
      req,
      overrideAccess: true,
    })
  })

  it('propagates a failure so the delete rolls back', async () => {
    const del = vi.fn().mockRejectedValue(new Error('boom'))
    const req = { payload: { delete: del }, transactionID: 'tx-2' }
    await expect(
      hook({ req, id: 7, collection: {} as never, context: {} } as never),
    ).rejects.toThrow('boom')
  })
})
