import { describe, it, expect, vi } from 'vitest'
import { voidOrderTickets } from './ticket-void'

describe('voidOrderTickets', () => {
  it('voids all active tickets with the given reason and returns the count', async () => {
    const atomicVoidActiveTickets = vi.fn().mockResolvedValue(3)
    const result = await voidOrderTickets('ord_1', 'refund', { atomicVoidActiveTickets })
    expect(result).toEqual({ voided: 3 })
    expect(atomicVoidActiveTickets).toHaveBeenCalledWith('ord_1', 'refund')
  })

  it('is idempotent: voiding an already-cancelled order is a no-op (0 voided)', async () => {
    const atomicVoidActiveTickets = vi.fn().mockResolvedValue(0)
    const result = await voidOrderTickets('ord_1', 'refund', { atomicVoidActiveTickets })
    expect(result).toEqual({ voided: 0 })
  })

  it('passes the storno reason through', async () => {
    const atomicVoidActiveTickets = vi.fn().mockResolvedValue(1)
    await voidOrderTickets('ord_1', 'storno', { atomicVoidActiveTickets })
    expect(atomicVoidActiveTickets).toHaveBeenCalledWith('ord_1', 'storno')
  })
})
