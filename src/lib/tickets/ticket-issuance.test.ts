import { describe, it, expect, vi } from 'vitest'
import { issueTickets, type IssueTicketsInput } from './ticket-issuance'

const deps = { generateOrderCode: vi.fn().mockResolvedValue('AB23') }

function input(overrides: Partial<IssueTicketsInput> = {}): IssueTicketsInput {
  return {
    show: { id: 7 },
    channel: 'online',
    adults: 2,
    children: 1,
    locale: 'en',
    ...overrides,
  }
}

describe('issueTickets', () => {
  it('creates one typed ticket per person, adults first then children', async () => {
    const order = await issueTickets(input({ adults: 2, children: 1 }), deps)
    expect(order.tickets).toEqual([
      { type: 'adult', ref: 'AB23-1' },
      { type: 'adult', ref: 'AB23-2' },
      { type: 'child', ref: 'AB23-3' },
    ])
    expect(order.adultCount).toBe(2)
    expect(order.childCount).toBe(1)
    expect(order.code).toBe('AB23')
  })

  it('applies the online 5-for-4 promo to the total', async () => {
    // 5 adults: 1 free @ €20 → €80 → 8000 cents
    const order = await issueTickets(input({ adults: 5, children: 0 }), deps)
    expect(order.totalCents).toBe(8000)
    expect(order.tickets).toHaveLength(5)
  })

  it('values the free ticket at the adult price when the party mixes adults and children', async () => {
    // 4 adults + 1 child = 5 → 1 free @ €20; subtotal €90 − €20 = €70 → 7000
    const order = await issueTickets(input({ adults: 4, children: 1 }), deps)
    expect(order.totalCents).toBe(7000)
  })

  it('charges partner sales at flat face value with no promo', async () => {
    // 5 adults at the partner channel: no discount → €100 → 10000 cents
    const order = await issueTickets(
      input({ channel: 'partner', adults: 5, children: 0, partnerId: 3, buyer: null }),
      deps,
    )
    expect(order.totalCents).toBe(10000)
    expect(order.channel).toBe('partner')
    expect(order.partnerId).toBe(3)
    expect(order.tickets).toHaveLength(5)
  })

  it('issues comp tickets for free (total=0) regardless of party size and carries the member id', async () => {
    const order = await issueTickets(
      input({ channel: 'comp', adults: 3, children: 2, memberId: 9, buyer: { name: 'Ivo', email: null } }),
      deps,
    )
    expect(order.channel).toBe('comp')
    expect(order.totalCents).toBe(0)
    expect(order.memberId).toBe(9)
    expect(order.partnerId).toBeNull()
    expect(order.buyerName).toBe('Ivo')
    expect(order.tickets).toHaveLength(5)
  })

  it('defaults memberId to null on non-comp orders', async () => {
    const order = await issueTickets(input(), deps)
    expect(order.memberId).toBeNull()
  })

  it('carries buyer PII through online; leaves it null for an anonymous partner sale', async () => {
    const online = await issueTickets(
      input({ buyer: { name: 'Ana Anić', email: 'ana@example.com' } }),
      deps,
    )
    expect(online.buyerName).toBe('Ana Anić')
    expect(online.email).toBe('ana@example.com')

    const partner = await issueTickets(input({ channel: 'partner', partnerId: 1, buyer: null }), deps)
    expect(partner.buyerName).toBeNull()
    expect(partner.email).toBeNull()
    expect(partner.partnerId).toBe(1)
  })

  it('defaults partnerId to null on online orders', async () => {
    const order = await issueTickets(input(), deps)
    expect(order.partnerId).toBeNull()
    expect(order.showId).toBe(7)
    expect(order.locale).toBe('en')
  })

  it('rejects an empty order', async () => {
    await expect(issueTickets(input({ adults: 0, children: 0 }), deps)).rejects.toThrow(
      /at least one ticket/,
    )
  })

  it('rejects negative or non-integer quantities', async () => {
    await expect(issueTickets(input({ adults: -1 }), deps)).rejects.toThrow(/non-negative integers/)
    await expect(issueTickets(input({ children: 2.5 }), deps)).rejects.toThrow(/non-negative integers/)
  })
})
